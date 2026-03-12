import io
import os
import tempfile
import unittest
from unittest.mock import patch

from app import create_app
from app.extensions import db


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


class CollectionAndSearchTests(BaseTestCase):
    def test_collection_create_ingest_and_search(self):
        create_res = self.client.post(
            "/api/collections",
            headers=self.headers(),
            json={"name": "Project Docs", "description": "Knowledge base for specs"},
        )
        self.assertEqual(create_res.status_code, 201)
        collection_id = create_res.get_json()["id"]

        with patch("app.services.vector_store.VectorStoreService.embed_many", return_value=[[1.0, 0.0]]):
            ingest_res = self.client.post(
                f"/api/collections/{collection_id}/files",
                headers=self.headers(),
                data={"file": (io.BytesIO(b"Flask knowledge base spec and api docs"), "spec.txt")},
                content_type="multipart/form-data",
            )
        self.assertEqual(ingest_res.status_code, 201)

        with patch("app.services.vector_store.VectorStoreService.embed", return_value=[1.0, 0.0]):
            search_res = self.client.get("/api/search?q=Flask", headers=self.headers())
        self.assertEqual(search_res.status_code, 200)
        payload = search_res.get_json()["results"]
        self.assertTrue(payload["assets"])


class PersonaAndAdminTests(BaseTestCase):
    def test_persona_page_renders(self):
        res = self.client.get("/persona")
        self.assertEqual(res.status_code, 200)

    def test_persona_chat_uses_provider(self):
        with patch("app.routes.persona.get_client") as fake_get_client, patch(
            "app.routes.persona.get_active_model_name", return_value="persona-model"
        ):
            fake_get_client.return_value.chat_once.return_value = {
                "message": {"content": "Hello from persona."}
            }
            res = self.client.post(
                "/api/persona/chat",
                headers=self.headers(),
                json={"prompt": "hello", "persona": {"name": "Nova"}},
            )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.get_json()["reply"], "Hello from persona.")

    def test_admin_overview_works(self):
        res = self.client.get("/api/admin/overview", headers=self.headers())
        self.assertEqual(res.status_code, 200)
        payload = res.get_json()
        self.assertIn("counts", payload)
        self.assertIn("jobs", payload)
