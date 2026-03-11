Run migrations from your active venv:

```powershell
set FLASK_APP=manage.py
flask db init
flask db migrate -m "baseline schema"
flask db upgrade
```

The app no longer performs runtime `ALTER TABLE` mutations on startup. Existing databases that were already upgraded by older versions should continue to work, and future schema changes should go through Flask-Migrate/Alembic.
