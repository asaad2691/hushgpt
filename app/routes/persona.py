from flask import Blueprint, current_app, jsonify, render_template, request

from app.auth import require_api_key
from app.routes.chat import (
    _apply_default_generation_options,
    _sanitize_assistant_reply,
    _wants_detailed_response,
)
from app.services.llm_provider import get_active_model_name, get_client
from app.services.web_search import WebSearchService

persona_bp = Blueprint("persona", __name__)


def _persona_language_instruction(language_code):
    mapping = {
        "auto": "Detect the user's language from the prompt and reply in that same language. Support natural multilingual code-switching when the user mixes languages.",
        "en-US": "Reply in English unless the user explicitly asks for another language.",
        "ur-PK": "Reply in Urdu by default. If the user mixes Urdu and English, respond naturally in Urdu-first code-switching.",
        "ar-SA": "Reply in Arabic by default unless the user asks for another language.",
        "hi-IN": "Reply in Hindi by default unless the user asks for another language.",
    }
    return mapping.get(language_code or "auto", mapping["auto"])


def _build_persona_messages(prompt, history, persona, web_context=None, voice_mode=False):
    persona = persona or {}
    name = (persona.get("name") or "Nova").strip()[:40]
    role = (persona.get("role") or "A multilingual AI companion").strip()[:180]
    style = (persona.get("style") or "Warm, clear, emotionally steady, and naturally conversational.").strip()[:400]
    language = (persona.get("language") or "auto").strip()
    energy = (persona.get("energy") or "balanced").strip()
    speech_rules = (
        "Keep spoken replies smooth, compact, and easy to listen to. Prefer short paragraphs and natural sentence rhythm. "
        "Do not output stage directions, roleplay markup, or emoji spam."
        if voice_mode
        else "Keep replies natural and conversational. Use markdown only when it adds real value."
    )
    system_blocks = [
        current_app.config["SYSTEM_PROMPT"],
        (
            f"You are {name}. {role}. "
            f"Your speaking style is: {style}. "
            f"Energy level: {energy}. "
            f"{_persona_language_instruction(language)} "
            f"{speech_rules} "
            "Respond like a visible on-screen AI persona talking directly to the user."
        ),
    ]
    if web_context:
        system_blocks.append(
            "Fresh web context is available. Use it only when the request depends on current information.\n\n"
            + web_context
        )

    messages = [{"role": "system", "content": block} for block in system_blocks]
    normalized_history = []
    for item in history[-12:]:
        role_name = (item.get("role") or "").strip().lower()
        content = (item.get("content") or "").strip()
        if role_name not in {"user", "assistant"} or not content:
            continue
        normalized_history.append({"role": role_name, "content": content[:4000]})
    messages.extend(normalized_history)
    messages.append({"role": "user", "content": prompt})
    return messages


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


@persona_bp.post("/api/persona/chat")
@require_api_key
def persona_chat():
    data = request.get_json(silent=True) or {}
    prompt = (data.get("prompt") or "").strip()
    history = data.get("history") or []
    persona = data.get("persona") or {}
    use_web = bool(data.get("use_web"))
    deep_web = bool(data.get("deep_web"))
    voice_mode = bool(data.get("voice_mode"))
    provider_override = (data.get("provider_override") or "").strip().lower() or None
    model_override = (data.get("model_override") or "").strip() or None
    options = _apply_default_generation_options(prompt, data.get("options") or {})

    if not prompt:
        return jsonify({"error": "prompt is required"}), 400

    if voice_mode:
        options["max_new_tokens"] = min(int(options.get("max_new_tokens", 96)), 96)
        options["temperature"] = min(float(options.get("temperature", 0.35)), 0.35)
        options["top_p"] = min(float(options.get("top_p", 0.85)), 0.85)
        options["do_sample"] = False
    else:
        options["max_new_tokens"] = min(int(options.get("max_new_tokens", 180)), 180)

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
        detailed=(not voice_mode and _wants_detailed_response(prompt)),
    )
    if direct_web_reply:
        return jsonify(
            {
                "reply": direct_web_reply,
                "provider": "web",
                "model": "web-direct",
                "used_web": True,
                "sources": (web_result or {}).get("sources", []),
            }
        )

    messages = _build_persona_messages(
        prompt,
        history,
        persona,
        web_context=web_context,
        voice_mode=voice_mode,
    )
    client = get_client(provider=provider_override, model_name=model_override)

    try:
        result = client.chat_once(messages=messages, options=options)
        content = _sanitize_assistant_reply(prompt, result.get("message", {}).get("content", ""))
        return jsonify(
            {
                "reply": content,
                "provider": provider_override or current_app.config["MODEL_PROVIDER"],
                "model": get_active_model_name(provider_override, model_override),
                "used_web": bool(web_context),
                "sources": (web_result or {}).get("sources", []),
            }
        )
    except Exception as exc:
        return jsonify({"error": f"Persona request failed: {exc}"}), 502
