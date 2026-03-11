from flask_sqlalchemy import SQLAlchemy
try:
    from flask_migrate import Migrate
except ImportError:  # pragma: no cover - optional dependency for local installs
    class Migrate:  # type: ignore[override]
        def __init__(self, *args, **kwargs):
            pass

        def init_app(self, *args, **kwargs):
            return None

db = SQLAlchemy()
migrate = Migrate(compare_type=True)
