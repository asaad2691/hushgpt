import json
import math

from app.extensions import db
from app.models import EmbeddingEntry


class VectorStoreService:
    _model = None
    _tokenizer = None
    _loaded_model_id = None

    def __init__(self, app_config):
        self.model_id = app_config["EMBEDDING_MODEL_ID"]
        self.max_chars = int(app_config.get("EMBEDDING_MAX_CHARS", 1200))
        self.top_k = int(app_config.get("VECTOR_SEARCH_TOP_K", 5))

    def index_text(self, client_id, source_type, source_key, text, title=None, conversation_id=None):
        chunks = self._chunk_text(text)
        if not chunks:
            return 0
        vectors = self.embed_many(chunks)
        EmbeddingEntry.query.filter(
            EmbeddingEntry.client_id == client_id,
            EmbeddingEntry.source_type == source_type,
            EmbeddingEntry.source_key.like(f"{source_key}%"),
        ).delete(synchronize_session=False)
        for idx, chunk in enumerate(chunks):
            db.session.add(
                EmbeddingEntry(
                    client_id=client_id,
                    conversation_id=conversation_id,
                    source_type=source_type,
                    source_key=f"{source_key}:{idx}",
                    title=title,
                    text=chunk,
                    vector_json=json.dumps(vectors[idx]),
                )
            )
        db.session.flush()
        return len(chunks)

    def search(self, client_id, query, top_k=None, source_types=None, conversation_id=None):
        query_vector = self.embed(query)
        rows = EmbeddingEntry.query.filter_by(client_id=client_id)
        if conversation_id is not None:
            rows = rows.filter((EmbeddingEntry.conversation_id == conversation_id) | (EmbeddingEntry.conversation_id.is_(None)))
        if source_types:
            rows = rows.filter(EmbeddingEntry.source_type.in_(source_types))
        candidates = rows.all()

        scored = []
        for row in candidates:
            try:
                vector = json.loads(row.vector_json)
            except json.JSONDecodeError:
                continue
            score = self._cosine_similarity(query_vector, vector)
            scored.append(
                {
                    "id": row.id,
                    "source_type": row.source_type,
                    "title": row.title,
                    "text": row.text,
                    "conversation_id": row.conversation_id,
                    "score": score,
                }
            )
        scored.sort(key=lambda item: item["score"], reverse=True)
        return [item for item in scored[: (top_k or self.top_k)] if item["score"] > 0.18]

    def embed(self, text):
        return self.embed_many([text])[0]

    def embed_many(self, texts):
        tokenizer, model = self._get_model()
        try:
            import torch
        except ImportError as exc:
            raise RuntimeError("torch is required for embeddings. Install with: pip install torch") from exc

        encoded = tokenizer(
            texts,
            padding=True,
            truncation=True,
            max_length=256,
            return_tensors="pt",
        )
        with torch.no_grad():
            outputs = model(**encoded)
            token_embeddings = outputs.last_hidden_state
            attention_mask = encoded["attention_mask"].unsqueeze(-1)
            summed = (token_embeddings * attention_mask).sum(dim=1)
            counts = attention_mask.sum(dim=1).clamp(min=1)
            pooled = summed / counts
            normalized = torch.nn.functional.normalize(pooled, p=2, dim=1)
        return normalized.cpu().tolist()

    def _get_model(self):
        if (
            VectorStoreService._model is not None
            and VectorStoreService._tokenizer is not None
            and VectorStoreService._loaded_model_id == self.model_id
        ):
            return VectorStoreService._tokenizer, VectorStoreService._model

        try:
            from transformers import AutoModel, AutoTokenizer
        except ImportError as exc:
            raise RuntimeError("transformers is required for embeddings. Install with: pip install transformers") from exc

        tokenizer = AutoTokenizer.from_pretrained(self.model_id)
        model = AutoModel.from_pretrained(self.model_id)
        VectorStoreService._tokenizer = tokenizer
        VectorStoreService._model = model
        VectorStoreService._loaded_model_id = self.model_id
        return tokenizer, model

    def _chunk_text(self, text):
        text = (text or "").strip()
        if not text:
            return []
        chunks = []
        start = 0
        while start < len(text):
            end = min(len(text), start + self.max_chars)
            chunks.append(text[start:end])
            if end >= len(text):
                break
            start = end - 150
        return chunks

    @staticmethod
    def _cosine_similarity(left, right):
        dot = sum(a * b for a, b in zip(left, right))
        left_norm = math.sqrt(sum(a * a for a in left))
        right_norm = math.sqrt(sum(b * b for b in right))
        if not left_norm or not right_norm:
            return 0.0
        return dot / (left_norm * right_norm)
