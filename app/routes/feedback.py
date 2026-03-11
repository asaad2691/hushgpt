from flask import Blueprint, jsonify, request

from app.auth import get_current_user, get_request_client_id, require_api_key
from app.extensions import db
from app.models import MessageFeedback

feedback_bp = Blueprint("feedback", __name__)


@feedback_bp.post("/feedback")
@require_api_key
def save_feedback():
    data = request.get_json(silent=True) or {}
    rating = (data.get("rating") or "").strip().lower()
    note = (data.get("note") or "").strip()
    if rating not in {"up", "down", "wrong", "shorter", "detailed"}:
        return jsonify({"error": "invalid rating"}), 400

    user = get_current_user()
    row = MessageFeedback(
        client_id=get_request_client_id(),
        conversation_id=data.get("conversation_id"),
        message_id=data.get("message_id"),
        user_id=getattr(user, "id", None),
        rating=rating,
        note=note,
    )
    db.session.add(row)
    db.session.commit()
    return jsonify({"ok": True, "id": row.id})
