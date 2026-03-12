from datetime import datetime
from .extensions import db


class Conversation(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    client_id = db.Column(db.String(64), nullable=False, index=True)
    title = db.Column(db.String(200), nullable=True)
    summary = db.Column(db.Text, nullable=False, default="")
    pinned = db.Column(db.Boolean, nullable=False, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)


class Message(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    conversation_id = db.Column(db.Integer, db.ForeignKey("conversation.id"), nullable=False, index=True)
    role = db.Column(db.String(20), nullable=False)
    content = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)


class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)


class UserSession(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False, index=True)
    token = db.Column(db.String(128), unique=True, nullable=False, index=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    expires_at = db.Column(db.DateTime, nullable=True)


class Job(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    client_id = db.Column(db.String(64), nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=True, index=True)
    job_type = db.Column(db.String(80), nullable=False, index=True)
    status = db.Column(db.String(20), nullable=False, default="queued", index=True)
    progress = db.Column(db.Integer, nullable=False, default=0)
    payload_json = db.Column(db.Text, nullable=False, default="")
    result_json = db.Column(db.Text, nullable=False, default="")
    error = db.Column(db.Text, nullable=False, default="")
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)


class RequestLog(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    client_id = db.Column(db.String(64), nullable=True, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=True, index=True)
    route = db.Column(db.String(160), nullable=False, index=True)
    method = db.Column(db.String(12), nullable=False)
    duration_ms = db.Column(db.Integer, nullable=False, default=0)
    status_code = db.Column(db.Integer, nullable=False, default=200)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)


class EmbeddingEntry(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    client_id = db.Column(db.String(64), nullable=False, index=True)
    conversation_id = db.Column(db.Integer, nullable=True, index=True)
    source_type = db.Column(db.String(40), nullable=False, index=True)
    source_key = db.Column(db.String(120), nullable=False, index=True)
    title = db.Column(db.String(200), nullable=True)
    text = db.Column(db.Text, nullable=False)
    vector_json = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)


class MemoryItem(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    client_id = db.Column(db.String(64), nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=True, index=True)
    conversation_id = db.Column(db.Integer, db.ForeignKey("conversation.id"), nullable=True, index=True)
    scope = db.Column(db.String(20), nullable=False, default="profile", index=True)
    title = db.Column(db.String(160), nullable=False, default="")
    content = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)


class MessageFeedback(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    client_id = db.Column(db.String(64), nullable=False, index=True)
    conversation_id = db.Column(db.Integer, db.ForeignKey("conversation.id"), nullable=True, index=True)
    message_id = db.Column(db.Integer, db.ForeignKey("message.id"), nullable=True, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=True, index=True)
    rating = db.Column(db.String(20), nullable=False, index=True)
    note = db.Column(db.Text, nullable=False, default="")
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)


class KnowledgeCollection(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    client_id = db.Column(db.String(64), nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=True, index=True)
    name = db.Column(db.String(160), nullable=False, index=True)
    description = db.Column(db.Text, nullable=False, default="")
    shared = db.Column(db.Boolean, nullable=False, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)


class CollectionAsset(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    collection_id = db.Column(db.Integer, db.ForeignKey("knowledge_collection.id"), nullable=False, index=True)
    client_id = db.Column(db.String(64), nullable=False, index=True)
    source_type = db.Column(db.String(40), nullable=False, index=True)
    title = db.Column(db.String(220), nullable=False, default="")
    source_ref = db.Column(db.String(500), nullable=False, default="")
    text_content = db.Column(db.Text, nullable=False, default="")
    preview = db.Column(db.Text, nullable=False, default="")
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
