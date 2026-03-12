import re
from datetime import datetime

import requests
from flask import Blueprint, current_app, jsonify, request

from app.auth import get_current_user, get_request_client_id, require_api_key
from app.extensions import db
from app.models import CollectionAsset, KnowledgeCollection, EmbeddingEntry
from app.services.file_tools import FileToolsService
from app.services.vector_store import VectorStoreService

collections_bp = Blueprint("collections", __name__)


def _client_id():
    return get_request_client_id()


def _collection_query():
    user = get_current_user()
    query = KnowledgeCollection.query.filter_by(client_id=_client_id())
    if user is not None:
        query = query.filter(
            (KnowledgeCollection.user_id == user.id) | (KnowledgeCollection.user_id.is_(None))
        )
    return query


def _asset_payload(asset):
    return {
        "id": asset.id,
        "source_type": asset.source_type,
        "title": asset.title,
        "source_ref": asset.source_ref,
        "preview": asset.preview,
        "created_at": asset.created_at.isoformat() + "Z",
    }


def _collection_payload(collection):
    asset_count = CollectionAsset.query.filter_by(collection_id=collection.id).count()
    return {
        "id": collection.id,
        "name": collection.name,
        "description": collection.description,
        "shared": bool(collection.shared),
        "asset_count": asset_count,
        "created_at": collection.created_at.isoformat() + "Z",
        "updated_at": collection.updated_at.isoformat() + "Z",
    }


def _strip_html(html):
    text = re.sub(r"<script[\s\S]*?</script>", " ", html, flags=re.IGNORECASE)
    text = re.sub(r"<style[\s\S]*?</style>", " ", text, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _upsert_asset_embedding(collection_id, asset):
    vectors = VectorStoreService(current_app.config)
    vectors.index_text(
        _client_id(),
        "collection-document",
        f"collection-{collection_id}-asset-{asset.id}",
        asset.text_content,
        title=asset.title,
    )


@collections_bp.get("/collections")
@require_api_key
def list_collections():
    rows = _collection_query().order_by(KnowledgeCollection.updated_at.desc(), KnowledgeCollection.id.desc()).all()
    return jsonify([_collection_payload(row) for row in rows])


@collections_bp.post("/collections")
@require_api_key
def create_collection():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    description = (data.get("description") or "").strip()
    if not name:
        return jsonify({"error": "name is required"}), 400

    user = get_current_user()
    collection = KnowledgeCollection(
        client_id=_client_id(),
        user_id=getattr(user, "id", None),
        name=name[:160],
        description=description[:2000],
        shared=bool(data.get("shared")),
        updated_at=datetime.utcnow(),
    )
    db.session.add(collection)
    db.session.commit()
    return jsonify(_collection_payload(collection)), 201


@collections_bp.get("/collections/<int:collection_id>")
@require_api_key
def get_collection(collection_id):
    collection = _collection_query().filter_by(id=collection_id).first_or_404()
    assets = (
        CollectionAsset.query.filter_by(collection_id=collection.id)
        .order_by(CollectionAsset.created_at.desc(), CollectionAsset.id.desc())
        .all()
    )
    payload = _collection_payload(collection)
    payload["assets"] = [_asset_payload(asset) for asset in assets]
    return jsonify(payload)


@collections_bp.patch("/collections/<int:collection_id>")
@require_api_key
def update_collection(collection_id):
    collection = _collection_query().filter_by(id=collection_id).first_or_404()
    data = request.get_json(silent=True) or {}
    if "name" in data:
        name = (data.get("name") or "").strip()
        if not name:
            return jsonify({"error": "name is required"}), 400
        collection.name = name[:160]
    if "description" in data:
        collection.description = (data.get("description") or "").strip()[:2000]
    if "shared" in data:
        collection.shared = bool(data.get("shared"))
    collection.updated_at = datetime.utcnow()
    db.session.commit()
    return jsonify(_collection_payload(collection))


@collections_bp.delete("/collections/<int:collection_id>")
@require_api_key
def delete_collection(collection_id):
    collection = _collection_query().filter_by(id=collection_id).first_or_404()
    prefix = f"collection-{collection.id}-asset-"
    EmbeddingEntry.query.filter(
        EmbeddingEntry.client_id == _client_id(),
        EmbeddingEntry.source_type == "collection-document",
        EmbeddingEntry.source_key.like(f"{prefix}%"),
    ).delete(synchronize_session=False)
    CollectionAsset.query.filter_by(collection_id=collection.id).delete()
    db.session.delete(collection)
    db.session.commit()
    return jsonify({"ok": True})


@collections_bp.post("/collections/<int:collection_id>/clear")
@require_api_key
def clear_collection(collection_id):
    collection = _collection_query().filter_by(id=collection_id).first_or_404()
    prefix = f"collection-{collection.id}-asset-"
    EmbeddingEntry.query.filter(
        EmbeddingEntry.client_id == _client_id(),
        EmbeddingEntry.source_type == "collection-document",
        EmbeddingEntry.source_key.like(f"{prefix}%"),
    ).delete(synchronize_session=False)
    removed = CollectionAsset.query.filter_by(collection_id=collection.id).delete()
    collection.updated_at = datetime.utcnow()
    db.session.commit()
    return jsonify({"ok": True, "removed_assets": removed})


@collections_bp.post("/collections/<int:collection_id>/files")
@require_api_key
def ingest_collection_files(collection_id):
    collection = _collection_query().filter_by(id=collection_id).first_or_404()
    uploaded_files = request.files.getlist("files")
    if not uploaded_files:
        single = request.files.get("file")
        if single is not None:
            uploaded_files = [single]
    if not uploaded_files:
        return jsonify({"error": "file upload is required"}), 400

    service = FileToolsService(current_app.config, output_dir=current_app.static_folder)
    ingested = []
    for uploaded in uploaded_files:
        text = service._extract_text(uploaded.read(), uploaded.filename)
        preview = text[:500]
        asset = CollectionAsset(
            collection_id=collection.id,
            client_id=_client_id(),
            source_type="file",
            title=uploaded.filename[:220],
            source_ref=uploaded.filename[:500],
            text_content=text,
            preview=preview,
            updated_at=datetime.utcnow(),
        )
        db.session.add(asset)
        db.session.flush()
        _upsert_asset_embedding(collection.id, asset)
        ingested.append(_asset_payload(asset))

    collection.updated_at = datetime.utcnow()
    db.session.commit()
    return jsonify({"collection_id": collection.id, "assets": ingested}), 201


@collections_bp.post("/collections/<int:collection_id>/websites")
@require_api_key
def ingest_collection_website(collection_id):
    collection = _collection_query().filter_by(id=collection_id).first_or_404()
    data = request.get_json(silent=True) or {}
    url = (data.get("url") or "").strip()
    if not url:
        return jsonify({"error": "url is required"}), 400
    try:
        response = requests.get(
            url,
            timeout=current_app.config.get("WEB_SEARCH_TIMEOUT", 10),
            headers={"User-Agent": "HushGPT/1.0"},
        )
        response.raise_for_status()
    except Exception as exc:
        return jsonify({"error": f"Website ingestion failed: {exc}"}), 502

    text = _strip_html(response.text)
    if not text:
        return jsonify({"error": "No readable text found at the URL"}), 400

    asset = CollectionAsset(
        collection_id=collection.id,
        client_id=_client_id(),
        source_type="website",
        title=url[:220],
        source_ref=url[:500],
        text_content=text,
        preview=text[:500],
        updated_at=datetime.utcnow(),
    )
    db.session.add(asset)
    db.session.flush()
    _upsert_asset_embedding(collection.id, asset)
    collection.updated_at = datetime.utcnow()
    db.session.commit()
    return jsonify({"collection_id": collection.id, "asset": _asset_payload(asset)}), 201


@collections_bp.post("/collections/<int:collection_id>/reindex")
@require_api_key
def reindex_collection(collection_id):
    collection = _collection_query().filter_by(id=collection_id).first_or_404()
    assets = CollectionAsset.query.filter_by(collection_id=collection.id).all()
    for asset in assets:
        _upsert_asset_embedding(collection.id, asset)
    collection.updated_at = datetime.utcnow()
    db.session.commit()
    return jsonify({"collection_id": collection.id, "reindexed_assets": len(assets)})


@collections_bp.post("/collections/merge")
@require_api_key
def merge_collections():
    data = request.get_json(silent=True) or {}
    source_ids = data.get("source_ids") or []
    target_name = (data.get("name") or "").strip()
    if len(source_ids) < 2:
        return jsonify({"error": "At least two source_ids are required"}), 400
    if not target_name:
        return jsonify({"error": "name is required"}), 400

    sources = _collection_query().filter(KnowledgeCollection.id.in_(source_ids)).all()
    if len(sources) < 2:
        return jsonify({"error": "Could not resolve the requested collections"}), 404

    user = get_current_user()
    merged = KnowledgeCollection(
        client_id=_client_id(),
        user_id=getattr(user, "id", None),
        name=target_name[:160],
        description=(data.get("description") or "Merged collection").strip()[:2000],
        shared=any(item.shared for item in sources),
        updated_at=datetime.utcnow(),
    )
    db.session.add(merged)
    db.session.flush()

    copied = 0
    for source in sources:
        assets = CollectionAsset.query.filter_by(collection_id=source.id).all()
        for asset in assets:
            clone = CollectionAsset(
                collection_id=merged.id,
                client_id=_client_id(),
                source_type=asset.source_type,
                title=asset.title,
                source_ref=asset.source_ref,
                text_content=asset.text_content,
                preview=asset.preview,
                updated_at=datetime.utcnow(),
            )
            db.session.add(clone)
            db.session.flush()
            _upsert_asset_embedding(merged.id, clone)
            copied += 1

    db.session.commit()
    return jsonify({"collection": _collection_payload(merged), "copied_assets": copied}), 201
