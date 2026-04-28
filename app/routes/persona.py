
import json
import os
import re
import uuid
from datetime import datetime

from flask import Blueprint, Response, current_app, jsonify, render_template, request, stream_with_context
from werkzeug.utils import secure_filename

from app.auth import get_current_user, get_request_client_id, require_api_key
from app.extensions import db
from app.models import (
    CollectionAsset,
    KnowledgeCollection,
    MemoryItem,
    PersonaConversation,
    PersonaMessage,
    PersonaMessageFeedback,
    PersonaProfile,
    PersonaProfileCollection,
)
from app.routes.chat import (
    _apply_default_generation_options,
    _sanitize_assistant_reply,
    _wants_detailed_response,
)
from app.services.llm_provider import get_active_model_name, get_client
from app.services.vector_store import VectorStoreService
from app.services.web_search import WebSearchService

persona_bp = Blueprint("persona", __name__)

PERSONA_PRESETS = {
    "companion": {
        "name": "Nova",
        "role": "A multilingual AI companion for natural chat and voice conversation.",
        "style": "Warm, clear, emotionally steady, and naturally conversational.",
        "scenario": "companion",
        "tone": "calm",
        "avatar_pack": "realistic",
        "starter_prompts": [
            "Introduce yourself in a warm multilingual way and explain how I can use this persona mode.",
            "Talk to me in Urdu and English mixed naturally about how this project works.",
            "Explain Flask background jobs in a simple, spoken style with short sentences.",
        ],
    },
    "mentor": {
        "name": "Astra",
        "role": "A thoughtful multilingual mentor who explains clearly and keeps the user focused.",
        "style": "Calm, sharp, supportive, and practical.",
        "scenario": "coding-mentor",
        "tone": "formal",
        "avatar_pack": "corporate",
        "starter_prompts": [
            "Help me plan the next improvements for this project.",
            "Review my approach and tell me the highest-value next step.",
        ],
    },
    "tutor": {
        "name": "Rhea",
        "role": "A multilingual tutor who teaches step by step and checks understanding naturally.",
        "style": "Clear, patient, structured, and easy to follow.",
        "scenario": "tutor",
        "tone": "empathetic",
        "avatar_pack": "minimal-assistant",
        "starter_prompts": ["Teach me one concept step by step and keep checking if I follow."],
    },
    "interviewer": {
        "name": "Kian",
        "role": "A professional multilingual interviewer who asks focused questions and responds precisely.",
        "style": "Direct, polished, concise, and confident.",
        "scenario": "interviewer",
        "tone": "formal",
        "avatar_pack": "corporate",
        "starter_prompts": ["Interview me for a Python backend developer role."],
    },
    "recruiter": {
        "name": "Mira",
        "role": "A multilingual recruiter who evaluates resumes, job fit, and professional communication.",
        "style": "Professional, concise, fair, and practical.",
        "scenario": "recruiter",
        "tone": "formal",
        "avatar_pack": "corporate",
        "starter_prompts": ["Act like a recruiter and tell me how to improve my resume."],
    },
    "sales-agent": {
        "name": "Vale",
        "role": "A multilingual sales agent who explains value clearly and keeps the conversation moving.",
        "style": "Confident, energetic, persuasive, and friendly.",
        "scenario": "sales-agent",
        "tone": "energetic",
        "avatar_pack": "hologram",
        "starter_prompts": ["Pitch this product in a clear, natural style."],
    },
    "support-agent": {
        "name": "Sera",
        "role": "A multilingual customer support agent who answers patiently from available docs and context.",
        "style": "Patient, clear, calm, and resolution-focused.",
        "scenario": "support-agent",
        "tone": "empathetic",
        "avatar_pack": "realistic",
        "starter_prompts": ["Help me troubleshoot an issue step by step like support."],
    },
    "therapist": {
        "name": "Luma",
        "role": "A reflective multilingual listener who responds gently and thoughtfully without pretending to be a licensed professional.",
        "style": "Grounded, calm, reflective, and emotionally gentle.",
        "scenario": "therapist",
        "tone": "empathetic",
        "avatar_pack": "realistic",
        "starter_prompts": ["Talk to me in a reflective and supportive style about stress."],
    },
    "coding-mentor": {
        "name": "Orin",
        "role": "A multilingual coding mentor who reviews code, explains tradeoffs, and proposes concrete fixes.",
        "style": "Technical, supportive, direct, and highly practical.",
        "scenario": "coding-mentor",
        "tone": "formal",
        "avatar_pack": "realistic",
        "starter_prompts": ["Review this traceback and tell me the likely root cause."],
    },
}

TONE_INSTRUCTIONS = {
    "calm": "Keep your tone calm, measured, and emotionally steady.",
    "energetic": "Keep your tone lively, upbeat, and fast-moving without becoming noisy.",
    "formal": "Keep your tone polished, professional, and precise.",
    "playful": "Keep your tone light, witty, and relaxed without becoming unserious.",
    "empathetic": "Keep your tone emotionally aware, gentle, and supportive.",
}

SCENARIO_INSTRUCTIONS = {
    "companion": "Act like a high-trust conversational companion who stays present and natural.",
    "tutor": "Teach step by step, break things down clearly, and check understanding naturally.",
    "interviewer": "Ask focused interview-style questions and keep the exchange structured.",
    "recruiter": "Evaluate resumes, job fit, and communication professionally and fairly.",
    "sales-agent": "Explain value clearly, guide the conversation, and handle objections naturally.",
    "support-agent": "Answer from docs and context when available, troubleshoot carefully, and prioritize clarity.",
    "therapist": "Respond reflectively and supportively, but do not claim clinical authority or provide unsafe advice.",
    "coding-mentor": "Inspect code, explain tradeoffs, and suggest concrete fixes with technical precision.",
}

VOICE_FEEDBACK_RATINGS = {"up", "down", "too-long", "wrong-language", "voice-sounded-wrong", "broke-character"}


def _utcnow():
    return datetime.utcnow()


def _persona_language_instruction(language_code, bilingual=False):
    mapping = {
        "auto": "Detect the user's language from the prompt and reply in that same language. Support natural multilingual code-switching when the user mixes languages.",
        "en-US": "Reply in English unless the user explicitly asks for another language.",
        "ur-PK": "Reply in Urdu by default. If the user mixes Urdu and English, respond naturally in Urdu-first code-switching.",
        "ar-SA": "Reply in Arabic by default unless the user asks for another language.",
        "hi-IN": "Reply in Hindi by default unless the user asks for another language.",
    }
    base = mapping.get(language_code or "auto", mapping["auto"])
    return f"{base} Prefer a bilingual conversational flow when it helps clarity." if bilingual else base


def _json_loads(value, fallback):
    try:
        return json.loads(value or "")
    except Exception:
        return fallback


def _preset_payload(key, payload):
    return {
        "key": key,
        "name": payload.get("name"),
        "role": payload.get("role"),
        "style": payload.get("style"),
        "scenario": payload.get("scenario"),
        "tone": payload.get("tone"),
        "avatar_pack": payload.get("avatar_pack"),
        "starter_prompts": list(payload.get("starter_prompts") or []),
    }


def _profile_query():
    user = get_current_user()
    query = PersonaProfile.query.filter_by(client_id=get_request_client_id())
    if user is not None:
        query = query.filter((PersonaProfile.user_id == user.id) | (PersonaProfile.user_id.is_(None)))
    return query


def _conversation_query():
    user = get_current_user()
    query = PersonaConversation.query.filter_by(client_id=get_request_client_id())
    if user is not None:
        query = query.filter((PersonaConversation.user_id == user.id) | (PersonaConversation.user_id.is_(None)))
    return query


def _collection_query():
    user = get_current_user()
    query = KnowledgeCollection.query.filter_by(client_id=get_request_client_id())
    if user is not None:
        query = query.filter((KnowledgeCollection.user_id == user.id) | (KnowledgeCollection.user_id.is_(None)))
    return query


def _message_payload(message):
    return {
        "id": message.id,
        "role": message.role,
        "content": message.content,
        "starred": bool(message.starred),
        "sources": _json_loads(message.sources_json, []),
        "created_at": message.created_at.isoformat() + "Z",
    }


def _profile_collection_ids(profile_id):
    return [row.collection_id for row in PersonaProfileCollection.query.filter_by(persona_profile_id=profile_id).all()]


def _collection_assets_summary(collection_ids):
    if not collection_ids:
        return []
    assets = CollectionAsset.query.filter(CollectionAsset.collection_id.in_(collection_ids)).order_by(CollectionAsset.created_at.desc()).limit(20).all()
    return [{
        "id": asset.id,
        "title": asset.title,
        "source_type": asset.source_type,
        "source_ref": asset.source_ref,
        "preview": asset.preview,
        "collection_id": asset.collection_id,
    } for asset in assets]


def _profile_payload(profile):
    collection_ids = _profile_collection_ids(profile.id)
    collections = _collection_query().filter(KnowledgeCollection.id.in_(collection_ids)).all() if collection_ids else []
    return {
        "id": profile.id,
        "name": profile.name,
        "preset": profile.preset,
        "role": profile.role,
        "style": profile.style,
        "language": profile.language,
        "voice_name": profile.voice_name,
        "motion": profile.motion,
        "avatar_path": profile.avatar_path,
        "avatar_pack": profile.avatar_pack,
        "tone": profile.tone,
        "scenario": profile.scenario,
        "accent": profile.accent,
        "zoom": profile.zoom,
        "mouth_x": profile.mouth_x,
        "mouth_y": profile.mouth_y,
        "mouth_width": profile.mouth_width,
        "mouth_height": profile.mouth_height,
        "speech_rate": profile.speech_rate,
        "speech_pitch": profile.speech_pitch,
        "auto_speak": bool(profile.auto_speak),
        "use_web": bool(profile.use_web),
        "deep_web": bool(profile.deep_web),
        "bilingual": bool(profile.bilingual),
        "speak_shorter": bool(profile.speak_shorter),
        "starter_prompts": _json_loads(profile.starter_prompts_json, []),
        "collection_ids": collection_ids,
        "collection_names": [row.name for row in collections],
        "assets": _collection_assets_summary(collection_ids),
        "created_at": profile.created_at.isoformat() + "Z",
        "updated_at": profile.updated_at.isoformat() + "Z",
    }


def _conversation_payload(conversation, include_messages=False):
    latest = PersonaMessage.query.filter_by(conversation_id=conversation.id).order_by(PersonaMessage.created_at.desc(), PersonaMessage.id.desc()).first()
    payload = {
        "id": conversation.id,
        "persona_profile_id": conversation.persona_profile_id,
        "title": conversation.title,
        "summary": conversation.summary,
        "folder": conversation.folder,
        "starred": bool(conversation.starred),
        "last_message": latest.content[:220] if latest else "",
        "created_at": conversation.created_at.isoformat() + "Z",
        "updated_at": conversation.updated_at.isoformat() + "Z",
    }
    if include_messages:
        rows = PersonaMessage.query.filter_by(conversation_id=conversation.id).order_by(PersonaMessage.created_at.asc(), PersonaMessage.id.asc()).all()
        payload["messages"] = [_message_payload(row) for row in rows]
    return payload

def _coerce_collection_ids(value):
    if not value:
        return []
    ids = []
    for item in value:
        try:
            ids.append(int(item))
        except Exception:
            continue
    if not ids:
        return []
    allowed = {row.id for row in _collection_query().filter(KnowledgeCollection.id.in_(ids)).all()}
    return [item for item in ids if item in allowed]


def _persist_profile_collections(profile_id, collection_ids):
    PersonaProfileCollection.query.filter_by(persona_profile_id=profile_id).delete(synchronize_session=False)
    for collection_id in collection_ids:
        db.session.add(PersonaProfileCollection(persona_profile_id=profile_id, collection_id=collection_id))


def _load_persona_memories(profile_id):
    client_id = get_request_client_id()
    user = get_current_user()
    query = MemoryItem.query.filter_by(client_id=client_id)
    if user is not None:
        query = query.filter((MemoryItem.user_id == user.id) | (MemoryItem.user_id.is_(None)))
    return query.filter(
        (MemoryItem.scope.in_(["profile", "project"]))
        | ((MemoryItem.scope == "persona") & (MemoryItem.persona_profile_id == profile_id))
    ).order_by(MemoryItem.updated_at.desc(), MemoryItem.id.desc()).limit(12).all()


def _build_memory_block(profile_id):
    rows = _load_persona_memories(profile_id)
    if not rows:
        return ""
    return "\n".join(f"[{row.scope.upper()}] {row.title or 'Memory'}: {row.content}" for row in rows)


def _build_collection_context(prompt, collection_ids):
    if not collection_ids:
        return "", []
    vectors = VectorStoreService(current_app.config)
    prefixes = [f"collection-{collection_id}-asset-" for collection_id in collection_ids]
    hits = vectors.search(get_request_client_id(), prompt, source_types=["collection-document"], source_key_prefixes=prefixes, top_k=6)
    if not hits:
        return "", []
    asset_ids = []
    for hit in hits:
        match = re.search(r"asset-(\d+):", hit.get("source_key") or "")
        if match:
            asset_ids.append(int(match.group(1)))
    asset_map = {row.id: row for row in CollectionAsset.query.filter(CollectionAsset.id.in_(asset_ids)).all()} if asset_ids else {}
    sources = []
    context_parts = []
    for index, hit in enumerate(hits, start=1):
        asset = None
        match = re.search(r"asset-(\d+):", hit.get("source_key") or "")
        if match:
            asset = asset_map.get(int(match.group(1)))
        title = asset.title if asset is not None else (hit.get("title") or f"Collection source {index}")
        source_ref = asset.source_ref if asset is not None else ""
        context_parts.append(f"[{index}] {title}\n{hit.get('text', '')}")
        sources.append({
            "title": title,
            "source_ref": source_ref,
            "source_type": asset.source_type if asset is not None else "collection-document",
            "preview": hit.get("text", "")[:220],
        })
    return "\n\n".join(context_parts), sources


def _build_persona_messages(prompt, history, profile, memory_block="", collection_context="", web_context=None, voice_mode=False):
    name = (profile.get("name") or "Nova").strip()[:40]
    role = (profile.get("role") or "A multilingual AI companion").strip()[:240]
    style = (profile.get("style") or "Warm, clear, emotionally steady, and naturally conversational.").strip()[:500]
    language = (profile.get("language") or "auto").strip()
    tone = (profile.get("tone") or "calm").strip()
    scenario = (profile.get("scenario") or "companion").strip()
    bilingual = bool(profile.get("bilingual"))
    speech_rules = (
        "Keep spoken replies smooth, compact, and easy to listen to. Prefer short paragraphs and natural sentence rhythm. Do not output stage directions, roleplay markup, or emoji spam."
        if voice_mode
        else "Keep replies natural and conversational. Use markdown only when it adds real value."
    )
    system_blocks = [
        current_app.config["SYSTEM_PROMPT"],
        (
            f"You are {name}. {role}. "
            f"Your speaking style is: {style}. "
            f"{TONE_INSTRUCTIONS.get(tone, TONE_INSTRUCTIONS['calm'])} "
            f"{SCENARIO_INSTRUCTIONS.get(scenario, SCENARIO_INSTRUCTIONS['companion'])} "
            f"{_persona_language_instruction(language, bilingual=bilingual)} "
            f"{speech_rules} "
            "Respond like a visible on-screen AI persona talking directly to the user."
        ),
    ]
    if memory_block:
        system_blocks.append("Relevant remembered context:\n" + memory_block)
    if collection_context:
        system_blocks.append("Relevant knowledge bundle context:\n" + collection_context)
    if web_context:
        system_blocks.append("Fresh web context is available. Use it only when the request depends on current information.\n\n" + web_context)
    messages = [{"role": "system", "content": block} for block in system_blocks]
    for item in history[-12:]:
        role_name = (item.get("role") or "").strip().lower()
        content = (item.get("content") or "").strip()
        if role_name in {"user", "assistant"} and content:
            messages.append({"role": role_name, "content": content[:4000]})
    messages.append({"role": "user", "content": prompt})
    return messages


def _update_conversation_summary(conversation, prompt, reply):
    if not conversation.summary:
        conversation.summary = f"User asked: {prompt[:160]}. Persona replied: {reply[:180]}"


def _profile_from_request(data):
    profile_id = data.get("persona_profile_id")
    try:
        profile_id = int(profile_id) if profile_id else None
    except Exception:
        profile_id = None
    profile = _profile_query().filter_by(id=profile_id).first() if profile_id else None
    if profile is not None:
        return profile, _profile_payload(profile)
    persona = data.get("persona") or {}
    return None, {
        "name": (persona.get("name") or "Nova")[:40],
        "role": (persona.get("role") or "A multilingual AI companion for natural chat and voice conversation.")[:240],
        "style": (persona.get("style") or "Warm, clear, emotionally steady, and naturally conversational.")[:500],
        "language": (persona.get("language") or "auto")[:20],
        "motion": (persona.get("motion") or "float")[:40],
        "voice_name": (persona.get("voice_name") or "")[:120],
        "tone": (persona.get("tone") or "calm")[:40],
        "scenario": (persona.get("scenario") or (persona.get("preset") or "companion"))[:40],
        "bilingual": bool(persona.get("bilingual")),
        "speak_shorter": bool(persona.get("speak_shorter")),
    }


def _get_or_create_persona_conversation(profile_id, conversation_id, prompt):
    if conversation_id:
        conversation = _conversation_query().filter_by(id=conversation_id).first()
        if conversation is not None:
            return conversation
    user = get_current_user()
    conversation = PersonaConversation(
        client_id=get_request_client_id(),
        user_id=getattr(user, "id", None),
        persona_profile_id=profile_id,
        title=prompt[:80] or "Persona session",
        updated_at=_utcnow(),
    )
    db.session.add(conversation)
    db.session.flush()
    return conversation


def _direct_web_json(prompt, web_search, web_result, voice_mode):
    direct_web_reply = web_search.format_direct_answer(prompt, web_result, detailed=(not voice_mode and _wants_detailed_response(prompt)))
    if not direct_web_reply:
        return None
    return {"reply": direct_web_reply, "provider": "web", "model": "web-direct", "used_web": True, "sources": (web_result or {}).get("sources", [])}


def _prepare_persona_chat(data):
    prompt = (data.get("prompt") or "").strip()
    if not prompt:
        return None, jsonify({"error": "prompt is required"}), 400
    profile_row, profile = _profile_from_request(data)
    voice_mode = bool(data.get("voice_mode"))
    provider_override = (data.get("provider_override") or "").strip().lower() or None
    model_override = (data.get("model_override") or "").strip() or None
    options = _apply_default_generation_options(prompt, data.get("options") or {})
    if voice_mode or profile.get("speak_shorter"):
        options["max_new_tokens"] = min(int(options.get("max_new_tokens", 96)), 96)
        options["temperature"] = min(float(options.get("temperature", 0.35)), 0.35)
        options["top_p"] = min(float(options.get("top_p", 0.85)), 0.85)
        options["do_sample"] = False
    else:
        options["max_new_tokens"] = min(int(options.get("max_new_tokens", 220)), 220)
    collection_ids = _coerce_collection_ids(data.get("collection_ids") or [])
    if not collection_ids and profile_row is not None:
        collection_ids = _profile_collection_ids(profile_row.id)
    conversation = None
    history = data.get("history") or []
    conversation_id = data.get("conversation_id")
    if profile_row is not None:
        conversation = _get_or_create_persona_conversation(profile_row.id, conversation_id, prompt)
        history_rows = PersonaMessage.query.filter_by(conversation_id=conversation.id).order_by(PersonaMessage.created_at.asc(), PersonaMessage.id.asc()).all()
        history = [{"role": row.role, "content": row.content} for row in history_rows]
    memory_block = _build_memory_block(profile_row.id) if profile_row is not None else ""
    collection_context, collection_sources = _build_collection_context(prompt, collection_ids)
    web_search = WebSearchService(current_app.config)
    web_context = None
    web_result = None
    use_web = bool(data.get("use_web", profile.get("use_web")))
    deep_web = bool(data.get("deep_web", profile.get("deep_web")))
    if web_search.should_search(prompt, force_web=use_web):
        web_result = web_search.get_context(prompt, deep=deep_web or _wants_detailed_response(prompt))
        if web_result:
            web_context = web_result["text"]
    return {
        "prompt": prompt,
        "conversation": conversation,
        "provider_override": provider_override,
        "model_override": model_override,
        "messages": _build_persona_messages(prompt, history, profile, memory_block=memory_block, collection_context=collection_context, web_context=web_context, voice_mode=voice_mode),
        "options": options,
        "web_result": web_result,
        "collection_sources": collection_sources,
        "direct_web": _direct_web_json(prompt, web_search, web_result, voice_mode),
    }, None, None

@persona_bp.get("/persona")
def persona_page():
    return render_template(
        "persona.html",
        api_key=current_app.config["APP_API_KEY"],
        model=get_active_model_name(),
        model_provider=current_app.config["MODEL_PROVIDER"],
        default_max_new_tokens=current_app.config["HUGGINGFACE_MAX_NEW_TOKENS"],
        default_temperature=current_app.config["HUGGINGFACE_TEMPERATURE"],
        default_top_p=current_app.config["HUGGINGFACE_TOP_P"],
        default_do_sample=current_app.config["HUGGINGFACE_DO_SAMPLE"],
    )


@persona_bp.get("/api/persona/presets")
@require_api_key
def list_persona_presets():
    return jsonify([_preset_payload(key, payload) for key, payload in PERSONA_PRESETS.items()])


@persona_bp.get("/api/persona/profiles")
@require_api_key
def list_persona_profiles():
    rows = _profile_query().order_by(PersonaProfile.updated_at.desc(), PersonaProfile.id.desc()).all()
    return jsonify([_profile_payload(row) for row in rows])


@persona_bp.post("/api/persona/profiles")
@require_api_key
def create_persona_profile():
    data = request.get_json(silent=True) or {}
    preset_name = (data.get("preset") or "companion").strip().lower()
    preset = PERSONA_PRESETS.get(preset_name, PERSONA_PRESETS["companion"])
    user = get_current_user()
    profile = PersonaProfile(
        client_id=get_request_client_id(),
        user_id=getattr(user, "id", None),
        name=((data.get("name") or preset["name"]).strip() or preset["name"])[:80],
        preset=preset_name,
        role=((data.get("role") or preset["role"]).strip() or preset["role"])[:240],
        style=((data.get("style") or preset["style"]).strip() or preset["style"])[:4000],
        language=(data.get("language") or "auto")[:20],
        voice_name=(data.get("voice_name") or "")[:120],
        motion=(data.get("motion") or "float")[:40],
        avatar_path=(data.get("avatar_path") or "avatar://built-in?p=realistic&m=realistic-female&g=f&f=soft&hs=long&a=none&os=blazer&st=warm&hc=503a33&ec=7089b3&oc=24385f")[:500],
        avatar_pack=(data.get("avatar_pack") or preset.get("avatar_pack") or "realistic")[:40],
        tone=(data.get("tone") or preset.get("tone") or "calm")[:40],
        scenario=(data.get("scenario") or preset.get("scenario") or preset_name)[:40],
        accent=(data.get("accent") or "#7bf2df")[:20],
        zoom=float(data.get("zoom") or 1.06),
        mouth_x=float(data.get("mouth_x") or 50),
        mouth_y=float(data.get("mouth_y") or 74),
        mouth_width=int(data.get("mouth_width") or 72),
        mouth_height=int(data.get("mouth_height") or 30),
        speech_rate=float(data.get("speech_rate") or 0.95),
        speech_pitch=float(data.get("speech_pitch") or 1.0),
        auto_speak=bool(data.get("auto_speak", True)),
        use_web=bool(data.get("use_web")),
        deep_web=bool(data.get("deep_web")),
        bilingual=bool(data.get("bilingual")),
        speak_shorter=bool(data.get("speak_shorter")),
        starter_prompts_json=json.dumps(data.get("starter_prompts") or preset.get("starter_prompts") or []),
        updated_at=_utcnow(),
    )
    db.session.add(profile)
    db.session.flush()
    _persist_profile_collections(profile.id, _coerce_collection_ids(data.get("collection_ids") or []))
    db.session.commit()
    return jsonify(_profile_payload(profile)), 201


@persona_bp.get("/api/persona/profiles/<int:profile_id>")
@require_api_key
def get_persona_profile(profile_id):
    profile = _profile_query().filter_by(id=profile_id).first_or_404()
    payload = _profile_payload(profile)
    payload["assets"] = _collection_assets_summary(payload["collection_ids"])
    payload["memory"] = [{"id": row.id, "scope": row.scope, "title": row.title, "content": row.content} for row in _load_persona_memories(profile.id)]
    return jsonify(payload)


@persona_bp.patch("/api/persona/profiles/<int:profile_id>")
@require_api_key
def update_persona_profile(profile_id):
    profile = _profile_query().filter_by(id=profile_id).first_or_404()
    data = request.get_json(silent=True) or {}
    simple_fields = {
        "name": 80,
        "preset": 40,
        "role": 240,
        "style": 4000,
        "language": 20,
        "voice_name": 120,
        "motion": 40,
        "avatar_path": 500,
        "avatar_pack": 40,
        "tone": 40,
        "scenario": 40,
        "accent": 20,
    }
    for field, limit in simple_fields.items():
        if field in data:
            setattr(profile, field, str(data.get(field) or getattr(profile, field))[:limit])
    for field in ["zoom", "mouth_x", "mouth_y", "speech_rate", "speech_pitch"]:
        if field in data:
            setattr(profile, field, float(data.get(field) or getattr(profile, field)))
    for field in ["mouth_width", "mouth_height"]:
        if field in data:
            setattr(profile, field, int(data.get(field) or getattr(profile, field)))
    for field in ["auto_speak", "use_web", "deep_web", "bilingual", "speak_shorter"]:
        if field in data:
            setattr(profile, field, bool(data.get(field)))
    if "starter_prompts" in data:
        profile.starter_prompts_json = json.dumps(data.get("starter_prompts") or [])
    if "collection_ids" in data:
        _persist_profile_collections(profile.id, _coerce_collection_ids(data.get("collection_ids") or []))
    profile.updated_at = _utcnow()
    db.session.commit()
    return jsonify(_profile_payload(profile))


@persona_bp.post("/api/persona/profiles/<int:profile_id>/duplicate")
@require_api_key
def duplicate_persona_profile(profile_id):
    source = _profile_query().filter_by(id=profile_id).first_or_404()
    user = get_current_user()
    clone = PersonaProfile(
        client_id=get_request_client_id(),
        user_id=getattr(user, "id", None),
        name=f"{source.name} Copy"[:80],
        preset=source.preset,
        role=source.role,
        style=source.style,
        language=source.language,
        voice_name=source.voice_name,
        motion=source.motion,
        avatar_path=source.avatar_path,
        avatar_pack=source.avatar_pack,
        tone=source.tone,
        scenario=source.scenario,
        accent=source.accent,
        zoom=source.zoom,
        mouth_x=source.mouth_x,
        mouth_y=source.mouth_y,
        mouth_width=source.mouth_width,
        mouth_height=source.mouth_height,
        speech_rate=source.speech_rate,
        speech_pitch=source.speech_pitch,
        auto_speak=source.auto_speak,
        use_web=source.use_web,
        deep_web=source.deep_web,
        bilingual=source.bilingual,
        speak_shorter=source.speak_shorter,
        starter_prompts_json=source.starter_prompts_json,
        updated_at=_utcnow(),
    )
    db.session.add(clone)
    db.session.flush()
    _persist_profile_collections(clone.id, _profile_collection_ids(source.id))
    db.session.commit()
    return jsonify(_profile_payload(clone)), 201


@persona_bp.get("/api/persona/profiles/<int:profile_id>/export")
@require_api_key
def export_persona_profile(profile_id):
    profile = _profile_query().filter_by(id=profile_id).first_or_404()
    return jsonify({"persona": _profile_payload(profile)})


@persona_bp.post("/api/persona/profiles/import")
@require_api_key
def import_persona_profile():
    data = request.get_json(silent=True) or {}
    incoming = data.get("persona") or {}
    user = get_current_user()
    profile = PersonaProfile(
        client_id=get_request_client_id(),
        user_id=getattr(user, "id", None),
        name=(incoming.get("name") or "Imported Persona")[:80],
        preset=(incoming.get("preset") or "companion")[:40],
        role=(incoming.get("role") or "A multilingual AI companion.")[:240],
        style=(incoming.get("style") or PERSONA_PRESETS["companion"]["style"])[:4000],
        language=(incoming.get("language") or "auto")[:20],
        voice_name=(incoming.get("voice_name") or "")[:120],
        motion=(incoming.get("motion") or "float")[:40],
        avatar_path=(incoming.get("avatar_path") or "avatar://built-in?p=realistic&m=realistic-female&g=f&f=soft&hs=long&a=none&os=blazer&st=warm&hc=503a33&ec=7089b3&oc=24385f")[:500],
        avatar_pack=(incoming.get("avatar_pack") or "realistic")[:40],
        tone=(incoming.get("tone") or "calm")[:40],
        scenario=(incoming.get("scenario") or "companion")[:40],
        accent=(incoming.get("accent") or "#7bf2df")[:20],
        zoom=float(incoming.get("zoom") or 1.06),
        mouth_x=float(incoming.get("mouth_x") or 50),
        mouth_y=float(incoming.get("mouth_y") or 74),
        mouth_width=int(incoming.get("mouth_width") or 72),
        mouth_height=int(incoming.get("mouth_height") or 30),
        speech_rate=float(incoming.get("speech_rate") or 0.95),
        speech_pitch=float(incoming.get("speech_pitch") or 1.0),
        auto_speak=bool(incoming.get("auto_speak", True)),
        use_web=bool(incoming.get("use_web")),
        deep_web=bool(incoming.get("deep_web")),
        bilingual=bool(incoming.get("bilingual")),
        speak_shorter=bool(incoming.get("speak_shorter")),
        starter_prompts_json=json.dumps(incoming.get("starter_prompts") or []),
        updated_at=_utcnow(),
    )
    db.session.add(profile)
    db.session.flush()
    _persist_profile_collections(profile.id, _coerce_collection_ids(incoming.get("collection_ids") or []))
    db.session.commit()
    return jsonify(_profile_payload(profile)), 201


@persona_bp.delete("/api/persona/profiles/<int:profile_id>")
@require_api_key
def delete_persona_profile(profile_id):
    profile = _profile_query().filter_by(id=profile_id).first_or_404()
    conversation_ids = [row.id for row in PersonaConversation.query.filter_by(persona_profile_id=profile.id).all()]
    if conversation_ids:
        PersonaMessage.query.filter(PersonaMessage.conversation_id.in_(conversation_ids)).delete(synchronize_session=False)
        PersonaConversation.query.filter(PersonaConversation.id.in_(conversation_ids)).delete(synchronize_session=False)
    MemoryItem.query.filter_by(persona_profile_id=profile.id).delete(synchronize_session=False)
    PersonaProfileCollection.query.filter_by(persona_profile_id=profile.id).delete(synchronize_session=False)
    db.session.delete(profile)
    db.session.commit()
    return jsonify({"ok": True})


@persona_bp.post("/api/persona/avatar")
@require_api_key
def upload_persona_avatar():
    uploaded = request.files.get("avatar") or request.files.get("file")
    if uploaded is None:
        return jsonify({"error": "avatar upload is required"}), 400
    filename = secure_filename(uploaded.filename or "persona-avatar")
    extension = os.path.splitext(filename)[1] or ".png"
    target_dir = os.path.join(current_app.static_folder, "uploads", "persona")
    os.makedirs(target_dir, exist_ok=True)
    stored_name = f"persona-{uuid.uuid4().hex[:12]}{extension}"
    target_path = os.path.join(target_dir, stored_name)
    uploaded.save(target_path)
    return jsonify({"avatar_path": f"/static/uploads/persona/{stored_name}"}), 201


@persona_bp.get("/api/persona/conversations")
@require_api_key
def list_persona_conversations():
    profile_id = request.args.get("persona_profile_id", type=int)
    query_text = (request.args.get("q") or "").strip().lower()
    folder = (request.args.get("folder") or "").strip()
    query = _conversation_query()
    if profile_id is not None:
        query = query.filter_by(persona_profile_id=profile_id)
    if folder:
        query = query.filter_by(folder=folder)
    rows = query.order_by(PersonaConversation.starred.desc(), PersonaConversation.updated_at.desc(), PersonaConversation.id.desc()).all()
    payload = []
    for row in rows:
        item = _conversation_payload(row)
        if query_text and query_text not in f"{item['title']} {item['summary']} {item['last_message']}".lower():
            continue
        payload.append(item)
    return jsonify(payload)


@persona_bp.get("/api/persona/conversations/<int:conversation_id>")
@require_api_key
def get_persona_conversation(conversation_id):
    conversation = _conversation_query().filter_by(id=conversation_id).first_or_404()
    return jsonify(_conversation_payload(conversation, include_messages=True))

@persona_bp.patch("/api/persona/conversations/<int:conversation_id>")
@require_api_key
def update_persona_conversation(conversation_id):
    conversation = _conversation_query().filter_by(id=conversation_id).first_or_404()
    data = request.get_json(silent=True) or {}
    if "title" in data:
        title = (data.get("title") or "").strip()
        if title:
            conversation.title = title[:200]
    if "folder" in data:
        conversation.folder = (data.get("folder") or "").strip()[:80]
    if "starred" in data:
        conversation.starred = bool(data.get("starred"))
    conversation.updated_at = _utcnow()
    db.session.commit()
    return jsonify(_conversation_payload(conversation))


@persona_bp.delete("/api/persona/conversations/<int:conversation_id>")
@require_api_key
def delete_persona_conversation(conversation_id):
    conversation = _conversation_query().filter_by(id=conversation_id).first_or_404()
    PersonaMessage.query.filter_by(conversation_id=conversation.id).delete(synchronize_session=False)
    db.session.delete(conversation)
    db.session.commit()
    return jsonify({"ok": True})


@persona_bp.patch("/api/persona/messages/<int:message_id>")
@require_api_key
def update_persona_message(message_id):
    message = PersonaMessage.query.get_or_404(message_id)
    _conversation_query().filter_by(id=message.conversation_id).first_or_404()
    data = request.get_json(silent=True) or {}
    if "starred" in data:
        message.starred = bool(data.get("starred"))
    db.session.commit()
    return jsonify({"ok": True, "message": _message_payload(message), "conversation_id": message.conversation_id})


@persona_bp.post("/api/persona/messages/<int:message_id>/remember")
@require_api_key
def remember_persona_message(message_id):
    message = PersonaMessage.query.get_or_404(message_id)
    conversation = _conversation_query().filter_by(id=message.conversation_id).first_or_404()
    data = request.get_json(silent=True) or {}
    scope = (data.get("scope") or "persona").strip().lower()
    if scope not in {"persona", "project", "profile"}:
        return jsonify({"error": "scope must be persona, project, or profile"}), 400
    row = MemoryItem(
        client_id=get_request_client_id(),
        user_id=getattr(get_current_user(), "id", None),
        persona_profile_id=conversation.persona_profile_id,
        scope=scope,
        title=((data.get("title") or "Persona Memory").strip() or "Persona Memory")[:160],
        content=(data.get("content") or message.content).strip(),
        updated_at=_utcnow(),
    )
    db.session.add(row)
    db.session.commit()
    return jsonify({"ok": True, "memory_id": row.id})


@persona_bp.post("/api/persona/messages/<int:message_id>/feedback")
@require_api_key
def save_persona_feedback(message_id):
    message = PersonaMessage.query.get_or_404(message_id)
    conversation = _conversation_query().filter_by(id=message.conversation_id).first_or_404()
    data = request.get_json(silent=True) or {}
    rating = (data.get("rating") or "").strip().lower()
    if rating not in VOICE_FEEDBACK_RATINGS:
        return jsonify({"error": "invalid rating"}), 400
    row = PersonaMessageFeedback(
        client_id=get_request_client_id(),
        user_id=getattr(get_current_user(), "id", None),
        persona_profile_id=conversation.persona_profile_id,
        persona_message_id=message.id,
        rating=rating,
        note=(data.get("note") or "").strip(),
    )
    db.session.add(row)
    db.session.commit()
    return jsonify({"ok": True, "id": row.id})


@persona_bp.post("/api/persona/chat")
@require_api_key
def persona_chat():
    context, error_response, status = _prepare_persona_chat(request.get_json(silent=True) or {})
    if error_response is not None:
        return error_response, status
    prompt = context["prompt"]
    conversation = context["conversation"]
    web_result = context["web_result"]
    collection_sources = context["collection_sources"]
    if context["direct_web"] is not None:
        if conversation is not None:
            db.session.add(PersonaMessage(conversation_id=conversation.id, role="user", content=prompt))
            assistant_row = PersonaMessage(conversation_id=conversation.id, role="assistant", content=context["direct_web"]["reply"], sources_json=json.dumps(context["direct_web"].get("sources") or []))
            db.session.add(assistant_row)
            conversation.updated_at = _utcnow()
            _update_conversation_summary(conversation, prompt, context["direct_web"]["reply"])
            db.session.commit()
            context["direct_web"]["conversation_id"] = conversation.id
            context["direct_web"]["message_id"] = assistant_row.id
        return jsonify(context["direct_web"])
    client = get_client(provider=context["provider_override"], model_name=context["model_override"])
    try:
        result = client.chat_once(messages=context["messages"], options=context["options"])
        content = _sanitize_assistant_reply(prompt, result.get("message", {}).get("content", ""))
        sources = (web_result or {}).get("sources", []) + collection_sources
        payload = {
            "reply": content,
            "provider": context["provider_override"] or current_app.config["MODEL_PROVIDER"],
            "model": get_active_model_name(context["provider_override"], context["model_override"]),
            "used_web": bool(web_result),
            "sources": sources,
        }
        if conversation is not None:
            db.session.add(PersonaMessage(conversation_id=conversation.id, role="user", content=prompt))
            assistant_row = PersonaMessage(conversation_id=conversation.id, role="assistant", content=content, sources_json=json.dumps(sources))
            db.session.add(assistant_row)
            conversation.updated_at = _utcnow()
            _update_conversation_summary(conversation, prompt, content)
            db.session.commit()
            payload["conversation_id"] = conversation.id
            payload["message_id"] = assistant_row.id
        return jsonify(payload)
    except Exception as exc:
        return jsonify({"error": f"Persona request failed: {exc}"}), 502


@persona_bp.post("/api/persona/chat/stream")
@require_api_key
def persona_chat_stream():
    context, error_response, status = _prepare_persona_chat(request.get_json(silent=True) or {})
    if error_response is not None:
        return error_response, status
    prompt = context["prompt"]
    conversation = context["conversation"]
    web_result = context["web_result"]
    collection_sources = context["collection_sources"]

    def emit(event, payload):
        return f"event: {event}\ndata: {json.dumps(payload)}\n\n"

    if context["direct_web"] is not None:
        def direct_stream():
            if conversation is not None:
                db.session.add(PersonaMessage(conversation_id=conversation.id, role="user", content=prompt))
                assistant_row = PersonaMessage(conversation_id=conversation.id, role="assistant", content=context["direct_web"]["reply"], sources_json=json.dumps(context["direct_web"].get("sources") or []))
                db.session.add(assistant_row)
                conversation.updated_at = _utcnow()
                _update_conversation_summary(conversation, prompt, context["direct_web"]["reply"])
                db.session.commit()
                yield emit("meta", {"conversation_id": conversation.id, "message_id": assistant_row.id})
            yield emit("chunk", {"text": context["direct_web"]["reply"]})
            yield emit("done", context["direct_web"])
        return Response(stream_with_context(direct_stream()), mimetype="text/event-stream")

    client = get_client(provider=context["provider_override"], model_name=context["model_override"])

    def generate():
        full_text = ""
        sources = (web_result or {}).get("sources", []) + collection_sources
        try:
            if conversation is not None:
                db.session.add(PersonaMessage(conversation_id=conversation.id, role="user", content=prompt))
                db.session.commit()
                yield emit("meta", {"conversation_id": conversation.id})
            for item in client.chat_stream(messages=context["messages"], options=context["options"]):
                chunk = ((item.get("message") or {}).get("content") or "") if isinstance(item, dict) else ""
                if chunk:
                    full_text += chunk
                    yield emit("chunk", {"text": chunk})
                if item.get("done"):
                    break
            content = _sanitize_assistant_reply(prompt, full_text)
            if conversation is not None:
                assistant_row = PersonaMessage(conversation_id=conversation.id, role="assistant", content=content, sources_json=json.dumps(sources))
                db.session.add(assistant_row)
                conversation.updated_at = _utcnow()
                _update_conversation_summary(conversation, prompt, content)
                db.session.commit()
                yield emit("saved", {"message_id": assistant_row.id, "conversation_id": conversation.id})
            yield emit("done", {
                "reply": content,
                "provider": context["provider_override"] or current_app.config["MODEL_PROVIDER"],
                "model": get_active_model_name(context["provider_override"], context["model_override"]),
                "used_web": bool(web_result),
                "sources": sources,
            })
        except Exception as exc:
            yield emit("error", {"error": f"Persona stream failed: {exc}"})

    return Response(stream_with_context(generate()), mimetype="text/event-stream")




