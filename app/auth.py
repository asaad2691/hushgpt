from datetime import datetime
from functools import wraps

from flask import current_app, g, jsonify, request

from app.models import User, UserSession


def get_request_client_id():
    return (request.headers.get("X-Client-Id") or "legacy-default").strip()[:64] or "legacy-default"


def _get_session_token():
    return (request.headers.get("X-Auth-Token") or "").strip()


def get_current_user():
    token = _get_session_token()
    if not token:
        return None

    session = UserSession.query.filter_by(token=token).first()
    if session is None:
        return None
    if session.expires_at and session.expires_at < datetime.utcnow():
        return None
    return User.query.get(session.user_id)


def require_api_key(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        g.current_user = get_current_user()

        expected = current_app.config["APP_API_KEY"]
        incoming = request.headers.get("X-API-Key", "")
        if expected and incoming == expected:
            return fn(*args, **kwargs)

        if g.current_user is not None:
            return fn(*args, **kwargs)

        return jsonify({"error": "Unauthorized"}), 401

    return wrapper
