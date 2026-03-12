import os
from urllib.parse import quote_plus
from dotenv import load_dotenv

load_dotenv()


class Config:
    MYSQL_HOST = os.getenv("MYSQL_HOST", "127.0.0.1")
    MYSQL_PORT = int(os.getenv("MYSQL_PORT", "3306"))
    MYSQL_USER = os.getenv("MYSQL_USER", "root")
    MYSQL_PASSWORD = os.getenv("MYSQL_PASSWORD", "")
    MYSQL_DATABASE = os.getenv("MYSQL_DATABASE", "local_ai")

    _password = quote_plus(MYSQL_PASSWORD) if MYSQL_PASSWORD else ""
    _auth = MYSQL_USER if not _password else f"{MYSQL_USER}:{_password}"
    _default_db_url = (
        f"mysql+pymysql://{_auth}@{MYSQL_HOST}:{MYSQL_PORT}/{MYSQL_DATABASE}?charset=utf8mb4"
    )

    SECRET_KEY = os.getenv("SECRET_KEY", "change-me")
    _database_url = os.getenv("DATABASE_URL", "").strip()
    SQLALCHEMY_DATABASE_URI = _database_url or _default_db_url
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    APP_API_KEY = os.getenv("APP_API_KEY", "dev-local-key")
    MODEL_PROVIDER = os.getenv("MODEL_PROVIDER", "huggingface").lower()

    OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434")
    OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen2.5:3b")

    HUGGINGFACE_MODEL_ID = os.getenv("HUGGINGFACE_MODEL_ID", "Qwen/Qwen2.5-3B-Instruct")
    HUGGINGFACE_LOCAL_DIR = os.getenv("HUGGINGFACE_LOCAL_DIR", "").strip() or None
    HUGGINGFACE_AUTO_DOWNLOAD = os.getenv("HUGGINGFACE_AUTO_DOWNLOAD", "true").lower() in {
        "1",
        "true",
        "yes",
        "on",
    }
    HUGGINGFACE_MAX_NEW_TOKENS = int(os.getenv("HUGGINGFACE_MAX_NEW_TOKENS", "1024"))
    HUGGINGFACE_TEMPERATURE = float(os.getenv("HUGGINGFACE_TEMPERATURE", "0.7"))
    HUGGINGFACE_TOP_P = float(os.getenv("HUGGINGFACE_TOP_P", "0.9"))
    HUGGINGFACE_DO_SAMPLE = os.getenv("HUGGINGFACE_DO_SAMPLE", "true").lower() in {
        "1",
        "true",
        "yes",
        "on",
    }
    HUGGINGFACE_USE_FAST_TOKENIZER = os.getenv("HUGGINGFACE_USE_FAST_TOKENIZER", "true").lower() in {
        "1",
        "true",
        "yes",
        "on",
    }
    HUGGINGFACE_CACHE_DIR = os.getenv("HUGGINGFACE_CACHE_DIR", "").strip() or None
    HUGGINGFACE_HUB_TOKEN = os.getenv("HUGGINGFACE_HUB_TOKEN", "").strip() or None

    IMAGE_READER_MODEL = os.getenv("IMAGE_READER_MODEL", "Salesforce/blip-image-captioning-large")
    IMAGE_READER_MAX_NEW_TOKENS = int(os.getenv("IMAGE_READER_MAX_NEW_TOKENS", "512"))
    WARMUP_IMAGE_ANALYZER = os.getenv("WARMUP_IMAGE_ANALYZER", "true").lower() in {
        "1",
        "true",
        "yes",
        "on",
    }
    IMAGE_OCR_LANGUAGES = [
        x.strip() for x in os.getenv("IMAGE_OCR_LANGUAGES", "en").split(",") if x.strip()
    ]

    IMAGE_GENERATION_ENABLED = os.getenv("IMAGE_GENERATION_ENABLED", "false").lower() in {
        "1",
        "true",
        "yes",
        "on",
    }
    IMAGE_GENERATION_MODEL = os.getenv(
        "IMAGE_GENERATION_MODEL", "stabilityai/stable-diffusion-2-1"
    )
    IMAGE_GENERATION_STEPS = int(os.getenv("IMAGE_GENERATION_STEPS", "25"))
    IMAGE_GENERATION_GUIDANCE_SCALE = float(os.getenv("IMAGE_GENERATION_GUIDANCE_SCALE", "7.5"))
    IMAGE_EDIT_STRENGTH = float(os.getenv("IMAGE_EDIT_STRENGTH", "0.55"))
    SYSTEM_PROMPT = os.getenv(
        "SYSTEM_PROMPT",
        "You are a helpful local assistant. Follow local app policy and refuse harmful requests.",
    )
    MAX_HISTORY_MESSAGES = int(os.getenv("MAX_HISTORY_MESSAGES", "12"))
    RETRIEVAL_MAX_SNIPPETS = int(os.getenv("RETRIEVAL_MAX_SNIPPETS", "4"))
    REQUEST_TIMEOUT = int(os.getenv("REQUEST_TIMEOUT", "120"))
    FILE_MAX_NEW_TOKENS = int(os.getenv("FILE_MAX_NEW_TOKENS", "1200"))
    EMBEDDING_MODEL_ID = os.getenv("EMBEDDING_MODEL_ID", "sentence-transformers/all-MiniLM-L6-v2")
    EMBEDDING_MAX_CHARS = int(os.getenv("EMBEDDING_MAX_CHARS", "1200"))
    VECTOR_SEARCH_TOP_K = int(os.getenv("VECTOR_SEARCH_TOP_K", "5"))
    VISION_MODEL_ID = os.getenv("VISION_MODEL_ID", "Qwen/Qwen2-VL-2B-Instruct")
    VISION_FALLBACK_TO_OCR = os.getenv("VISION_FALLBACK_TO_OCR", "true").lower() in {
        "1",
        "true",
        "yes",
        "on",
    }
    WEB_SEARCH_ENABLED = os.getenv("WEB_SEARCH_ENABLED", "true").lower() in {
        "1",
        "true",
        "yes",
        "on",
    }
    WEB_SEARCH_TIMEOUT = int(os.getenv("WEB_SEARCH_TIMEOUT", "10"))
    WEB_SEARCH_MAX_RESULTS = int(os.getenv("WEB_SEARCH_MAX_RESULTS", "3"))
    JOB_RUNNER_MODE = os.getenv("JOB_RUNNER_MODE", "embedded").strip().lower()
    JOB_POLL_INTERVAL = float(os.getenv("JOB_POLL_INTERVAL", "1.0"))
    JOB_STALE_SECONDS = int(os.getenv("JOB_STALE_SECONDS", "900"))
    JOB_RETRY_LIMIT = int(os.getenv("JOB_RETRY_LIMIT", "2"))
    FILE_RETENTION_DAYS = int(os.getenv("FILE_RETENTION_DAYS", "14"))
    AUTO_STORAGE_CLEANUP = os.getenv("AUTO_STORAGE_CLEANUP", "true").lower() in {
        "1",
        "true",
        "yes",
        "on",
    }
    AUTO_CREATE_SCHEMA = os.getenv("AUTO_CREATE_SCHEMA", "true").lower() in {
        "1",
        "true",
        "yes",
        "on",
    }
