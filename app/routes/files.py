import os
import json
from datetime import datetime

from flask import Blueprint, current_app, jsonify, request

from app.auth import require_api_key
from app.extensions import db
from app.models import CollectionAsset, Conversation, KnowledgeCollection, Message
from app.services.file_tools import FileToolsService
from app.services.vector_store import VectorStoreService

files_bp = Blueprint("files", __name__)


def _client_id():
    return (request.headers.get("X-Client-Id") or "legacy-default").strip()[:64] or "legacy-default"


def _get_or_create_conversation(conversation_id, title):
    if conversation_id:
        conv = Conversation.query.filter_by(id=conversation_id, client_id=_client_id()).first()
        if conv is None:
            return None
        return conv
    conv = Conversation(client_id=_client_id(), title=title[:120] if title else "File request")
    db.session.add(conv)
    db.session.flush()
    return conv


def _file_token(url, filename):
    return f"[[file:{url}|{filename}]]"


def _collection_id_from_request():
    raw = request.form.get("collection_id") or request.args.get("collection_id")
    if raw in {None, ""}:
        return None
    try:
        return int(raw)
    except (TypeError, ValueError):
        return None


def _save_asset_to_collection(collection_id, title, text, source_type="file", source_ref=""):
    if not collection_id or not text:
        return None
    collection = KnowledgeCollection.query.filter_by(id=collection_id, client_id=_client_id()).first()
    if collection is None:
        return None
    asset = CollectionAsset(
        collection_id=collection.id,
        client_id=_client_id(),
        source_type=source_type,
        title=(title or source_ref or "Document")[:220],
        source_ref=(source_ref or title or "")[:500],
        text_content=text,
        preview=text[:500],
        updated_at=datetime.utcnow(),
    )
    db.session.add(asset)
    db.session.flush()
    vectors = VectorStoreService(current_app.config)
    vectors.index_text(
        _client_id(),
        "collection-document",
        f"collection-{collection.id}-asset-{asset.id}",
        text,
        title=asset.title,
    )
    collection.updated_at = datetime.utcnow()
    return asset


@files_bp.post("/files/analyze")
@require_api_key
def analyze_file():
    uploaded = request.files.get("file")
    prompt = (request.form.get("prompt") or "").strip()
    conversation_id = request.form.get("conversation_id", type=int)
    collection_id = _collection_id_from_request()
    if uploaded is None:
        return jsonify({"error": "file is required"}), 400

    output_dir = os.path.join(current_app.static_folder, "generated_files")
    service = FileToolsService(current_app.config, output_dir)
    try:
        conv = _get_or_create_conversation(conversation_id, f"File analyze: {uploaded.filename}")
        if conv is None:
            return jsonify({"error": "conversation not found"}), 404

        result = service.analyze(uploaded.read(), uploaded.filename, prompt)
        try:
            vectors = VectorStoreService(current_app.config)
            vectors.index_text(_client_id(), "file-chunk", f"file-{conv.id}-{uploaded.filename}", result.get("full_text", result["text_preview"]), title=uploaded.filename, conversation_id=conv.id)
            _save_asset_to_collection(collection_id, uploaded.filename, result.get("full_text", result["text_preview"]), source_ref=uploaded.filename)
        except Exception:
            pass
        user_text = f"[File Analyze] {uploaded.filename}\n{prompt}" if prompt else f"[File Analyze] {uploaded.filename}"
        db.session.add(Message(conversation_id=conv.id, role="user", content=user_text))
        db.session.add(Message(conversation_id=conv.id, role="assistant", content=result["analysis"]))
        db.session.commit()
        return jsonify(
            {
                "conversation_id": conv.id,
                "analysis": result["analysis"],
                "text_preview": result["text_preview"],
            }
        )
    except Exception as exc:
        db.session.rollback()
        return jsonify({"error": f"File analysis failed: {exc}"}), 502


@files_bp.post("/files/generate")
@require_api_key
def generate_file():
    body = request.get_json(silent=True) or {}
    prompt = (body.get("prompt") or "").strip()
    target_format = (body.get("target_format") or "").strip()
    filename = (body.get("filename") or "").strip() or None
    conversation_id = body.get("conversation_id")
    if conversation_id is not None:
        try:
            conversation_id = int(conversation_id)
        except (TypeError, ValueError):
            return jsonify({"error": "conversation_id must be an integer"}), 400

    if not prompt:
        return jsonify({"error": "prompt is required"}), 400
    if not target_format:
        return jsonify({"error": "target_format is required"}), 400

    output_dir = os.path.join(current_app.static_folder, "generated_files")
    service = FileToolsService(current_app.config, output_dir)
    try:
        conv = _get_or_create_conversation(conversation_id, f"File generate: {target_format}")
        if conv is None:
            return jsonify({"error": "conversation not found"}), 404

        result = service.generate(prompt, target_format, filename=filename)
        file_url = f"/static/generated_files/{result['filename']}"
        token = _file_token(file_url, result["filename"])

        db.session.add(Message(conversation_id=conv.id, role="user", content=f"[File Generate {target_format}] {prompt}"))
        db.session.add(Message(conversation_id=conv.id, role="assistant", content=token))
        db.session.commit()
        return jsonify({"conversation_id": conv.id, "file_url": file_url, "filename": result["filename"]})
    except Exception as exc:
        db.session.rollback()
        return jsonify({"error": f"File generation failed: {exc}"}), 502


@files_bp.post("/files/convert")
@require_api_key
def convert_file():
    uploaded = request.files.get("file")
    target_format = (request.form.get("target_format") or "").strip()
    conversation_id = request.form.get("conversation_id", type=int)
    if uploaded is None:
        return jsonify({"error": "file is required"}), 400
    if not target_format:
        return jsonify({"error": "target_format is required"}), 400

    output_dir = os.path.join(current_app.static_folder, "generated_files")
    service = FileToolsService(current_app.config, output_dir)
    try:
        conv = _get_or_create_conversation(conversation_id, f"File convert: {uploaded.filename}")
        if conv is None:
            return jsonify({"error": "conversation not found"}), 404

        result = service.convert(uploaded.read(), uploaded.filename, target_format)
        file_url = f"/static/generated_files/{result['filename']}"
        token = _file_token(file_url, result["filename"])

        db.session.add(
            Message(
                conversation_id=conv.id,
                role="user",
                content=f"[File Convert] {uploaded.filename} -> {target_format}",
            )
        )
        db.session.add(Message(conversation_id=conv.id, role="assistant", content=token))
        db.session.commit()
        return jsonify({"conversation_id": conv.id, "file_url": file_url, "filename": result["filename"]})
    except Exception as exc:
        db.session.rollback()
        return jsonify({"error": f"File conversion failed: {exc}"}), 502


@files_bp.post("/files/compare")
@require_api_key
def compare_files():
    left = request.files.get("left_file")
    right = request.files.get("right_file")
    prompt = (request.form.get("prompt") or "").strip()
    conversation_id = request.form.get("conversation_id", type=int)
    collection_id = _collection_id_from_request()
    if left is None or right is None:
        return jsonify({"error": "left_file and right_file are required"}), 400

    output_dir = os.path.join(current_app.static_folder, "generated_files")
    service = FileToolsService(current_app.config, output_dir)
    try:
        conv = _get_or_create_conversation(conversation_id, f"File compare: {left.filename} vs {right.filename}")
        if conv is None:
            return jsonify({"error": "conversation not found"}), 404

        result = service.compare(left.read(), left.filename, right.read(), right.filename, prompt)
        try:
            vectors = VectorStoreService(current_app.config)
            vectors.index_text(_client_id(), "file-chunk", f"file-{conv.id}-{left.filename}", result.get("left_full_text", result["left_preview"]), title=left.filename, conversation_id=conv.id)
            vectors.index_text(_client_id(), "file-chunk", f"file-{conv.id}-{right.filename}", result.get("right_full_text", result["right_preview"]), title=right.filename, conversation_id=conv.id)
            _save_asset_to_collection(collection_id, left.filename, result.get("left_full_text", result["left_preview"]), source_ref=left.filename)
            _save_asset_to_collection(collection_id, right.filename, result.get("right_full_text", result["right_preview"]), source_ref=right.filename)
        except Exception:
            pass
        user_text = f"[File Compare] {left.filename} vs {right.filename}\n{prompt}".strip()
        db.session.add(Message(conversation_id=conv.id, role="user", content=user_text))
        db.session.add(Message(conversation_id=conv.id, role="assistant", content=result["comparison"]))
        db.session.commit()
        return jsonify({"conversation_id": conv.id, **result})
    except Exception as exc:
        db.session.rollback()
        return jsonify({"error": f"File comparison failed: {exc}"}), 502


@files_bp.post("/files/parse")
@require_api_key
def parse_file():
    uploaded = request.files.get("file")
    parser_type = (request.form.get("parser_type") or "").strip().lower()
    prompt = (request.form.get("prompt") or "").strip()
    conversation_id = request.form.get("conversation_id", type=int)
    collection_id = _collection_id_from_request()
    if uploaded is None:
        return jsonify({"error": "file is required"}), 400
    if not parser_type:
        return jsonify({"error": "parser_type is required"}), 400

    output_dir = os.path.join(current_app.static_folder, "generated_files")
    service = FileToolsService(current_app.config, output_dir)
    try:
        conv = _get_or_create_conversation(conversation_id, f"File parse: {uploaded.filename}")
        if conv is None:
            return jsonify({"error": "conversation not found"}), 404
        file_bytes = uploaded.read()
        result = service.parse(file_bytes, uploaded.filename, parser_type)
        try:
            _save_asset_to_collection(collection_id, uploaded.filename, service._extract_text(file_bytes, uploaded.filename), source_ref=uploaded.filename)
        except Exception:
            pass
        assistant_text = result.get("raw") or result.get("data") or result
        if not isinstance(assistant_text, str):
            assistant_text = json.dumps(assistant_text, indent=2, ensure_ascii=False)
        user_text = f"[File Parse {parser_type}] {uploaded.filename}\n{prompt}".strip()
        db.session.add(Message(conversation_id=conv.id, role="user", content=user_text))
        db.session.add(Message(conversation_id=conv.id, role="assistant", content=f"```json\n{assistant_text}\n```"))
        db.session.commit()
        result["conversation_id"] = conv.id
        return jsonify(result)
    except Exception as exc:
        db.session.rollback()
        return jsonify({"error": f"File parse failed: {exc}"}), 502
