from pathlib import Path

from flask import Blueprint, current_app, jsonify

from app.auth import require_api_key
from app.models import Conversation, Job, Message, RequestLog, User
from app.services.storage_lifecycle import StorageLifecycleService

admin_bp = Blueprint("admin", __name__)


@admin_bp.get("/admin/overview")
@require_api_key
def overview():
    generated_dir = Path(current_app.static_folder) / "generated"
    uploads_dir = Path(current_app.static_folder) / "uploads"
    files_dir = Path(current_app.static_folder) / "generated_files"

    return jsonify(
        {
            "counts": {
                "users": User.query.count(),
                "conversations": Conversation.query.count(),
                "messages": Message.query.count(),
                "jobs": Job.query.count(),
                "request_logs": RequestLog.query.count(),
            },
            "jobs": {
                "queued": Job.query.filter_by(status="queued").count(),
                "running": Job.query.filter_by(status="running").count(),
                "done": Job.query.filter_by(status="done").count(),
                "failed": Job.query.filter_by(status="failed").count(),
            },
            "storage": {
                "generated_images": len(list(generated_dir.glob("*"))) if generated_dir.exists() else 0,
                "uploads": len(list(uploads_dir.glob("*"))) if uploads_dir.exists() else 0,
                "generated_files": len(list(files_dir.glob("*"))) if files_dir.exists() else 0,
            },
        }
    )


@admin_bp.get("/admin/slow-requests")
@require_api_key
def slow_requests():
    rows = (
        RequestLog.query.order_by(RequestLog.duration_ms.desc(), RequestLog.id.desc())
        .limit(25)
        .all()
    )
    return jsonify(
        [
            {
                "route": row.route,
                "method": row.method,
                "duration_ms": row.duration_ms,
                "status_code": row.status_code,
                "created_at": row.created_at.isoformat() + "Z",
            }
            for row in rows
        ]
    )


@admin_bp.get("/admin/storage")
@require_api_key
def storage_stats():
    service = StorageLifecycleService(current_app)
    return jsonify(service.stats())


@admin_bp.post("/admin/storage/cleanup")
@require_api_key
def cleanup_storage():
    service = StorageLifecycleService(current_app)
    removed = service.cleanup()
    return jsonify({"removed": removed, "count": len(removed)})
