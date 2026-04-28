from datetime import datetime

from flask import Blueprint, jsonify, request

from app.auth import get_current_user, get_request_client_id, require_api_key
from app.extensions import db
from app.models import MemoryItem

memory_bp = Blueprint("memory", __name__)


@memory_bp.get("/memory")
@require_api_key
def list_memory():
    scope = (request.args.get("scope") or "").strip().lower()
    conversation_id = request.args.get("conversation_id", type=int)
    persona_profile_id = request.args.get("persona_profile_id", type=int)
    client_id = get_request_client_id()
    user = get_current_user()
    query = MemoryItem.query.filter_by(client_id=client_id)
    if user is not None:
        query = query.filter((MemoryItem.user_id == user.id) | (MemoryItem.user_id.is_(None)))
    if scope:
        query = query.filter_by(scope=scope)
    if conversation_id is not None:
        query = query.filter((MemoryItem.conversation_id == conversation_id) | (MemoryItem.conversation_id.is_(None)))
    if persona_profile_id is not None:
        query = query.filter((MemoryItem.persona_profile_id == persona_profile_id) | (MemoryItem.persona_profile_id.is_(None)))
    rows = query.order_by(MemoryItem.updated_at.desc(), MemoryItem.id.desc()).all()
    return jsonify(
        [
            {
                "id": row.id,
                "scope": row.scope,
                "title": row.title,
                "content": row.content,
                "conversation_id": row.conversation_id,
                "persona_profile_id": row.persona_profile_id,
                "created_at": row.created_at.isoformat() + "Z",
                "updated_at": row.updated_at.isoformat() + "Z",
            }
            for row in rows
        ]
    )


@memory_bp.post("/memory")
@require_api_key
def save_memory():
    data = request.get_json(silent=True) or {}
    content = (data.get("content") or "").strip()
    title = (data.get("title") or "").strip() or "Memory"
    scope = (data.get("scope") or "profile").strip().lower()
    conversation_id = data.get("conversation_id")
    persona_profile_id = data.get("persona_profile_id")
    if not content:
        return jsonify({"error": "content is required"}), 400
    if scope not in {"profile", "project", "conversation", "persona"}:
        return jsonify({"error": "scope must be profile, project, conversation, or persona"}), 400

    user = get_current_user()
    row = MemoryItem(
        client_id=get_request_client_id(),
        user_id=getattr(user, "id", None),
        conversation_id=conversation_id,
        persona_profile_id=persona_profile_id,
        scope=scope,
        title=title[:160],
        content=content,
        updated_at=datetime.utcnow(),
    )
    db.session.add(row)
    db.session.commit()
    return jsonify({"id": row.id, "scope": row.scope, "title": row.title}), 201


@memory_bp.delete("/memory/<int:memory_id>")
@require_api_key
def delete_memory(memory_id):
    client_id = get_request_client_id()
    row = MemoryItem.query.filter_by(id=memory_id, client_id=client_id).first_or_404()
    db.session.delete(row)
    db.session.commit()
    return jsonify({"ok": True})


@memory_bp.delete("/memory")
@require_api_key
def clear_memory():
    scope = (request.args.get("scope") or "").strip().lower()
    client_id = get_request_client_id()
    query = MemoryItem.query.filter_by(client_id=client_id)
    if scope:
        query = query.filter_by(scope=scope)
    deleted = query.delete(synchronize_session=False)
    db.session.commit()
    return jsonify({"ok": True, "deleted": deleted})
