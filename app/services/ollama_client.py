import json
import requests
from flask import current_app


class OllamaClient:
    def __init__(self, model=None, base_url=None):
        self.base_url = current_app.config["OLLAMA_BASE_URL"].rstrip("/")
        self.model = model or current_app.config["OLLAMA_MODEL"]
        if base_url:
            self.base_url = base_url.rstrip("/")
        self.timeout = current_app.config["REQUEST_TIMEOUT"]

    def tags(self):
        response = requests.get(f"{self.base_url}/api/tags", timeout=self.timeout)
        response.raise_for_status()
        return response.json()

    def chat_once(self, messages, options=None):
        payload = {
            "model": self.model,
            "messages": messages,
            "stream": False,
        }
        if options:
            payload["options"] = options

        response = requests.post(
            f"{self.base_url}/api/chat",
            json=payload,
            timeout=self.timeout,
        )
        response.raise_for_status()
        return response.json()

    def chat_stream(self, messages, options=None):
        payload = {
            "model": self.model,
            "messages": messages,
            "stream": True,
        }
        if options:
            payload["options"] = options

        response = requests.post(
            f"{self.base_url}/api/chat",
            json=payload,
            stream=True,
            timeout=self.timeout,
        )
        response.raise_for_status()

        for line in response.iter_lines(decode_unicode=True):
            if not line:
                continue
            try:
                yield json.loads(line)
            except json.JSONDecodeError:
                continue
