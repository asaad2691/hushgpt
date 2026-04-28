from flask import Blueprint, current_app, jsonify

from app.services.web_search import WebSearchService

health_bp = Blueprint("health", __name__)


@health_bp.get("/health")
def health():
    return jsonify({"status": "ok"})


@health_bp.get("/health/details")
def health_details():
    web_status = WebSearchService(current_app.config).check_connectivity()
    return jsonify(
        {
            "status": "ok",
            "pipelines": current_app.config.get("PIPELINE_STATUS", {}),
            "web": web_status,
        }
    )
