import os
import tempfile
import unittest

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
        if os.path.exists(self.db_path):
            os.unlink(self.db_path)

    def headers(self, **extra):
        base = {"X-API-Key": "test-key", "X-Client-Id": "test-client"}
        base.update(extra)
        return base


class AuthFlowTests(BaseTestCase):
    def test_register_login_and_me(self):
        res = self.client.post("/api/auth/register", json={"username": "tester", "password": "secret123"})
        self.assertEqual(res.status_code, 201)

        res = self.client.post("/api/auth/login", json={"username": "tester", "password": "secret123"})
        self.assertEqual(res.status_code, 200)
        token = res.get_json()["token"]

        res = self.client.get("/api/auth/me", headers=self.headers(**{"X-Auth-Token": token}))
        self.assertEqual(res.status_code, 200)
        payload = res.get_json()
        self.assertTrue(payload["authenticated"])
        self.assertEqual(payload["username"], "tester")


class JobLifecycleTests(BaseTestCase):
    def test_enqueue_run_retry_and_cancel(self):
        manager = self.app.extensions["job_manager"]
        manager.register_handler("test-job", lambda payload, progress: {"echo": payload["value"]})

        with self.app.app_context():
            job_id = manager.enqueue("test-job", client_id="test-client", user_id=None, payload={"value": "ok"})
            manager._run_job(job_id)

        res = self.client.get(f"/api/jobs/{job_id}", headers=self.headers())
        self.assertEqual(res.status_code, 200)
        payload = res.get_json()
        self.assertEqual(payload["status"], "done")
        self.assertEqual(payload["result"]["echo"], "ok")

        manager.register_handler("failing-job", lambda payload, progress: (_ for _ in ()).throw(RuntimeError("boom")))
        with self.app.app_context():
            failing_job_id = manager.enqueue("failing-job", client_id="test-client", user_id=None, payload={})
            manager._run_job(failing_job_id)

        retry_res = self.client.post(f"/api/jobs/{failing_job_id}/retry", headers=self.headers())
        self.assertEqual(retry_res.status_code, 200)

        with self.app.app_context():
            cancel_job_id = manager.enqueue("test-job", client_id="test-client", user_id=None, payload={"value": "later"})

        cancel_res = self.client.post(f"/api/jobs/{cancel_job_id}/cancel", headers=self.headers())
        self.assertEqual(cancel_res.status_code, 200)
