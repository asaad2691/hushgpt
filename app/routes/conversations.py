import io
import json

from flask import Blueprint, Response, jsonify, request
from app.auth import require_api_key
from app.models import Conversation, Message
from app.extensions import db

conversations_bp = Blueprint("conversations", __name__)


def _client_id():
    return (request.headers.get("X-Client-Id") or "legacy-default").strip()[:64] or "legacy-default"


def _clone_conversation(source_conversation, title_suffix):
    cloned = Conversation(
        client_id=_client_id(),
        title=f"{(source_conversation.title or f'Conversation {source_conversation.id}')[:160]} {title_suffix}".strip()[:200],
        summary=source_conversation.summary,
        pinned=False,
    )
    db.session.add(cloned)
    db.session.flush()

    source_messages = (
        Message.query.filter_by(conversation_id=source_conversation.id)
        .order_by(Message.created_at.asc(), Message.id.asc())
        .all()
    )
    for msg in source_messages:
        db.session.add(
            Message(
                conversation_id=cloned.id,
                role=msg.role,
                content=msg.content,
            )
        )
    db.session.commit()
    return cloned


@conversations_bp.get("/conversations")
@require_api_key
def list_conversations():
    query = (request.args.get("q") or "").strip().lower()
    rows = (
        Conversation.query.filter_by(client_id=_client_id())
        .order_by(Conversation.pinned.desc(), Conversation.created_at.desc())
        .all()
    )
    if query:
        rows = [
            row for row in rows
            if query in (row.title or "").lower() or query in (row.summary or "").lower()
        ]
    return jsonify([
        {
            "id": row.id,
            "title": row.title,
            "summary": row.summary,
            "pinned": bool(row.pinned),
            "created_at": row.created_at.isoformat() + "Z",
        }
        for row in rows
    ])


@conversations_bp.get("/conversations/<int:conversation_id>")
@require_api_key
def get_conversation(conversation_id):
    conversation = Conversation.query.filter_by(id=conversation_id, client_id=_client_id()).first_or_404()
    messages = (
        Message.query.filter_by(conversation_id=conversation.id)
        .order_by(Message.created_at.asc(), Message.id.asc())
        .all()
    )
    return jsonify({
        "id": conversation.id,
        "title": conversation.title,
        "summary": conversation.summary,
        "pinned": bool(conversation.pinned),
        "created_at": conversation.created_at.isoformat() + "Z",
        "messages": [
            {
                "id": msg.id,
                "role": msg.role,
                "content": msg.content,
                "created_at": msg.created_at.isoformat() + "Z",
            }
            for msg in messages
        ],
    })


@conversations_bp.patch("/conversations/<int:conversation_id>")
@require_api_key
def rename_conversation(conversation_id):
    conversation = Conversation.query.filter_by(id=conversation_id, client_id=_client_id()).first_or_404()
    data = request.get_json(silent=True) or {}
    title = (data.get("title") or "").strip()
    if "pinned" in data:
        conversation.pinned = bool(data.get("pinned"))
    if "title" in data:
        if not title:
            return jsonify({"error": "title is required"}), 400
        conversation.title = title[:200]
    db.session.commit()
    return jsonify({"id": conversation.id, "title": conversation.title, "pinned": bool(conversation.pinned)})


@conversations_bp.delete("/conversations/<int:conversation_id>")
@require_api_key
def delete_conversation(conversation_id):
    conversation = Conversation.query.filter_by(id=conversation_id, client_id=_client_id()).first_or_404()
    Message.query.filter_by(conversation_id=conversation.id).delete()
    db.session.delete(conversation)
    db.session.commit()
    return jsonify({"ok": True})


@conversations_bp.get("/conversations/<int:conversation_id>/export")
@require_api_key
def export_conversation(conversation_id):
    conversation = Conversation.query.filter_by(id=conversation_id, client_id=_client_id()).first_or_404()
    export_format = (request.args.get("format") or "md").strip().lower()
    messages = (
        Message.query.filter_by(conversation_id=conversation.id)
        .order_by(Message.created_at.asc(), Message.id.asc())
        .all()
    )

    payload = {
        "id": conversation.id,
        "title": conversation.title,
        "summary": conversation.summary,
        "pinned": bool(conversation.pinned),
        "created_at": conversation.created_at.isoformat() + "Z",
        "messages": [
            {
                "role": msg.role,
                "content": msg.content,
                "created_at": msg.created_at.isoformat() + "Z",
            }
            for msg in messages
        ],
    }

    if export_format == "json":
        body = json.dumps(payload, indent=2, ensure_ascii=False)
        filename = f"conversation-{conversation.id}.json"
        mimetype = "application/json"
    else:
        output = io.StringIO()
        output.write(f"# {conversation.title or f'Conversation {conversation.id}'}\n\n")
        if conversation.summary:
            output.write(f"Summary: {conversation.summary}\n\n")
        for msg in messages:
            output.write(f"## {msg.role.title()}\n\n{msg.content}\n\n")
        body = output.getvalue()
        filename = f"conversation-{conversation.id}.md"
        mimetype = "text/markdown"

    response = Response(body, mimetype=mimetype)
    response.headers["Content-Disposition"] = f'attachment; filename="{filename}"'
    return response


@conversations_bp.post("/conversations/<int:conversation_id>/duplicate")
@require_api_key
def duplicate_conversation(conversation_id):
    conversation = Conversation.query.filter_by(id=conversation_id, client_id=_client_id()).first_or_404()
    cloned = _clone_conversation(conversation, "(Copy)")
    return jsonify(
        {
            "id": cloned.id,
            "title": cloned.title,
            "summary": cloned.summary,
            "pinned": bool(cloned.pinned),
            "created_at": cloned.created_at.isoformat() + "Z",
        }
    ), 201


@conversations_bp.post("/conversations/<int:conversation_id>/branch")
@require_api_key
def branch_conversation(conversation_id):
    conversation = Conversation.query.filter_by(id=conversation_id, client_id=_client_id()).first_or_404()
    cloned = _clone_conversation(conversation, "(Branch)")
    return jsonify(
        {
            "id": cloned.id,
            "title": cloned.title,
            "summary": cloned.summary,
            "pinned": bool(cloned.pinned),
            "created_at": cloned.created_at.isoformat() + "Z",
        }
    ), 201
