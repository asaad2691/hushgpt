import os
from time import perf_counter
from uuid import uuid4

from flask import Blueprint, current_app, jsonify, request

from app.auth import require_api_key
from app.extensions import db
from app.models import Conversation, Message
from app.services.image_generator import ImageGenerationService
from app.services.image_reader import ImageReaderService

images_bp = Blueprint("images", __name__)


def _client_id():
    return (request.headers.get("X-Client-Id") or "legacy-default").strip()[:64] or "legacy-default"


def _get_or_create_conversation(conversation_id, title):
    if conversation_id:
        conv = Conversation.query.filter_by(id=conversation_id, client_id=_client_id()).first()
        if conv is None:
            return None
        return conv

    conv = Conversation(client_id=_client_id(), title=title[:120] if title else "Image request")
    db.session.add(conv)
    db.session.flush()
    return conv


def _get_uploaded_image_file():
    image_file = request.files.get("image")
    if image_file is None:
        image_file = request.files.get("file")
    if image_file is None and request.files:
        image_file = next(iter(request.files.values()))
    if image_file is not None and not (image_file.filename or "").strip() and image_file.content_length == 0:
        return None
    return image_file


def _save_uploaded_image(image_file):
    ext = os.path.splitext(image_file.filename or "")[1].lower()
    if ext not in {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"}:
        ext = ".png"

    uploaded_dir = os.path.join(current_app.static_folder, "uploads")
    os.makedirs(uploaded_dir, exist_ok=True)
    upload_name = f"{uuid4().hex}{ext}"
    upload_path = os.path.join(uploaded_dir, upload_name)
    image_bytes = image_file.read()
    with open(upload_path, "wb") as f:
        f.write(image_bytes)

    return image_bytes, f"/static/uploads/{upload_name}"


@images_bp.post("/images/analyze")
@require_api_key
def analyze_image():
    image_file = _get_uploaded_image_file()
    prompt = (request.form.get("prompt") or "").strip()
    conversation_id = request.form.get("conversation_id", type=int)

    if image_file is None:
        available = list(request.files.keys())
        return jsonify({"error": f"image file is required (received fields: {available})"}), 400

    try:
        started_at = perf_counter()
        user_prompt = prompt or "Describe this image."
        conv = _get_or_create_conversation(conversation_id, f"Image analysis: {user_prompt}")
        if conv is None:
            return jsonify({"error": "conversation not found"}), 404

        image_bytes, image_url = _save_uploaded_image(image_file)
        after_save = perf_counter()

        reader = ImageReaderService(current_app.config)
        data = reader.analyze(image_bytes, prompt)
        after_analysis = perf_counter()

        assistant_text = f"Image caption: {data['caption']}\n\nAnalysis:\n{data['analysis']}"
        db.session.add(
            Message(
                conversation_id=conv.id,
                role="user",
                content=f"[[user_image:{image_url}]]\n[Image Analyze] {user_prompt}",
            )
        )
        db.session.add(Message(conversation_id=conv.id, role="assistant", content=assistant_text))
        db.session.commit()

        data["conversation_id"] = conv.id
        data["image_url"] = image_url
        data["timings"] = {
            "save_seconds": round(after_save - started_at, 3),
            "analysis_seconds": round(after_analysis - after_save, 3),
            "total_seconds": round(after_analysis - started_at, 3),
        }
        return jsonify(data)
    except Exception as exc:
        db.session.rollback()
        return jsonify({"error": f"Image analysis failed: {exc}"}), 502


@images_bp.post("/images/edit")
@require_api_key
def edit_image():
    image_file = _get_uploaded_image_file()
    prompt = (request.form.get("prompt") or "").strip()
    negative_prompt = (request.form.get("negative_prompt") or "").strip()
    conversation_id = request.form.get("conversation_id", type=int)

    if image_file is None:
        available = list(request.files.keys())
        return jsonify({"error": f"image file is required (received fields: {available})"}), 400
    if not prompt:
        return jsonify({"error": "prompt is required"}), 400

    generated_dir = os.path.join(current_app.static_folder, "generated")
    try:
        conv = _get_or_create_conversation(conversation_id, f"Image edit: {prompt}")
        if conv is None:
            return jsonify({"error": "conversation not found"}), 404

        image_bytes, source_image_url = _save_uploaded_image(image_file)
        service = ImageGenerationService(current_app.config, generated_dir)
        result = service.edit(
            image_bytes=image_bytes,
            prompt=prompt,
            negative_prompt=negative_prompt or None,
            guidance_scale=7.0,
            num_inference_steps=30,
        )

        edited_url = f"/static/generated/{result['filename']}"

        db.session.add(
            Message(
                conversation_id=conv.id,
                role="user",
                content=f"[[user_image:{source_image_url}]]\n[Image Edit] {prompt}",
            )
        )
        db.session.add(
            Message(
                conversation_id=conv.id,
                role="assistant",
                content=f"[[edited_image:{edited_url}]]",
            )
        )
        db.session.commit()

        return jsonify(
            {
                "conversation_id": conv.id,
                "source_image_url": source_image_url,
                "edited_image_url": edited_url,
                "image_base64": result["base64"],
            }
        )
    except Exception as exc:
        db.session.rollback()
        return jsonify({"error": f"Image edit failed: {exc}"}), 502


@images_bp.post("/images/generate")
@require_api_key
def generate_image():
    body = request.get_json(silent=True) or {}
    prompt = (body.get("prompt") or "").strip()
    negative_prompt = (body.get("negative_prompt") or "").strip()
    conversation_id = body.get("conversation_id")
    if conversation_id is not None:
        try:
            conversation_id = int(conversation_id)
        except (TypeError, ValueError):
            return jsonify({"error": "conversation_id must be an integer"}), 400

    if not prompt:
        return jsonify({"error": "prompt is required"}), 400

    # ────────────────────────────────────────────────
    # Force-disable common safety keywords in negative prompt
    # (helps a bit even if model is aligned)
    # ────────────────────────────────────────────────
    generated_dir = os.path.join(current_app.static_folder, "generated")
    try:
        conv = _get_or_create_conversation(conversation_id, f"Image generation: {prompt}")
        if conv is None:
            return jsonify({"error": "conversation not found"}), 404

        service = ImageGenerationService(current_app.config, generated_dir)
        
        result = service.generate(
            prompt,
            negative_prompt=negative_prompt,
            guidance_scale=8.0,
            num_inference_steps=36,
        )
        
        filename = result["filename"]
        image_url = f"/static/generated/{filename}"

        db.session.add(Message(conversation_id=conv.id, role="user", content=f"[Image Generate] {prompt}"))
        db.session.add(
            Message(
                conversation_id=conv.id,
                role="assistant",
                content=f"[[generated_image:{image_url}]]",
            )
        )
        db.session.commit()

        return jsonify(
            {
                "conversation_id": conv.id,
                "image_url": image_url,
                "image_base64": result["base64"],
            }
        )
    except Exception as exc:
        db.session.rollback()
        return jsonify({"error": f"Image generation failed: {exc}"}), 502
