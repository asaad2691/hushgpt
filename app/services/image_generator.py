import base64
import re
from io import BytesIO
from pathlib import Path
from uuid import uuid4

import numpy as np
from PIL import Image


class ImageGenerationService:
    _pipeline = None
    _img2img_pipeline = None
    _default_negative_prompt = (
        "low quality, blurry, bad anatomy, bad proportions, deformed face, malformed hands, "
        "extra fingers, missing fingers, extra limbs, duplicate body, fused limbs, disfigured, "
        "mutated, poorly drawn face, poorly drawn eyes, asymmetrical eyes, distorted body, cropped, cut off"
    )
    _named_hues = {
        "red": 0,
        "orange": 25,
        "yellow": 42,
        "green": 85,
        "cyan": 127,
        "blue": 170,
        "purple": 191,
        "pink": 220,
        "magenta": 212,
        "white": 0,
        "black": 0,
        "gray": 0,
        "grey": 0,
    }

    def __init__(self, app_config, generated_dir):
        self.enabled = app_config["IMAGE_GENERATION_ENABLED"]
        self.model = app_config["IMAGE_GENERATION_MODEL"]
        self.steps = app_config["IMAGE_GENERATION_STEPS"]
        self.guidance_scale = app_config["IMAGE_GENERATION_GUIDANCE_SCALE"]
        self.cache_dir = app_config.get("HUGGINGFACE_CACHE_DIR")
        self.hub_token = app_config.get("HUGGINGFACE_HUB_TOKEN")
        self.edit_strength = float(app_config.get("IMAGE_EDIT_STRENGTH", 0.55))
        self.generated_dir = Path(generated_dir)
        self.generated_dir.mkdir(parents=True, exist_ok=True)

    def generate(self, prompt, negative_prompt=None, **kwargs):
        if not self.enabled:
            raise RuntimeError("Image generation is disabled. Set IMAGE_GENERATION_ENABLED=true.")

        pipeline = self._get_pipeline()
        enhanced_prompt = self._enhance_prompt(prompt)
        final_negative_prompt = self._merge_negative_prompt(negative_prompt, enhanced_prompt)

        steps = int(kwargs.get("num_inference_steps", self.steps))
        guidance_scale = float(kwargs.get("guidance_scale", self.guidance_scale))

        result = pipeline(
            prompt=enhanced_prompt,
            negative_prompt=final_negative_prompt,
            num_inference_steps=steps,
            guidance_scale=guidance_scale,
        )
        return self._save_image(result.images[0])

    def edit(self, image_bytes, prompt, negative_prompt=None, **kwargs):
        if not self.enabled:
            raise RuntimeError("Image generation is disabled. Set IMAGE_GENERATION_ENABLED=true.")

        input_image = Image.open(BytesIO(image_bytes)).convert("RGB")
        width = max(64, (input_image.width // 8) * 8)
        height = max(64, (input_image.height // 8) * 8)
        if width != input_image.width or height != input_image.height:
            input_image = input_image.resize((width, height))

        # Fast deterministic color-edit path for prompts like:
        # "current color is yellow, make it red"
        recolored = self._try_prompt_color_edit(input_image, prompt)
        if recolored is not None:
            return self._save_image(recolored)

        pipeline = self._get_img2img_pipeline()
        enhanced_prompt = self._enhance_prompt(prompt, for_edit=True)
        final_negative_prompt = self._merge_negative_prompt(negative_prompt, enhanced_prompt)
        steps = int(kwargs.get("num_inference_steps", self.steps))
        guidance_scale = float(kwargs.get("guidance_scale", self.guidance_scale))
        strength = float(kwargs.get("strength", self.edit_strength))

        result = pipeline(
            prompt=enhanced_prompt,
            image=input_image,
            negative_prompt=final_negative_prompt,
            strength=strength,
            num_inference_steps=steps,
            guidance_scale=guidance_scale,
        )
        return self._save_image(result.images[0])

    def _enhance_prompt(self, prompt, for_edit=False):
        raw_prompt = (prompt or "").strip()
        if not raw_prompt:
            return raw_prompt

        lowered = raw_prompt.lower()
        normalized = re.sub(r"\bfairytail\b", "fairytale", raw_prompt, flags=re.IGNORECASE)
        additions = []

        character_terms = [
            "character", "queen", "king", "knight", "princess", "prince", "warrior",
            "girl", "boy", "man", "woman", "person", "hero", "villain", "anime",
        ]
        is_character_prompt = any(term in lowered for term in character_terms)
        is_duo_prompt = any(term in lowered for term in [" and ", " couple", " duo", " two "])
        is_animated_prompt = any(term in lowered for term in ["animated", "anime", "cartoon", "illustration"])

        if is_character_prompt:
            additions.extend([
                "highly detailed face",
                "clear eyes",
                "consistent anatomy",
                "well-defined hands",
                "clean character design",
            ])

        if is_duo_prompt:
            additions.extend([
                "two distinct characters",
                "both fully visible",
                "balanced composition",
                "clear separation between characters",
            ])

        if "queen" in lowered and "knight" in lowered:
            additions.extend([
                "regal fantasy queen",
                "armored knight companion",
                "storybook fairytale scene",
            ])

        if is_animated_prompt:
            additions.extend([
                "polished animated illustration",
                "clean linework",
                "expressive faces",
            ])

        if "cyberpunk" in lowered:
            additions.extend([
                "cyberpunk neon lighting",
                "futuristic armor details",
                "vibrant sci-fi city color palette",
            ])

        if not for_edit:
            additions.extend([
                "centered composition",
                "sharp focus",
                "high detail",
            ])

        unique_additions = []
        seen = set()
        for item in additions:
            key = item.lower()
            if key not in seen:
                seen.add(key)
                unique_additions.append(item)

        if not unique_additions:
            return normalized

        return f"{normalized}, " + ", ".join(unique_additions)

    def _merge_negative_prompt(self, negative_prompt, prompt):
        parts = [self._default_negative_prompt]
        cleaned_negative = (negative_prompt or "").strip()
        if cleaned_negative:
            parts.append(cleaned_negative)

        prompt_text = (prompt or "").lower()
        if any(term in prompt_text for term in ["animated", "anime", "cartoon", "illustration"]):
            parts.append("photorealistic, realistic skin, live action")

        return ", ".join(part for part in parts if part).strip(", ")

    def _try_prompt_color_edit(self, image, prompt):
        if not prompt:
            return None

        from_color, to_color = self._extract_color_request(prompt.lower())
        if not to_color:
            return None

        target_hue = self._named_hues.get(to_color)
        source_hue = self._named_hues.get(from_color) if from_color else None
        if target_hue is None:
            return None

        hsv = np.array(image.convert("HSV"), dtype=np.uint8)
        h = hsv[:, :, 0].astype(np.int16)
        s = hsv[:, :, 1].astype(np.int16)
        v = hsv[:, :, 2].astype(np.int16)

        vivid_mask = (s > 45) & (v > 45)
        if source_hue is not None:
            # circular hue distance on 0..255
            d = np.abs(h - source_hue)
            hue_distance = np.minimum(d, 256 - d)
            source_mask = hue_distance <= 30
            mask = vivid_mask & source_mask
        else:
            mask = vivid_mask

        # avoid recoloring near-black regions (windows/background)
        mask &= v > 55

        if not np.any(mask):
            return None

        h[mask] = int(target_hue)
        s[mask] = np.clip(np.maximum(s[mask], 110), 0, 255)

        out = np.stack([h.astype(np.uint8), s.astype(np.uint8), v.astype(np.uint8)], axis=2)
        return Image.fromarray(out, mode="HSV").convert("RGB")

    def _extract_color_request(self, text):
        known_colors = "|".join(sorted(self._named_hues.keys(), key=len, reverse=True))
        patterns = [
            rf"(?:color|colour)\s+is\s+({known_colors}).*?\b(?:to|in)\s+({known_colors})",
            rf"(?:change|convert|turn)\s+(?:the\s+)?(?:color|colour)?.*?\bfrom\s+({known_colors})\s+to\s+({known_colors})",
            rf"(?:make|turn)\s+(?:it|this|car|object)?\s*({known_colors})",
        ]

        for idx, pat in enumerate(patterns):
            m = re.search(pat, text)
            if not m:
                continue
            if idx == 2:
                return None, m.group(1)
            return m.group(1), m.group(2)

        return None, None

    def _get_pipeline(self):
        if ImageGenerationService._pipeline is not None:
            return ImageGenerationService._pipeline

        try:
            from diffusers import StableDiffusionPipeline
        except ImportError as exc:
            raise RuntimeError(
                "diffusers is required for image generation. Install with: pip install diffusers"
            ) from exc

        try:
            import torch
        except ImportError as exc:
            raise RuntimeError("torch is required for image generation.") from exc

        ImageGenerationService._pipeline = StableDiffusionPipeline.from_pretrained(
            self.model,
            torch_dtype=torch.float32,
            token=self.hub_token,
            cache_dir=self.cache_dir,
        )
        return ImageGenerationService._pipeline

    def _get_img2img_pipeline(self):
        if ImageGenerationService._img2img_pipeline is not None:
            return ImageGenerationService._img2img_pipeline

        try:
            from diffusers import StableDiffusionImg2ImgPipeline
        except ImportError as exc:
            raise RuntimeError(
                "diffusers img2img pipeline is required. Install with: pip install diffusers"
            ) from exc

        try:
            import torch
        except ImportError as exc:
            raise RuntimeError("torch is required for image editing.") from exc

        ImageGenerationService._img2img_pipeline = StableDiffusionImg2ImgPipeline.from_pretrained(
            self.model,
            torch_dtype=torch.float32,
            token=self.hub_token,
            cache_dir=self.cache_dir,
        )
        return ImageGenerationService._img2img_pipeline

    def _save_image(self, image):
        filename = f"{uuid4().hex}.png"
        full_path = self.generated_dir / filename
        image.save(full_path, format="PNG")

        with open(full_path, "rb") as f:
            b64 = base64.b64encode(f.read()).decode("utf-8")

        return {"filename": filename, "base64": b64}
