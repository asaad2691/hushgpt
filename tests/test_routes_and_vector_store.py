import os
import tempfile
import unittest
from unittest.mock import patch

from app import create_app
from app.extensions import db
from app.models import EmbeddingEntry
from app.services.vector_store import VectorStoreService


class BaseTestCase(unittest.TestCase):
    def setUp(self):
        fd, self.db_path = tempfile.mkstemp(suffix=".sqlite")
        os.close(fd)
        self.app = create_app(
            {
                "TESTING": True,
                "SQLALCHEMY_DATABASE_URI": f"sqlite:///{self.db_path}",
                "WARMUP_IMAGE_ANALYZER": False,
                "JOB_RUNNER_MODE": "off",
                "AUTO_STORAGE_CLEANUP": False,
                "APP_API_KEY": "test-key",
            }
        )
        self.client = self.app.test_client()
        with self.app.app_context():
            db.drop_all()
            db.create_all()

    def tearDown(self):
        with self.app.app_context():
            db.session.remove()
            db.drop_all()
            db.engine.dispose()
        if os.path.exists(self.db_path):
            os.unlink(self.db_path)

    def headers(self, **extra):
        base = {"X-API-Key": "test-key", "X-Client-Id": "test-client"}
        base.update(extra)
        return base


class FailureRouteTests(BaseTestCase):
    def test_image_route_requires_file(self):
        res = self.client.post("/api/images/analyze", data={}, headers=self.headers())
        self.assertEqual(res.status_code, 400)

    def test_file_route_requires_file(self):
        res = self.client.post("/api/files/analyze", data={}, headers=self.headers())
        self.assertEqual(res.status_code, 400)

    def test_chat_provider_override_is_honored(self):
        with patch("app.routes.chat.get_client") as fake_get_client, patch(
            "app.routes.chat.get_active_model_name", return_value="provider-model"
        ):
            fake_get_client.return_value.chat_once.return_value = {"message": {"content": "ok"}}
            res = self.client.post(
                "/api/chat",
                headers=self.headers(),
                json={
                    "prompt": "hello",
                    "provider_override": "huggingface",
                    "model_override": "custom-model",
                },
            )
        self.assertEqual(res.status_code, 200)
        _, kwargs = fake_get_client.call_args
        self.assertEqual(kwargs["provider"], "huggingface")
        self.assertEqual(kwargs["model_name"], "custom-model")


class VectorStoreTests(BaseTestCase):
    def test_vector_results_return_relevant_match(self):
        with self.app.app_context():
            service = VectorStoreService(self.app.config)
            with patch.object(VectorStoreService, "embed_many", return_value=[[1.0, 0.0], [0.0, 1.0]]), patch.object(
                VectorStoreService, "embed", return_value=[1.0, 0.0]
            ):
                service.index_text("test-client", "file-chunk", "doc-a", "python flask api", title="Doc A")
                service.index_text("test-client", "file-chunk", "doc-b", "gardening soil plants", title="Doc B")
                rows = service.search("test-client", "flask api")
        self.assertTrue(rows)
        self.assertEqual(rows[0]["title"], "Doc A")
