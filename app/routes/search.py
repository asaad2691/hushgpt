from flask import Blueprint, jsonify, request

from app.auth import get_current_user, get_request_client_id, require_api_key
from app.models import CollectionAsset, Conversation, Job, KnowledgeCollection, MemoryItem

search_bp = Blueprint("search", __name__)


def _client_id():
    return get_request_client_id()


@search_bp.get("/search")
@require_api_key
def global_search():
    query = (request.args.get("q") or "").strip()
    if len(query) < 2:
        return jsonify({"query": query, "results": {}})

    user = get_current_user()
    conversations = Conversation.query.filter_by(client_id=_client_id()).all()
    conversation_results = [
        {
            "id": row.id,
            "title": row.title,
            "summary": row.summary,
            "created_at": row.created_at.isoformat() + "Z",
        }
        for row in conversations
        if query.lower() in (row.title or "").lower() or query.lower() in (row.summary or "").lower()
    ][:8]

    memory_query = MemoryItem.query.filter_by(client_id=_client_id())
    if user is not None:
        memory_query = memory_query.filter((MemoryItem.user_id == user.id) | (MemoryItem.user_id.is_(None)))
    memory_results = [
        {
            "id": row.id,
            "title": row.title,
            "scope": row.scope,
            "content": row.content[:180],
        }
        for row in memory_query.all()
        if query.lower() in (row.title or "").lower() or query.lower() in (row.content or "").lower()
    ][:8]

    collections_query = KnowledgeCollection.query.filter_by(client_id=_client_id())
    if user is not None:
        collections_query = collections_query.filter(
            (KnowledgeCollection.user_id == user.id) | (KnowledgeCollection.user_id.is_(None))
        )
    collection_rows = collections_query.all()
    collection_results = [
        {
            "id": row.id,
            "name": row.name,
            "description": row.description[:180],
        }
        for row in collection_rows
        if query.lower() in (row.name or "").lower() or query.lower() in (row.description or "").lower()
    ][:8]

    collection_ids = [row.id for row in collection_rows]
    asset_results = []
    if collection_ids:
        assets = CollectionAsset.query.filter(CollectionAsset.collection_id.in_(collection_ids)).all()
        asset_results = [
            {
                "id": row.id,
                "collection_id": row.collection_id,
                "title": row.title,
                "source_type": row.source_type,
                "preview": row.preview[:180],
            }
            for row in assets
            if query.lower() in (row.title or "").lower()
            or query.lower() in (row.source_ref or "").lower()
            or query.lower() in (row.preview or "").lower()
        ][:8]

    jobs = Job.query.filter_by(client_id=_client_id()).all()
    job_results = [
        {
            "id": row.id,
            "job_type": row.job_type,
            "status": row.status,
            "error": row.error[:180],
        }
        for row in jobs
        if query.lower() in (row.job_type or "").lower() or query.lower() in (row.error or "").lower()
    ][:8]

    return jsonify(
        {
            "query": query,
            "results": {
                "conversations": conversation_results,
                "memory": memory_results,
                "collections": collection_results,
                "assets": asset_results,
                "jobs": job_results,
            },
        }
    )
