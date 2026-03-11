from flask import Blueprint, current_app, jsonify

health_bp = Blueprint("health", __name__)


@health_bp.get("/health")
def health():
    return jsonify({"status": "ok"})


@health_bp.get("/health/details")
def health_details():
    return jsonify(
        {
            "status": "ok",
            "pipelines": current_app.config.get("PIPELINE_STATUS", {}),
        }
    )
