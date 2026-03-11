from datetime import datetime, timedelta
from pathlib import Path


class StorageLifecycleService:
    def __init__(self, app):
        self.app = app
        self.retention_days = int(app.config.get("FILE_RETENTION_DAYS", 14))
        self.targets = [
            Path(app.static_folder) / "generated",
            Path(app.static_folder) / "generated_files",
            Path(app.static_folder) / "uploads",
        ]

    def cleanup(self):
        removed = []
        cutoff = datetime.utcnow() - timedelta(days=self.retention_days)
        for target in self.targets:
            if not target.exists():
                continue
            for path in target.iterdir():
                try:
                    modified = datetime.utcfromtimestamp(path.stat().st_mtime)
                except OSError:
                    continue
                if modified >= cutoff:
                    continue
                try:
                    if path.is_file():
                        path.unlink()
                        removed.append(str(path.name))
                except OSError:
                    continue
        return removed

    def stats(self):
        payload = {}
        for target in self.targets:
            key = target.name
            if not target.exists():
                payload[key] = {"count": 0, "bytes": 0}
                continue
            count = 0
            total_bytes = 0
            for path in target.iterdir():
                if not path.is_file():
                    continue
                count += 1
                try:
                    total_bytes += path.stat().st_size
                except OSError:
                    continue
            payload[key] = {"count": count, "bytes": total_bytes}
        return payload
