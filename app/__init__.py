import os
from time import perf_counter

from flask import Flask, g, request
from config import Config
from .extensions import db, migrate
from .models import RequestLog
from .services.job_manager import PersistentJobManager
from .services.storage_lifecycle import StorageLifecycleService
from .routes.health import health_bp
from .routes.models import models_bp
from .routes.chat import chat_bp
from .routes.conversations import conversations_bp
from .routes.web import web_bp
from .routes.images import images_bp
from .routes.files import files_bp
from .routes.user_auth import auth_bp
from .routes.jobs import jobs_bp
from .routes.admin import admin_bp
from .routes.memory import memory_bp
from .routes.feedback import feedback_bp
from .routes.persona import persona_bp


def _warmup_pipelines(app):
    status = {
        "image_captioner": {"ready": False, "error": None},
        "image_ocr": {"ready": False, "error": None},
    }
    with app.app_context():
        if app.config.get("WARMUP_IMAGE_ANALYZER", False):
            from .services.image_reader import ImageReaderService

            reader = ImageReaderService(app.config)
            try:
                reader._get_captioner()
                status["image_captioner"]["ready"] = True
            except Exception as exc:
                status["image_captioner"]["error"] = str(exc)

            try:
                reader._get_ocr_reader()
                status["image_ocr"]["ready"] = True
            except Exception as exc:
                status["image_ocr"]["error"] = str(exc)
    app.config["PIPELINE_STATUS"] = status


def _register_job_handlers(app, manager):
    import base64

    from .extensions import db
    from .models import Conversation, Message
    from .services.file_tools import FileToolsService
    from .services.image_generator import ImageGenerationService
    from .services.image_reader import ImageReaderService

    def get_or_create_conversation(payload, title):
        conversation_id = payload.get("conversation_id")
        client_id = payload.get("client_id", "legacy-default")
        if conversation_id:
            conv = Conversation.query.filter_by(id=conversation_id, client_id=client_id).first()
            if conv is not None:
                return conv
        conv = Conversation(client_id=client_id, title=(title or "Background job")[:120])
        db.session.add(conv)
        db.session.flush()
        return conv

    def image_generate_handler(payload, progress):
        generated_dir = os.path.join(app.static_folder, "generated")
        progress(20)
        conv = get_or_create_conversation(payload, f"Image generation: {payload['prompt']}")
        service = ImageGenerationService(app.config, generated_dir)
        result = service.generate(
            payload["prompt"],
            negative_prompt=payload.get("negative_prompt"),
            guidance_scale=7.0,
            num_inference_steps=30,
        )
        image_url = f"/static/generated/{result['filename']}"
        db.session.add(Message(conversation_id=conv.id, role="user", content=f"[Image Generate] {payload['prompt']}"))
        db.session.add(Message(conversation_id=conv.id, role="assistant", content=f"[[generated_image:{image_url}]]"))
        db.session.commit()
        progress(90)
        return {
            "conversation_id": conv.id,
            "image_url": image_url,
            "image_base64": result["base64"],
        }

    def image_analyze_handler(payload, progress):
        progress(20)
        conv = get_or_create_conversation(payload, f"Image analysis: {payload.get('prompt') or 'Describe this image.'}")
        reader = ImageReaderService(app.config)
        image_bytes = base64.b64decode(payload["image_base64"])
        uploads_dir = os.path.join(app.static_folder, "uploads")
        os.makedirs(uploads_dir, exist_ok=True)
        upload_name = f"{base64.urlsafe_b64encode(os.urandom(9)).decode('ascii').rstrip('=')}.png"
        upload_path = os.path.join(uploads_dir, upload_name)
        with open(upload_path, "wb") as f:
            f.write(image_bytes)
        result = reader.analyze(image_bytes, payload.get("prompt", ""))
        image_url = f"/static/uploads/{upload_name}"
        user_prompt = payload.get("prompt") or "Describe this image."
        assistant_text = f"Image caption: {result['caption']}\n\nAnalysis:\n{result['analysis']}"
        db.session.add(Message(conversation_id=conv.id, role="user", content=f"[[user_image:{image_url}]]\n[Image Analyze] {user_prompt}"))
        db.session.add(Message(conversation_id=conv.id, role="assistant", content=assistant_text))
        db.session.commit()
        progress(90)
        result["conversation_id"] = conv.id
        result["image_url"] = image_url
        return result

    def file_analyze_handler(payload, progress):
        progress(20)
        conv = get_or_create_conversation(payload, f"File analyze: {payload['filename']}")
        output_dir = os.path.join(app.static_folder, "generated_files")
        service = FileToolsService(app.config, output_dir)
        file_bytes = base64.b64decode(payload["file_base64"])
        result = service.analyze(file_bytes, payload["filename"], payload.get("prompt", ""))
        prompt = payload.get("prompt", "")
        user_text = f"[File Analyze] {payload['filename']}\n{prompt}" if prompt else f"[File Analyze] {payload['filename']}"
        db.session.add(Message(conversation_id=conv.id, role="user", content=user_text))
        db.session.add(Message(conversation_id=conv.id, role="assistant", content=result["analysis"]))
        db.session.commit()
        progress(90)
        result["conversation_id"] = conv.id
        return result

    manager.register_handler("image-generate", image_generate_handler)
    manager.register_handler("image-analyze", image_analyze_handler)
    manager.register_handler("file-analyze", file_analyze_handler)


def create_app(test_config=None):
    app = Flask(__name__, instance_relative_config=True)
    app.config.from_object(Config)
    if test_config:
        app.config.update(test_config)
    os.makedirs(os.path.join(app.static_folder, "generated"), exist_ok=True)
    os.makedirs(os.path.join(app.static_folder, "generated_files"), exist_ok=True)
    os.makedirs(os.path.join(app.static_folder, "uploads"), exist_ok=True)

    db.init_app(app)
    migrate.init_app(app, db)

    with app.app_context():
        from . import models  # noqa: F401
        db.create_all()
        if app.config.get("AUTO_STORAGE_CLEANUP", True):
            StorageLifecycleService(app).cleanup()

    app.register_blueprint(health_bp, url_prefix="/api")
    app.register_blueprint(models_bp, url_prefix="/api")
    app.register_blueprint(auth_bp, url_prefix="/api")
    app.register_blueprint(chat_bp, url_prefix="/api")
    app.register_blueprint(conversations_bp, url_prefix="/api")
    app.register_blueprint(images_bp, url_prefix="/api")
    app.register_blueprint(files_bp, url_prefix="/api")
    app.register_blueprint(jobs_bp, url_prefix="/api")
    app.register_blueprint(admin_bp, url_prefix="/api")
    app.register_blueprint(memory_bp, url_prefix="/api")
    app.register_blueprint(feedback_bp, url_prefix="/api")
    app.register_blueprint(persona_bp)
    app.register_blueprint(web_bp)
    app.extensions["job_manager"] = PersistentJobManager(app)
    _register_job_handlers(app, app.extensions["job_manager"])
    if app.config.get("JOB_RUNNER_MODE", "embedded") in {"embedded", "both"}:
        app.extensions["job_manager"].start()
    _warmup_pipelines(app)

    @app.before_request
    def _before_request():
        g.request_started_at = perf_counter()

    @app.after_request
    def _after_request(response):
        if request.path.startswith("/static/"):
            return response
        try:
            duration_ms = int((perf_counter() - getattr(g, "request_started_at", perf_counter())) * 1000)
            user = getattr(g, "current_user", None)
            db.session.add(
                RequestLog(
                    client_id=(request.headers.get("X-Client-Id") or "legacy-default")[:64],
                    user_id=getattr(user, "id", None),
                    route=request.path[:160],
                    method=request.method[:12],
                    duration_ms=duration_ms,
                    status_code=response.status_code,
                )
            )
            db.session.commit()
        except Exception:
            db.session.rollback()
        return response

    return app
