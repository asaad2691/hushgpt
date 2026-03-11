from datetime import datetime, timedelta
from secrets import token_urlsafe

from flask import Blueprint, jsonify, request
from werkzeug.security import check_password_hash, generate_password_hash

from app.extensions import db
from app.auth import get_current_user, require_api_key
from app.models import User, UserSession

auth_bp = Blueprint("user_auth", __name__)


@auth_bp.post("/auth/register")
def register():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip().lower()
    password = data.get("password") or ""

    if len(username) < 3:
        return jsonify({"error": "username must be at least 3 characters"}), 400
    if len(password) < 6:
        return jsonify({"error": "password must be at least 6 characters"}), 400
    if User.query.filter_by(username=username).first():
        return jsonify({"error": "username already exists"}), 409

    user = User(username=username, password_hash=generate_password_hash(password))
    db.session.add(user)
    db.session.commit()
    return jsonify({"ok": True, "username": user.username}), 201


@auth_bp.post("/auth/login")
def login():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip().lower()
    password = data.get("password") or ""
    user = User.query.filter_by(username=username).first()
    if user is None or not check_password_hash(user.password_hash, password):
        return jsonify({"error": "invalid credentials"}), 401

    session = UserSession(
        user_id=user.id,
        token=token_urlsafe(32),
        expires_at=datetime.utcnow() + timedelta(days=30),
    )
    db.session.add(session)
    db.session.commit()
    return jsonify({"token": session.token, "username": user.username})


@auth_bp.post("/auth/logout")
@require_api_key
def logout():
    user = get_current_user()
    if user is None:
        return jsonify({"ok": True})

    token = (request.headers.get("X-Auth-Token") or "").strip()
    UserSession.query.filter_by(token=token, user_id=user.id).delete()
    db.session.commit()
    return jsonify({"ok": True})


@auth_bp.get("/auth/me")
@require_api_key
def me():
    user = get_current_user()
    return jsonify(
        {
            "authenticated": user is not None,
            "username": user.username if user else None,
        }
    )
