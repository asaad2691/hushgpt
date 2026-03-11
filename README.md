# HushGPT

Private AI. Local power. Everything in one workspace.

HushGPT is a private local AI workspace built with Flask for running chat, file workflows, image tools, voice interaction, retrieval, background jobs, and web-assisted answers from a single interface. It is designed for local-first usage with Hugging Face and Ollama support, MySQL-backed persistence, and a modern mobile-friendly UI.

## Overview

HushGPT combines multiple AI workflows into one app:

- conversational chat with short or detailed response presets
- file analysis, comparison, parsing, conversion, and generation
- image analysis, image editing, and image generation
- voice input, text-to-speech, and voice chat controls
- memory, retrieval, and conversation history
- web-assisted answers for current information
- background jobs with retry, cancel, and polling
- account-aware sessions and API access

## Core Features

### AI chat

- local-model chat through Hugging Face by default
- optional Ollama provider support
- per-request provider and model overrides
- concise, detailed, coding, and web-focused chat flows
- saved memory and retrieval-aware prompting

### File workflows

- file analyze
- file compare
- file parse
- file convert
- file generate
- parser modes for tables, resumes, invoices, contracts, and section summaries

### Image workflows

- image analyze with vision-first fallback handling
- OCR-assisted image understanding
- image generation
- image editing / image-to-image workflows

### Voice workflows

- microphone input to chat
- text-to-speech for assistant replies
- voice chat loop controls
- language and voice selection

### Operations and platform

- MySQL-backed data storage
- persistent background jobs
- retry and cancel for jobs
- health and diagnostics endpoints
- storage cleanup lifecycle controls
- admin overview and request metrics
- onboarding and prompt template support

## Tech Stack

- Python
- Flask
- Flask-SQLAlchemy
- optional Flask-Migrate / Alembic
- MySQL via PyMySQL
- Hugging Face Transformers
- Ollama
- Bootstrap 5
- JavaScript modular frontend

## Project Structure

```text
hushgpt/
├─ app/
│  ├─ __init__.py
│  ├─ auth.py
│  ├─ extensions.py
│  ├─ models.py
│  ├─ routes/
│  ├─ services/
│  ├─ static/
│  │  ├─ css/
│  │  ├─ img/
│  │  └─ js/
│  └─ templates/
├─ instance/
├─ migrations/
├─ tests/
├─ .env.example
├─ config.py
├─ manage.py
├─ requirements.txt
├─ run.py
└─ wsgi.py
```

## Setup

### 1. Create and activate a virtual environment

#### Windows PowerShell

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
```

#### macOS / Linux

```bash
python3 -m venv .venv
source .venv/bin/activate
```

### 2. Install dependencies

```bash
pip install -r requirements.txt
```

### 3. Create the environment file

#### Windows PowerShell

```powershell
Copy-Item .env.example .env
```

#### macOS / Linux

```bash
cp .env.example .env
```

### 4. Run the app

```bash
python run.py
```

The web UI is available at:

```text
http://127.0.0.1:5000/
```

## Model Setup

Default chat provider:

- `huggingface`

Default chat model:

- `Qwen/Qwen2.5-3B-Instruct`

Optional Ollama fallback:

- `qwen2.5:3b`

Example model pre-download:

```bash
python -c "from huggingface_hub import snapshot_download; snapshot_download('Qwen/Qwen2.5-3B-Instruct')"
```

## Database Setup

The project is configured for MySQL. Example local settings:

```env
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=
MYSQL_DATABASE=local_ai
```

Or use a full URI:

```env
DATABASE_URL=mysql+pymysql://root:@127.0.0.1:3306/local_ai?charset=utf8mb4
```

## Background Worker

For a cleaner production-style run, separate the web app and worker:

```powershell
python run.py
python -m app.worker
```

Use `.env` to configure worker behavior:

```env
JOB_RUNNER_MODE=embedded
JOB_POLL_INTERVAL=1.0
JOB_STALE_SECONDS=900
JOB_RETRY_LIMIT=2
```

## Migrations

HushGPT includes Flask-Migrate/Alembic support for schema changes.

```powershell
set FLASK_APP=manage.py
flask db init
flask db migrate -m "baseline schema"
flask db upgrade
```

## Tests

Run the current test suite with:

```powershell
python -m unittest discover -s tests
```

The included tests cover:

- auth flow
- job enqueue / retry / cancel
- image and file route failures
- chat provider override
- vector retrieval behavior

## API and UI Notes

- protected routes use `X-API-Key`
- account sessions are also supported in the UI
- generated files and uploaded media are local runtime artifacts and should not be committed
- voice playback quality depends on browser and OS voice availability

## Security Notes

Before public deployment:

- change `SECRET_KEY`
- change `APP_API_KEY`
- review `.env`
- configure production database credentials
- run behind a production server such as Waitress

## Author

Built and maintained by **Saad Ahmed**.

## License

This project is released under the MIT License. See [LICENSE](LICENSE).
