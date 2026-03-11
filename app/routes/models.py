from flask import Blueprint, current_app, jsonify
from app.auth import require_api_key
from app.services.llm_provider import get_client

models_bp = Blueprint("models", __name__)


@models_bp.get("/models")
@require_api_key
def list_models():
    payload = {
        "active_provider": current_app.config["MODEL_PROVIDER"],
        "active_model": (
            current_app.config["HUGGINGFACE_MODEL_ID"]
            if current_app.config["MODEL_PROVIDER"] == "huggingface"
            else current_app.config["OLLAMA_MODEL"]
        ),
        "providers": {
            "huggingface": [{"name": current_app.config["HUGGINGFACE_MODEL_ID"]}],
            "ollama": [{"name": current_app.config["OLLAMA_MODEL"]}],
        },
    }
    try:
        ollama_data = get_client(provider="ollama").tags()
        payload["providers"]["ollama"] = ollama_data.get("models", payload["providers"]["ollama"])
    except Exception:
        pass

    try:
        hf_data = get_client(provider="huggingface").tags()
        payload["providers"]["huggingface"] = hf_data.get("models", payload["providers"]["huggingface"])
    except Exception:
        pass

    return jsonify(payload)
