import json
import time
from datetime import datetime
from threading import Lock, Thread

from app.extensions import db
from app.models import Job


class PersistentJobManager:
    def __init__(self, app):
        self.app = app
        self.handlers = {}
        self.lock = Lock()
        self.worker = None
        self.poll_interval = float(app.config.get("JOB_POLL_INTERVAL", 1.0))
        self.stale_seconds = int(app.config.get("JOB_STALE_SECONDS", 900))
        self.retry_limit = int(app.config.get("JOB_RETRY_LIMIT", 2))

    def register_handler(self, job_type, handler):
        self.handlers[job_type] = handler

    def enqueue(self, job_type, client_id, user_id, payload):
        with self.app.app_context():
            job = Job(
                client_id=client_id,
                user_id=user_id,
                job_type=job_type,
                status="queued",
                progress=0,
                payload_json=json.dumps(payload, ensure_ascii=False),
                updated_at=datetime.utcnow(),
            )
            db.session.add(job)
            db.session.commit()
            return job.id

    def _start_worker(self):
        if self.worker and self.worker.is_alive():
            return
        self.worker = Thread(target=self._worker_loop, daemon=True)
        self.worker.start()

    def start(self):
        self._start_worker()

    def run_forever(self):
        self._worker_loop()

    def retry_job(self, job_id, client_id):
        with self.app.app_context():
            job = Job.query.filter_by(id=job_id, client_id=client_id).first()
            if job is None:
                return None
            payload = self._load_payload(job)
            meta = payload.setdefault("_meta", {})
            attempts = int(meta.get("attempts", 0))
            if attempts >= self.retry_limit:
                raise RuntimeError("Retry limit reached for this job.")
            job.status = "queued"
            job.progress = 0
            job.error = ""
            job.result_json = ""
            job.updated_at = datetime.utcnow()
            job.payload_json = json.dumps(payload, ensure_ascii=False)
            db.session.commit()
            return job.id

    def cancel_job(self, job_id, client_id):
        with self.app.app_context():
            job = Job.query.filter_by(id=job_id, client_id=client_id).first()
            if job is None:
                return None
            if job.status in {"done", "failed", "cancelled"}:
                return job.id
            job.status = "cancelled"
            job.error = "Cancelled by user."
            job.updated_at = datetime.utcnow()
            db.session.commit()
            return job.id

    def _worker_loop(self):
        while True:
            processed = False
            with self.lock:
                with self.app.app_context():
                    self._recover_stale_jobs()
                    job = (
                        Job.query.filter(Job.status.in_(["queued", "running"]))
                        .order_by(Job.created_at.asc())
                        .first()
                    )
                    if job is not None:
                        processed = True
                        self._run_job(job.id)
            if not processed:
                time.sleep(self.poll_interval)

    def _run_job(self, job_id):
        with self.app.app_context():
            job = Job.query.get(job_id)
            if job is None:
                return
            if job.status == "cancelled":
                return
            handler = self.handlers.get(job.job_type)
            if handler is None:
                job.status = "failed"
                job.error = f"No handler registered for job type {job.job_type}"
                job.updated_at = datetime.utcnow()
                db.session.commit()
                return

            payload = self._load_payload(job)
            meta = payload.setdefault("_meta", {})
            meta["attempts"] = int(meta.get("attempts", 0)) + 1
            job.status = "running"
            job.progress = max(job.progress, 5)
            job.updated_at = datetime.utcnow()
            job.payload_json = json.dumps(payload, ensure_ascii=False)
            db.session.commit()

            try:
                result = handler(payload, self._progress_callback(job.id))
                job = Job.query.get(job.id)
                if job is None:
                    return
                if job.status == "cancelled":
                    db.session.commit()
                    return
                job.status = "done"
                job.progress = 100
                job.result_json = json.dumps(result, ensure_ascii=False)
                job.error = ""
                job.updated_at = datetime.utcnow()
                db.session.commit()
            except Exception as exc:
                job = Job.query.get(job.id)
                if job is None:
                    return
                payload = self._load_payload(job)
                attempts = int(payload.get("_meta", {}).get("attempts", 1))
                if attempts < self.retry_limit:
                    job.status = "queued"
                    job.progress = 0
                    job.error = f"Retrying after failure: {exc}"
                else:
                    job.status = "failed"
                    job.error = str(exc)
                job.updated_at = datetime.utcnow()
                db.session.commit()

    def _progress_callback(self, job_id):
        def update(progress):
            with self.app.app_context():
                job = Job.query.get(job_id)
                if job is None:
                    return
                if job.status == "cancelled":
                    return
                job.progress = max(0, min(99, int(progress)))
                job.updated_at = datetime.utcnow()
                db.session.commit()

        return update

    def _recover_stale_jobs(self):
        threshold = datetime.utcnow().timestamp() - self.stale_seconds
        stale_jobs = Job.query.filter_by(status="running").all()
        for job in stale_jobs:
            if job.updated_at and job.updated_at.timestamp() >= threshold:
                continue
            payload = self._load_payload(job)
            attempts = int(payload.get("_meta", {}).get("attempts", 1))
            if attempts < self.retry_limit:
                job.status = "queued"
                job.progress = 0
                job.error = "Recovered stale running job."
            else:
                job.status = "failed"
                job.error = "Job marked stale after retry limit."
            job.updated_at = datetime.utcnow()
        if stale_jobs:
            db.session.commit()

    @staticmethod
    def _load_payload(job):
        try:
            return json.loads(job.payload_json or "{}")
        except json.JSONDecodeError:
            return {}
