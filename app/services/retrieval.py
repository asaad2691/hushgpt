import re

from app.models import Message


class ConversationRetrievalService:
    def __init__(self, app_config):
        self.max_snippets = int(app_config.get("RETRIEVAL_MAX_SNIPPETS", 4))

    def retrieve(self, conversation_id, query, excluded_message_ids=None):
        if not conversation_id or not query:
            return []

        excluded_message_ids = set(excluded_message_ids or [])
        query_terms = self._terms(query)
        if not query_terms:
            return []

        rows = (
            Message.query.filter_by(conversation_id=conversation_id)
            .order_by(Message.created_at.asc(), Message.id.asc())
            .all()
        )

        scored = []
        for row in rows:
            if row.id in excluded_message_ids:
                continue
            content = (row.content or "").strip()
            if not content:
                continue
            score = self._score_content(content, query_terms)
            if score <= 0:
                continue
            scored.append((score, row))

        scored.sort(key=lambda item: (item[0], item[1].id), reverse=True)
        snippets = []
        seen = set()
        for score, row in scored[: self.max_snippets]:
            key = (row.role, row.content[:160])
            if key in seen:
                continue
            seen.add(key)
            snippets.append(
                {
                    "message_id": row.id,
                    "role": row.role,
                    "content": row.content[:600],
                    "score": score,
                }
            )
        return snippets

    @staticmethod
    def _terms(text):
        words = re.findall(r"[a-zA-Z0-9_]{3,}", (text or "").lower())
        stop = {
            "this", "that", "with", "from", "have", "what", "when", "where", "which",
            "there", "would", "could", "should", "about", "into", "your", "please",
            "give", "tell", "show", "explain", "make", "need", "want",
        }
        return {word for word in words if word not in stop}

    def _score_content(self, content, query_terms):
        text = (content or "").lower()
        score = 0
        for term in query_terms:
            if term in text:
                score += 1
        return score
