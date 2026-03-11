from io import BytesIO

from PIL import Image

from app.services.llm_provider import get_client


class ImageReaderService:
    _captioner = None
    _ocr_reader = None
    _vision_pipeline = None

    def __init__(self, app_config):
        self.model = app_config["IMAGE_READER_MODEL"]
        self.vision_model = app_config.get("VISION_MODEL_ID")
        self.max_new_tokens = app_config["IMAGE_READER_MAX_NEW_TOKENS"]
        self.cache_dir = app_config.get("HUGGINGFACE_CACHE_DIR")
        self.hub_token = app_config.get("HUGGINGFACE_HUB_TOKEN")
        self.ocr_languages = app_config.get("IMAGE_OCR_LANGUAGES", ["en"])
        self.allow_fallback = app_config.get("VISION_FALLBACK_TO_OCR", True)

    def analyze(self, image_bytes, user_prompt):
        multimodal = self._analyze_with_multimodal(image_bytes, user_prompt)
        if multimodal:
            return {
                "caption": multimodal.get("caption", "Multimodal analysis"),
                "ocr_text": multimodal.get("ocr_text", ""),
                "analysis": multimodal.get("analysis", ""),
                "model": multimodal.get("model", self.vision_model),
            }

        caption = self._caption(image_bytes)
        ocr_text = self._extract_text(image_bytes)
        request_text = (user_prompt or "").strip()
        wants_text_first = self._wants_text_first(request_text)

        if wants_text_first and ocr_text:
            source_context = (
                f"Primary extracted text from image:\n{ocr_text}\n\n"
                f"Supporting visual caption:\n{caption}"
            )
        elif ocr_text:
            source_context = (
                f"Extracted text from image:\n{ocr_text}\n\n"
                f"Visual caption:\n{caption}"
            )
        else:
            source_context = f"Visual caption:\n{caption}\nNo OCR text found."

        llm_prompt = (
            "You are analyzing an uploaded image.\n"
            f"{source_context}\n"
            f"User request: {request_text or 'Describe this image in detail.'}\n"
            "If extracted text exists, prioritize it strongly for the answer. "
            "If the user asks what is written, quote or summarize the visible text instead of describing unrelated imagery. "
            "Return a practical direct answer based on the image and the request."
        )
        result = get_client().chat_once(
            messages=[{"role": "user", "content": llm_prompt}],
            options={"max_new_tokens": self.max_new_tokens, "temperature": 0.2, "do_sample": False},
        )
        return {
            "caption": caption,
            "ocr_text": ocr_text,
            "analysis": result.get("message", {}).get("content", ""),
            "model": self.model,
        }

    def _analyze_with_multimodal(self, image_bytes, user_prompt):
        try:
            pipeline = self._get_vision_pipeline()
            if pipeline is None:
                return None
            image = Image.open(BytesIO(image_bytes)).convert("RGB")
            prompt = (user_prompt or "Describe this image in detail.").strip()
            generated = pipeline(image, prompt=prompt, max_new_tokens=self.max_new_tokens)
            if not generated:
                return None
            content = (generated[0].get("generated_text") or "").strip()
            if not content:
                return None
            return {
                "caption": "Vision-language analysis",
                "ocr_text": "",
                "analysis": content,
                "model": self.vision_model,
            }
        except Exception:
            if self.allow_fallback:
                return None
            raise

    @staticmethod
    def _wants_text_first(prompt):
        text = (prompt or "").lower()
        cues = [
            "what is written",
            "read the text",
            "extract the text",
            "what does it say",
            "ocr",
            "transcribe",
            "explain what's written",
        ]
        return any(cue in text for cue in cues)

    def _caption(self, image_bytes):
        pipeline = self._get_captioner()
        image = Image.open(BytesIO(image_bytes)).convert("RGB")
        result = pipeline(image)
        if not result:
            return "No description generated."
        return (result[0].get("generated_text") or "").strip() or "No description generated."

    def _get_captioner(self):
        if ImageReaderService._captioner is not None:
            return ImageReaderService._captioner

        try:
            from transformers import pipeline
        except ImportError as exc:
            raise RuntimeError(
                "transformers is required for image analysis. Install with: pip install transformers"
            ) from exc

        # Some transformers versions don't accept token/cache args at pipeline level
        # for image-to-text and will fail during call-time parameter sanitization.
        ImageReaderService._captioner = pipeline("image-to-text", model=self.model)
        return ImageReaderService._captioner

    def _extract_text(self, image_bytes):
        try:
            import numpy as np
        except ImportError as exc:
            raise RuntimeError("numpy is required for OCR. Install with: pip install numpy") from exc

        reader = self._get_ocr_reader()
        image = Image.open(BytesIO(image_bytes)).convert("RGB")
        image_array = np.array(image)
        lines = reader.readtext(image_array, detail=0, paragraph=True)
        cleaned = [line.strip() for line in lines if line and line.strip()]
        return "\n".join(cleaned)

    def _get_ocr_reader(self):
        if ImageReaderService._ocr_reader is not None:
            return ImageReaderService._ocr_reader

        try:
            import easyocr
        except ImportError as exc:
            raise RuntimeError(
                "easyocr is required for text extraction. Install with: pip install easyocr"
            ) from exc

        ImageReaderService._ocr_reader = easyocr.Reader(
            self.ocr_languages,
            gpu=False,
            download_enabled=True,
            verbose=False,
        )
        return ImageReaderService._ocr_reader

    def _get_vision_pipeline(self):
        if not self.vision_model:
            return None
        if ImageReaderService._vision_pipeline is not None:
            return ImageReaderService._vision_pipeline

        try:
            from transformers import pipeline
        except ImportError as exc:
            raise RuntimeError("transformers is required for multimodal vision. Install with: pip install transformers") from exc

        ImageReaderService._vision_pipeline = pipeline("image-text-to-text", model=self.vision_model)
        return ImageReaderService._vision_pipeline
