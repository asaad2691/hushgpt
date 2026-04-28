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
    persona_profile_id = db.Column(db.Integer, db.ForeignKey("persona_profile.id"), nullable=True, index=True)
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


class PersonaProfile(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    client_id = db.Column(db.String(64), nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=True, index=True)
    name = db.Column(db.String(80), nullable=False, default="Nova")
    preset = db.Column(db.String(40), nullable=False, default="companion", index=True)
    role = db.Column(db.String(240), nullable=False, default="A multilingual AI companion.")
    style = db.Column(db.Text, nullable=False, default="Warm, clear, emotionally steady, and naturally conversational.")
    language = db.Column(db.String(20), nullable=False, default="auto")
    voice_name = db.Column(db.String(120), nullable=False, default="")
    motion = db.Column(db.String(40), nullable=False, default="float")
    avatar_path = db.Column(db.String(500), nullable=False, default="avatar://built-in?p=realistic&m=realistic-female&g=f&f=soft&hs=long&a=none&os=blazer&st=warm&hc=503a33&ec=7089b3&oc=24385f")
    avatar_pack = db.Column(db.String(40), nullable=False, default="realistic")
    tone = db.Column(db.String(40), nullable=False, default="calm")
    scenario = db.Column(db.String(40), nullable=False, default="companion", index=True)
    accent = db.Column(db.String(20), nullable=False, default="#7bf2df")
    zoom = db.Column(db.Float, nullable=False, default=1.06)
    mouth_x = db.Column(db.Float, nullable=False, default=50.0)
    mouth_y = db.Column(db.Float, nullable=False, default=74.0)
    mouth_width = db.Column(db.Integer, nullable=False, default=72)
    mouth_height = db.Column(db.Integer, nullable=False, default=30)
    speech_rate = db.Column(db.Float, nullable=False, default=0.95)
    speech_pitch = db.Column(db.Float, nullable=False, default=1.0)
    auto_speak = db.Column(db.Boolean, nullable=False, default=True)
    use_web = db.Column(db.Boolean, nullable=False, default=False)
    deep_web = db.Column(db.Boolean, nullable=False, default=False)
    bilingual = db.Column(db.Boolean, nullable=False, default=False)
    speak_shorter = db.Column(db.Boolean, nullable=False, default=False)
    starter_prompts_json = db.Column(db.Text, nullable=False, default="[]")
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)


class PersonaProfileCollection(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    persona_profile_id = db.Column(db.Integer, db.ForeignKey("persona_profile.id"), nullable=False, index=True)
    collection_id = db.Column(db.Integer, db.ForeignKey("knowledge_collection.id"), nullable=False, index=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)


class PersonaConversation(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    client_id = db.Column(db.String(64), nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=True, index=True)
    persona_profile_id = db.Column(db.Integer, db.ForeignKey("persona_profile.id"), nullable=False, index=True)
    title = db.Column(db.String(200), nullable=False, default="Persona session")
    summary = db.Column(db.Text, nullable=False, default="")
    folder = db.Column(db.String(80), nullable=False, default="", index=True)
    starred = db.Column(db.Boolean, nullable=False, default=False, index=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)


class PersonaMessage(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    conversation_id = db.Column(db.Integer, db.ForeignKey("persona_conversation.id"), nullable=False, index=True)
    role = db.Column(db.String(20), nullable=False, index=True)
    content = db.Column(db.Text, nullable=False)
    sources_json = db.Column(db.Text, nullable=False, default="[]")
    starred = db.Column(db.Boolean, nullable=False, default=False, index=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)


class PersonaMessageFeedback(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    client_id = db.Column(db.String(64), nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=True, index=True)
    persona_profile_id = db.Column(db.Integer, db.ForeignKey("persona_profile.id"), nullable=False, index=True)
    persona_message_id = db.Column(db.Integer, db.ForeignKey("persona_message.id"), nullable=False, index=True)
    rating = db.Column(db.String(40), nullable=False, index=True)
    note = db.Column(db.Text, nullable=False, default="")
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)


