import json

from flask import Blueprint, Response, current_app, jsonify, request, stream_with_context

from app.auth import get_current_user, require_api_key
from app.extensions import db
from app.models import CollectionAsset, KnowledgeCollection, Conversation, MemoryItem, Message
from app.services.llm_provider import get_active_model_name, get_client
from app.services.vector_store import VectorStoreService
from app.services.web_search import WebSearchService

chat_bp = Blueprint("chat", __name__)


def _sse_event(data, event=None):
    payload = []
    if event:
        payload.append(f"event: {event}")

    text = "" if data is None else str(data)
    lines = text.splitlines() or [""]
    for line in lines:
        payload.append(f"data: {line}")

    return "\n".join(payload) + "\n\n"


def _client_id():
    return (request.headers.get("X-Client-Id") or "legacy-default").strip()[:64] or "legacy-default"


def _get_or_create_conversation(conversation_id, title):
    if conversation_id:
        conv = Conversation.query.filter_by(id=conversation_id, client_id=_client_id()).first()
        if conv is None:
            return None
        return conv

    conv = Conversation(client_id=_client_id(), title=title[:120])
    db.session.add(conv)
    db.session.flush()
    return conv


def _history_from_db(conversation_id):
    if not conversation_id:
        return []

    max_history = current_app.config["MAX_HISTORY_MESSAGES"]
    rows = (
        Message.query.filter_by(conversation_id=conversation_id)
        .order_by(Message.created_at.desc(), Message.id.desc())
        .limit(max_history)
        .all()
    )
    rows.reverse()
    return [{"role": row.role, "content": row.content} for row in rows]


def _recent_history_rows(conversation_id):
    if not conversation_id:
        return []
    max_history = current_app.config["MAX_HISTORY_MESSAGES"]
    rows = (
        Message.query.filter_by(conversation_id=conversation_id)
        .order_by(Message.created_at.desc(), Message.id.desc())
        .limit(max_history)
        .all()
    )
    rows.reverse()
    return rows


def _conversation_message_count(conversation_id):
    return Message.query.filter_by(conversation_id=conversation_id).count()


def _refresh_conversation_summary(conversation):
    message_count = _conversation_message_count(conversation.id)
    if message_count < 6 or (message_count % 6 != 0 and conversation.summary):
        return

    recent_rows = (
        Message.query.filter_by(conversation_id=conversation.id)
        .order_by(Message.created_at.desc(), Message.id.desc())
        .limit(10)
        .all()
    )
    recent_rows.reverse()
    excerpt = "\n".join(f"{row.role.title()}: {row.content}" for row in recent_rows)
    summary_prompt = (
        "Summarize this conversation for future assistant context.\n"
        "Keep it under 140 words.\n"
        "Preserve: user goals, preferences, constraints, unresolved questions, and important facts.\n"
        "Do not add facts not present in the conversation.\n\n"
        f"Existing summary:\n{conversation.summary or '(none)'}\n\n"
        f"Recent messages:\n{excerpt}"
    )
    try:
        summary_result = get_client().chat_once(
            messages=[{"role": "user", "content": summary_prompt}],
            options={"max_new_tokens": 180, "temperature": 0.2, "do_sample": False},
        )
        summary = (summary_result.get("message", {}).get("content") or "").strip()
        if summary:
            conversation.summary = summary
            db.session.flush()
    except Exception:
        pass


def _wants_detailed_response(prompt):
    text = (prompt or "").lower()
    detail_cues = [
        "in detail",
        "detailed",
        "step by step",
        "comprehensive",
        "full guide",
        "long answer",
        "deep dive",
        "explain thoroughly",
        "latest news",
        "global update",
        "market update",
        "full update",
        "summarize the news",
        "analyze the code",
    ]
    return any(cue in text for cue in detail_cues) or len(text) > 350


def _needs_current_info(prompt):
    text = (prompt or "").lower()
    cues = [
        "news",
        "weather",
        "forecast",
        "temperature",
        "time",
        "date",
        "today",
        "latest",
        "recent",
        "current",
        "update",
        "global",
        "world",
        "market",
        "price",
        "stock",
        "crypto",
    ]
    return any(cue in text for cue in cues)


def _is_simple_prompt(prompt):
    text = (prompt or "").strip().lower()
    return len(text) <= 80 and not _wants_detailed_response(text) and not _needs_current_info(text)


def _apply_default_generation_options(prompt, options):
    merged = dict(options or {})
    if _wants_detailed_response(prompt):
        merged.setdefault("max_new_tokens", 900)
    elif _needs_current_info(prompt):
        merged.setdefault("max_new_tokens", 500)
    else:
        merged.setdefault("max_new_tokens", 140)
    return merged


def _store_reply(conversation, prompt, content):
    user_message = Message(conversation_id=conversation.id, role="user", content=prompt)
    assistant_message = Message(conversation_id=conversation.id, role="assistant", content=content)
    db.session.add(user_message)
    db.session.add(assistant_message)
    db.session.flush()
    vectors = VectorStoreService(current_app.config)
    try:
        vectors.index_text(_client_id(), "conversation-message", f"msg-{user_message.id}", prompt, title=conversation.title, conversation_id=conversation.id)
        vectors.index_text(_client_id(), "conversation-message", f"msg-{assistant_message.id}", content, title=conversation.title, conversation_id=conversation.id)
    except Exception:
        pass
    _refresh_conversation_summary(conversation)
    db.session.commit()


def _sanitize_assistant_reply(prompt, content):
    cleaned = (content or "").strip()
    if not cleaned:
        return cleaned

    # Strip transcript-style continuation that some local models generate.
    transcript_markers = ["\nUser:", "\nAssistant:", "User:", "Assistant:"]
    cut_positions = [cleaned.find(marker) for marker in transcript_markers if cleaned.find(marker) != -1]
    if cut_positions:
        cleaned = cleaned[: min(cut_positions)].strip()

    brevity_cleanup = [
        "Is there anything else I can assist you with",
        "Is there anything else you need assistance with",
        "Please let me know if you need any further assistance",
        "I'm here to help",
        "Thanks for reaching out",
        "What do you think",
        "Please confirm the details again",
    ]
    for phrase in brevity_cleanup:
        idx = cleaned.find(phrase)
        if idx != -1:
            cleaned = cleaned[:idx].strip()

    words = [word for word in cleaned.split() if not word.startswith("#")]
    cleaned = " ".join(words).strip()

    if _is_simple_prompt(prompt):
        cleaned = cleaned.replace("I apologize for any confusion caused earlier.", "").strip()
        if "\n" in cleaned:
            cleaned = cleaned.split("\n", 1)[0].strip()
        if len(cleaned.split()) > 18 and "." in cleaned:
            cleaned = cleaned.split(".", 1)[0].strip()
            if cleaned and not cleaned.endswith("."):
                cleaned += "."

    return cleaned or (content or "").strip()


def _preset_instruction(preset):
    preset = (preset or "").strip().lower()
    if preset == "fast":
        return "Answer as fast and directly as possible. Keep replies short unless the user asks for detail."
    if preset == "detailed":
        return "Prefer fuller explanations with context, tradeoffs, and useful detail."
    if preset == "coding":
        return "When the topic is technical, structure answers for engineering clarity. Use concise explanations, then code or steps as needed."
    return "Balance clarity and brevity. Give direct answers first, then useful detail when needed."


def build_messages(user_text, conversation_id=None, history=None, web_context=None, preset=None, collection_ids=None):
    system_prompt = current_app.config["SYSTEM_PROMPT"]
    brevity_rule = (
        "Default to concise, direct answers. "
        "For simple questions, answer in 1 to 3 short sentences. "
        "Do not add hashtags, social captions, filler, apology text, or unnecessary follow-up prompts. "
        "Only provide long or highly detailed responses when the user explicitly asks for depth."
    )
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "system", "content": brevity_rule},
        {"role": "system", "content": _preset_instruction(preset)},
    ]

    conversation = None
    if conversation_id:
        conversation = Conversation.query.get(conversation_id)
        if conversation and conversation.summary:
            messages.append(
                {
                    "role": "system",
                    "content": (
                        "Conversation memory summary. Use it to stay consistent with the ongoing chat.\n"
                        f"{conversation.summary}"
                    ),
                }
            )
        user = get_current_user()
        saved_memory_query = MemoryItem.query.filter_by(client_id=_client_id())
        if user is not None:
            saved_memory_query = saved_memory_query.filter(
                (MemoryItem.user_id == user.id) | (MemoryItem.user_id.is_(None))
            )
        saved_memory = saved_memory_query.order_by(MemoryItem.updated_at.desc(), MemoryItem.id.desc()).limit(8).all()
        memory_lines = []
        for item in saved_memory:
            if item.scope == "conversation" and item.conversation_id not in {None, conversation_id}:
                continue
            if item.scope in {"profile", "project", "conversation"}:
                memory_lines.append(f"[{item.scope}] {item.title}: {item.content}")
        if memory_lines:
            messages.append(
                {
                    "role": "system",
                    "content": (
                        "Saved memory is available below. Use it only when it helps maintain the user's preferences, project context, or conversation continuity.\n\n"
                        + "\n".join(memory_lines)
                    ),
                }
            )

    if web_context:
        messages.append(
            {
                "role": "system",
                "content": (
                    "Fresh web context is available below. "
                    "Use it when the question depends on current or external information. "
                    "For news, weather, time, prices, and global updates, prefer this context. "
                    "If the user asked for detail, provide a fuller answer. "
                    "If you use it, answer directly and do not fabricate unsupported facts.\n\n"
                    f"{web_context}"
                ),
            }
        )

    if collection_ids:
        active_collections = (
            KnowledgeCollection.query.filter(
                KnowledgeCollection.client_id == _client_id(),
                KnowledgeCollection.id.in_(collection_ids),
            )
            .order_by(KnowledgeCollection.updated_at.desc(), KnowledgeCollection.id.desc())
            .all()
        )
        if active_collections:
            collection_labels = ", ".join(row.name for row in active_collections[:6])
            messages.append(
                {
                    "role": "system",
                    "content": (
                        "The user selected active knowledge base collections for this message. "
                        "Prefer those collections when they contain relevant information.\n\n"
                        f"Active collections: {collection_labels}"
                    ),
                }
            )

    recent_rows = _recent_history_rows(conversation_id)
    conversation_history = [{"role": row.role, "content": row.content} for row in recent_rows]
    should_search_vectors = bool(conversation_history or collection_ids)
    if should_search_vectors:
        vector_store = VectorStoreService(current_app.config)
        relevant = vector_store.search(
            _client_id(),
            user_text,
            top_k=current_app.config.get("VECTOR_SEARCH_TOP_K", 5),
            source_types=["conversation-message", "file-chunk"],
            conversation_id=conversation_id,
        )
        if collection_ids:
            collection_relevant = vector_store.search(
                _client_id(),
                user_text,
                top_k=max(2, min(4, len(collection_ids) + 1)),
                source_types=["collection-document"],
                source_key_prefixes=[f"collection-{collection_id}-asset-" for collection_id in collection_ids],
            )
            relevant.extend(collection_relevant)
        if relevant:
            snippets = []
            for item in relevant:
                label = item["source_type"].replace("-", " ").title()
                title = item.get("title") or label
                if item["source_type"] == "collection-document":
                    asset = (
                        CollectionAsset.query.filter_by(client_id=_client_id(), title=title)
                        .order_by(CollectionAsset.id.desc())
                        .first()
                    )
                    if asset is not None:
                        title = f"{title} ({asset.source_type})"
                snippets.append(f"[{title}] {item['text']}")
            messages.append(
                {
                    "role": "system",
                    "content": (
                        "Relevant vector-retrieved context was found from earlier chat history or indexed files. "
                        "Use it only when it is helpful to answer the current request.\n\n"
                        + "\n\n".join(snippets)
                    ),
                }
            )
    if conversation_history:
        messages.extend(conversation_history)
    elif history:
        max_history = current_app.config["MAX_HISTORY_MESSAGES"]
        messages.extend(history[-max_history:])

    messages.append({"role": "user", "content": user_text})
    return messages


@chat_bp.post("/chat")
@require_api_key
def chat():
    data = request.get_json(silent=True) or {}
    prompt = (data.get("prompt") or "").strip()
    history = data.get("history") or []
    conversation_id = data.get("conversation_id")
    use_web = bool(data.get("use_web"))
    deep_web = bool(data.get("deep_web"))
    preset = (data.get("response_preset") or "balanced").strip().lower()
    collection_ids = [int(item) for item in (data.get("collection_ids") or []) if str(item).isdigit()]
    provider_override = (data.get("provider_override") or "").strip().lower() or None
    model_override = (data.get("model_override") or "").strip() or None
    options = _apply_default_generation_options(prompt, data.get("options") or {})

    if not prompt:
        return jsonify({"error": "prompt is required"}), 400

    conv = _get_or_create_conversation(conversation_id, prompt)
    if conv is None:
        return jsonify({"error": "conversation not found"}), 404

    web_search = WebSearchService(current_app.config)
    web_context = None
    web_result = None
    if web_search.should_search(prompt, force_web=use_web):
        web_result = web_search.get_context(prompt, deep=deep_web or _wants_detailed_response(prompt))
        if web_result:
            web_context = web_result["text"]

    direct_web_reply = web_search.format_direct_answer(
        prompt,
        web_result,
        detailed=_wants_detailed_response(prompt),
    )
    sources = (web_result or {}).get("sources", [])
    if direct_web_reply:
        try:
            _store_reply(conv, prompt, direct_web_reply)
            return jsonify(
                {
                    "conversation_id": conv.id,
                    "model": "web-direct",
                    "provider": "web",
                    "reply": direct_web_reply,
                    "used_web": True,
                    "raw": {"kind": web_result.get("kind")},
                    "sources": sources,
                    "collection_ids": collection_ids,
                }
            )
        except Exception as exc:
            db.session.rollback()
            return jsonify({"error": f"Model request failed: {exc}"}), 502

    messages = build_messages(
        prompt,
        conversation_id=conv.id,
        history=history,
        web_context=web_context,
        preset=preset,
        collection_ids=collection_ids,
    )
    client = get_client(provider=provider_override, model_name=model_override)

    try:
        result = client.chat_once(messages=messages, options=options)
        content = _sanitize_assistant_reply(prompt, result.get("message", {}).get("content", ""))
        _store_reply(conv, prompt, content)

        return jsonify(
            {
                "conversation_id": conv.id,
                "model": get_active_model_name(provider_override, model_override),
                "provider": provider_override or current_app.config["MODEL_PROVIDER"],
                "reply": content,
                "used_web": bool(web_context),
                "raw": result,
                "sources": sources,
                "collection_ids": collection_ids,
            }
        )
    except Exception as exc:
        db.session.rollback()
        return jsonify({"error": f"Model request failed: {exc}"}), 502


@chat_bp.post("/chat/stream")
@require_api_key
def chat_stream():
    data = request.get_json(silent=True) or {}
    prompt = (data.get("prompt") or "").strip()
    history = data.get("history") or []
    conversation_id = data.get("conversation_id")
    use_web = bool(data.get("use_web"))
    deep_web = bool(data.get("deep_web"))
    preset = (data.get("response_preset") or "balanced").strip().lower()
    collection_ids = [int(item) for item in (data.get("collection_ids") or []) if str(item).isdigit()]
    provider_override = (data.get("provider_override") or "").strip().lower() or None
    model_override = (data.get("model_override") or "").strip() or None
    options = _apply_default_generation_options(prompt, data.get("options") or {})

    if not prompt:
        return jsonify({"error": "prompt is required"}), 400

    conv = _get_or_create_conversation(conversation_id, prompt)
    if conv is None:
        return jsonify({"error": "conversation not found"}), 404

    web_search = WebSearchService(current_app.config)
    web_context = None
    web_result = None
    if web_search.should_search(prompt, force_web=use_web):
        web_result = web_search.get_context(prompt, deep=deep_web or _wants_detailed_response(prompt))
        if web_result:
            web_context = web_result["text"]

    direct_web_reply = web_search.format_direct_answer(
        prompt,
        web_result,
        detailed=_wants_detailed_response(prompt),
    )
    sources = (web_result or {}).get("sources", [])

    messages = build_messages(
        prompt,
        conversation_id=conv.id,
        history=history,
        web_context=web_context,
        preset=preset,
        collection_ids=collection_ids,
    )
    client = get_client(provider=provider_override, model_name=model_override)

    @stream_with_context
    def generate():
        collected = []
        try:
            yield _sse_event(
                json.dumps(
                    {
                        "conversation_id": conv.id,
                        "model": get_active_model_name(provider_override, model_override),
                        "provider": provider_override or current_app.config["MODEL_PROVIDER"],
                        "collection_ids": collection_ids,
                    }
                ),
                event="meta",
            )
            if sources:
                yield _sse_event(json.dumps(sources), event="sources")
            if direct_web_reply:
                yield _sse_event("used", event="web")
                yield _sse_event(direct_web_reply)
                _store_reply(conv, prompt, direct_web_reply)
                yield _sse_event("[DONE]", event="done")
                return
            if web_context:
                yield _sse_event("used", event="web")
            for chunk in client.chat_stream(messages=messages, options=options):
                token = chunk.get("message", {}).get("content", "")
                done = chunk.get("done", False)
                if token:
                    collected.append(token)
                    yield _sse_event(token)
                if done:
                    assistant_text = _sanitize_assistant_reply(prompt, "".join(collected).strip())
                    _store_reply(conv, prompt, assistant_text)
                    yield _sse_event("[DONE]", event="done")
                    break
        except Exception as exc:
            db.session.rollback()
            yield _sse_event(str(exc), event="error")

    return Response(generate(), mimetype="text/event-stream")
