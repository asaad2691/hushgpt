from flask import Blueprint, current_app, render_template
from app.services.llm_provider import get_active_model_name

web_bp = Blueprint("web", __name__)


@web_bp.get("/")
def index():
    return render_template(
        "index.html",
        api_key=current_app.config["APP_API_KEY"],
        model=get_active_model_name(),
        model_provider=current_app.config["MODEL_PROVIDER"],
        default_max_new_tokens=current_app.config["HUGGINGFACE_MAX_NEW_TOKENS"],
        default_temperature=current_app.config["HUGGINGFACE_TEMPERATURE"],
        default_top_p=current_app.config["HUGGINGFACE_TOP_P"],
        default_do_sample=current_app.config["HUGGINGFACE_DO_SAMPLE"],
    )
