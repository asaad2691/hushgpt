import json
import os
import base64

from flask import Blueprint, current_app, jsonify, request

from app.auth import get_current_user, get_request_client_id, require_api_key
from app.models import Job

jobs_bp = Blueprint("jobs", __name__)


@jobs_bp.get("/jobs")
@require_api_key
def list_jobs():
    client_id = get_request_client_id()
    user = get_current_user()
    query = Job.query.filter_by(client_id=client_id)
    if user is not None:
        query = query.filter((Job.user_id == user.id) | (Job.user_id.is_(None)))
    rows = query.order_by(Job.created_at.desc()).limit(50).all()
    return jsonify(
        [
            {
                "id": row.id,
                "job_type": row.job_type,
                "status": row.status,
                "progress": row.progress,
                "error": row.error,
                "created_at": row.created_at.isoformat() + "Z",
            }
            for row in rows
        ]
    )


@jobs_bp.get("/jobs/<int:job_id>")
@require_api_key
def get_job(job_id):
    client_id = get_request_client_id()
    row = Job.query.filter_by(id=job_id, client_id=client_id).first_or_404()
    result = {}
    if row.result_json:
        try:
            result = json.loads(row.result_json)
        except json.JSONDecodeError:
            result = {"raw": row.result_json}
    return jsonify(
        {
            "id": row.id,
            "job_type": row.job_type,
            "status": row.status,
            "progress": row.progress,
            "error": row.error,
            "result": result,
            "created_at": row.created_at.isoformat() + "Z",
            "updated_at": row.updated_at.isoformat() + "Z",
        }
    )


@jobs_bp.post("/jobs/<int:job_id>/retry")
@require_api_key
def retry_job(job_id):
    client_id = get_request_client_id()
    manager = current_app.extensions["job_manager"]
    try:
        retried = manager.retry_job(job_id, client_id)
    except RuntimeError as exc:
        return jsonify({"error": str(exc)}), 409
    if retried is None:
        return jsonify({"error": "job not found"}), 404
    return jsonify({"ok": True, "job_id": retried})


@jobs_bp.post("/jobs/<int:job_id>/cancel")
@require_api_key
def cancel_job(job_id):
    client_id = get_request_client_id()
    manager = current_app.extensions["job_manager"]
    cancelled = manager.cancel_job(job_id, client_id)
    if cancelled is None:
        return jsonify({"error": "job not found"}), 404
    return jsonify({"ok": True, "job_id": cancelled})


@jobs_bp.post("/jobs/image-generate")
@require_api_key
def queue_image_generate():
    body = request.get_json(silent=True) or {}
    prompt = (body.get("prompt") or "").strip()
    negative_prompt = (body.get("negative_prompt") or "").strip() or None
    if not prompt:
        return jsonify({"error": "prompt is required"}), 400

    client_id = get_request_client_id()
    user = get_current_user()
    app = current_app._get_current_object()
    job_id = app.extensions["job_manager"].enqueue(
        "image-generate",
        client_id=client_id,
        user_id=getattr(user, "id", None),
        payload={
            "prompt": prompt,
            "negative_prompt": negative_prompt,
            "conversation_id": body.get("conversation_id"),
            "client_id": client_id,
        },
    )
    return jsonify({"job_id": job_id, "status": "queued"}), 202


@jobs_bp.post("/jobs/file-analyze")
@require_api_key
def queue_file_analyze():
    uploaded = request.files.get("file")
    prompt = (request.form.get("prompt") or "").strip()
    if uploaded is None:
        return jsonify({"error": "file is required"}), 400

    file_bytes = uploaded.read()
    filename = uploaded.filename or "file"
    client_id = get_request_client_id()
    user = get_current_user()
    app = current_app._get_current_object()
    job_id = app.extensions["job_manager"].enqueue(
        "file-analyze",
        client_id=client_id,
        user_id=getattr(user, "id", None),
        payload={
            "filename": filename,
            "prompt": prompt,
            "file_base64": base64.b64encode(file_bytes).decode("ascii"),
            "conversation_id": request.form.get("conversation_id", type=int),
            "client_id": client_id,
        },
    )
    return jsonify({"job_id": job_id, "status": "queued"}), 202


@jobs_bp.post("/jobs/image-analyze")
@require_api_key
def queue_image_analyze():
    image_file = request.files.get("image") or request.files.get("file")
    prompt = (request.form.get("prompt") or "").strip()
    if image_file is None:
        return jsonify({"error": "image file is required"}), 400

    image_bytes = image_file.read()
    client_id = get_request_client_id()
    user = get_current_user()
    app = current_app._get_current_object()
    job_id = app.extensions["job_manager"].enqueue(
        "image-analyze",
        client_id=client_id,
        user_id=getattr(user, "id", None),
        payload={
            "prompt": prompt,
            "image_base64": base64.b64encode(image_bytes).decode("ascii"),
            "conversation_id": request.form.get("conversation_id", type=int),
            "client_id": client_id,
        },
    )
    return jsonify({"job_id": job_id, "status": "queued"}), 202
