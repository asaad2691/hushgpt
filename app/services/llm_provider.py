from flask import current_app

from app.services.huggingface_client import HuggingFaceClient
from app.services.ollama_client import OllamaClient


def get_client(provider=None, model_name=None):
    provider = (provider or current_app.config["MODEL_PROVIDER"]).lower()
    if provider == "huggingface":
        return HuggingFaceClient(current_app.config, model_id=model_name)
    if provider == "ollama":
        return OllamaClient(model=model_name)
    raise RuntimeError(f"Unsupported MODEL_PROVIDER: {provider}")


def get_active_model_name(provider=None, model_name=None):
    if model_name:
        return model_name
    provider = (provider or current_app.config["MODEL_PROVIDER"]).lower()
    if provider == "huggingface":
        return current_app.config["HUGGINGFACE_MODEL_ID"]
    return current_app.config["OLLAMA_MODEL"]
