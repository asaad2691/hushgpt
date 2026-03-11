from __future__ import annotations

from threading import Thread
from pathlib import Path


class HuggingFaceClient:
    _pipelines = {}
    _resolved_model_refs = {}
    _models = {}
    _tokenizers = {}

    def __init__(self, app_config, model_id=None):
        self.model_id = model_id or app_config["HUGGINGFACE_MODEL_ID"]
        self.local_dir = app_config.get("HUGGINGFACE_LOCAL_DIR")
        self.auto_download = app_config.get("HUGGINGFACE_AUTO_DOWNLOAD", True)
        self.max_new_tokens = app_config["HUGGINGFACE_MAX_NEW_TOKENS"]
        self.temperature = app_config["HUGGINGFACE_TEMPERATURE"]
        self.top_p = app_config["HUGGINGFACE_TOP_P"]
        self.do_sample = app_config["HUGGINGFACE_DO_SAMPLE"]
        self.use_fast_tokenizer = app_config["HUGGINGFACE_USE_FAST_TOKENIZER"]
        self.cache_dir = app_config.get("HUGGINGFACE_CACHE_DIR")
        self.hub_token = app_config.get("HUGGINGFACE_HUB_TOKEN")

    def tags(self):
        loaded_from = self.local_dir or self.model_id
        return {
            "provider": "huggingface",
            "models": [
                {
                    "name": self.model_id,
                    "loaded_from": loaded_from,
                }
            ],
        }

    def chat_once(self, messages, options=None):
        options = options or {}
        prompt = self._build_prompt(messages)
        generator = self._get_pipeline()

        generated = generator(
            prompt,
            max_new_tokens=int(options.get("max_new_tokens", self.max_new_tokens)),
            temperature=float(options.get("temperature", self.temperature)),
            top_p=float(options.get("top_p", self.top_p)),
            do_sample=bool(options.get("do_sample", self.do_sample)),
            return_full_text=False,
        )

        if not generated:
            content = ""
        else:
            content = (generated[0].get("generated_text") or "").strip()

        return {
            "provider": "huggingface",
            "model": self.model_id,
            "message": {"role": "assistant", "content": content},
        }

    def chat_stream(self, messages, options=None):
        options = options or {}
        prompt = self._build_prompt(messages)
        model, tokenizer = self._get_model_and_tokenizer()

        try:
            from transformers import TextIteratorStreamer
        except ImportError:
            result = self.chat_once(messages=messages, options=options)
            yield {"message": {"content": result.get("message", {}).get("content", "")}, "done": False}
            yield {"done": True}
            return

        encoded = tokenizer(prompt, return_tensors="pt")
        streamer = TextIteratorStreamer(tokenizer, skip_prompt=True, skip_special_tokens=True)
        generation_kwargs = {
            **encoded,
            "streamer": streamer,
            "max_new_tokens": int(options.get("max_new_tokens", self.max_new_tokens)),
            "temperature": float(options.get("temperature", self.temperature)),
            "top_p": float(options.get("top_p", self.top_p)),
            "do_sample": bool(options.get("do_sample", self.do_sample)),
        }

        worker = Thread(target=model.generate, kwargs=generation_kwargs, daemon=True)
        worker.start()

        emitted = False
        for chunk in streamer:
            if not chunk:
                continue
            emitted = True
            yield {"message": {"content": chunk}, "done": False}

        if not emitted:
            yield {"message": {"content": ""}, "done": True}
            return

        yield {"done": True}

    def _resolve_model_reference(self):
        if self.model_id in HuggingFaceClient._resolved_model_refs:
            return HuggingFaceClient._resolved_model_refs[self.model_id]

        if self.local_dir:
            path = Path(self.local_dir)
            if not path.exists():
                raise RuntimeError(
                    f"HUGGINGFACE_LOCAL_DIR does not exist: {self.local_dir}"
                )
            HuggingFaceClient._resolved_model_refs[self.model_id] = str(path)
            return HuggingFaceClient._resolved_model_refs[self.model_id]

        if self.auto_download:
            try:
                from huggingface_hub import snapshot_download
            except ImportError as exc:
                raise RuntimeError(
                    "huggingface_hub is required. Install with: pip install huggingface_hub"
                ) from exc

            downloaded_path = snapshot_download(
                repo_id=self.model_id,
                cache_dir=self.cache_dir,
                token=self.hub_token,
                local_dir_use_symlinks=False,
            )
            HuggingFaceClient._resolved_model_refs[self.model_id] = downloaded_path
            return HuggingFaceClient._resolved_model_refs[self.model_id]

        HuggingFaceClient._resolved_model_refs[self.model_id] = self.model_id
        return HuggingFaceClient._resolved_model_refs[self.model_id]

    def _get_pipeline(self):
        if self.model_id in HuggingFaceClient._pipelines:
            return HuggingFaceClient._pipelines[self.model_id]

        try:
            from transformers import pipeline
        except ImportError as exc:
            raise RuntimeError(
                "transformers is required. Install with: pip install transformers"
            ) from exc

        model, tokenizer = self._get_model_and_tokenizer()

        HuggingFaceClient._pipelines[self.model_id] = pipeline(
            "text-generation",
            model=model,
            tokenizer=tokenizer,
        )
        return HuggingFaceClient._pipelines[self.model_id]

    def _get_model_and_tokenizer(self):
        if self.model_id in HuggingFaceClient._models and self.model_id in HuggingFaceClient._tokenizers:
            return HuggingFaceClient._models[self.model_id], HuggingFaceClient._tokenizers[self.model_id]

        model_ref = self._resolve_model_reference()

        try:
            from transformers import AutoModelForCausalLM, AutoTokenizer
        except ImportError as exc:
            raise RuntimeError(
                "transformers is required. Install with: pip install transformers"
            ) from exc

        try:
            tokenizer = AutoTokenizer.from_pretrained(
                model_ref,
                use_fast=self.use_fast_tokenizer,
                token=self.hub_token,
                cache_dir=self.cache_dir,
            )
            model = AutoModelForCausalLM.from_pretrained(
                model_ref,
                token=self.hub_token,
                cache_dir=self.cache_dir,
            )
        except Exception as exc:
            raise RuntimeError(
                "Failed to load Hugging Face model. "
                "Ensure dependencies are installed and the model is accessible. "
                f"Underlying error: {exc}"
            ) from exc

        HuggingFaceClient._models[self.model_id] = model
        HuggingFaceClient._tokenizers[self.model_id] = tokenizer
        return model, tokenizer

    def _build_prompt(self, messages):
        tokenizer = self._get_model_and_tokenizer()[1]
        cleaned_messages = []
        for msg in messages:
            role = (msg.get("role") or "user").strip().lower()
            content = (msg.get("content") or "").strip()
            if not content:
                continue
            if role not in {"system", "user", "assistant"}:
                role = "user"
            cleaned_messages.append({"role": role, "content": content})

        if hasattr(tokenizer, "apply_chat_template"):
            return tokenizer.apply_chat_template(
                cleaned_messages,
                tokenize=False,
                add_generation_prompt=True,
            )

        lines = []
        for msg in cleaned_messages:
            lines.append(f"{msg['role'].title()}: {msg['content']}")
        lines.append("Assistant:")
        return "\n".join(lines)
