from urllib.parse import quote_plus
import xml.etree.ElementTree as ET

import requests


class WebSearchService:
    def __init__(self, app_config):
        self.enabled = app_config["WEB_SEARCH_ENABLED"]
        self.timeout = app_config["WEB_SEARCH_TIMEOUT"]
        self.max_results = app_config["WEB_SEARCH_MAX_RESULTS"]

    @staticmethod
    def should_search(prompt, force_web=False):
        if force_web:
            return True

        text = (prompt or "").lower()
        cues = [
            "latest",
            "current",
            "today",
            "news",
            "headlines",
            "recent",
            "right now",
            "price",
            "weather",
            "forecast",
            "temperature",
            "time",
            "date",
            "update",
            "global",
            "world",
            "market",
            "stock",
            "crypto",
            "who is",
            "what is happening",
            "what's happening",
            "whats happening",
            "around the world",
            "happening around the world",
            "look up",
            "search",
            "find online",
            "internet",
        ]
        return any(cue in text for cue in cues)

    @staticmethod
    def classify_query(prompt):
        text = (prompt or "").lower()
        if any(x in text for x in ["weather", "forecast", "temperature", "rain", "humidity"]):
            return "weather"
        if any(x in text for x in ["time", "date", "timezone", "what time"]):
            return "time"
        if any(x in text for x in ["news", "headline", "headlines", "breaking", "update", "world news", "global", "around the world", "what's happening"]):
            return "news"
        return "search"

    def check_connectivity(self):
        if not self.enabled:
            return {"enabled": False, "connected": False, "ready": False}

        probes = [
            ("https://api.duckduckgo.com/", {"q": "ping", "format": "json", "no_html": "1"}),
            ("https://en.wikipedia.org/w/rest.php/v1/search/title", {"q": "world", "limit": 1}),
        ]

        for url, params in probes:
            try:
                response = requests.get(
                    url,
                    params=params,
                    timeout=min(self.timeout, 5),
                    headers={"User-Agent": "local-flask-llm/1.0"},
                )
                response.raise_for_status()
                return {"enabled": True, "connected": True, "ready": True}
            except Exception:
                continue

        return {"enabled": True, "connected": False, "ready": False}

    def get_context(self, prompt, deep=False):
        if not self.enabled:
            return None

        limit = self.max_results * (2 if deep else 1)
        query_type = self.classify_query(prompt)
        if query_type == "weather":
            context = self._weather_context(prompt)
            if context:
                return context
        elif query_type == "time":
            context = self._time_context(prompt)
            if context:
                return context
        elif query_type == "news":
            context = self._news_context(prompt, limit=limit)
            if context:
                return context

        return self._search_context(prompt, limit=limit)

    @staticmethod
    def format_direct_answer(prompt, context, detailed=False):
        if not context:
            return None

        kind = context.get("kind")
        sources = context.get("sources") or []
        if not sources:
            return None

        item = sources[0]
        snippet = item.get("snippet", "")

        if kind == "weather":
            if detailed:
                return f"{snippet} Source: {item.get('url', '')}"
            sentence = snippet.split("Weather code:")[0].strip()
            return sentence

        if kind == "time":
            if detailed:
                return f"{snippet} Source: {item.get('url', '')}"
            return snippet

        if kind == "news":
            if detailed:
                lines = []
                for idx, src in enumerate(sources, start=1):
                    lines.append(f"{idx}. {src.get('title', '')}")
                    lines.append(f"Source: {src.get('url', '')}")
                    lines.append(f"{src.get('snippet', '')}")
                return "\n".join(lines)
            return " | ".join(src.get("title", "") for src in sources if src.get("title"))

        return None

    def _search_context(self, prompt, limit=None):
        limit = limit or self.max_results
        results = []
        wiki_items = self._wikipedia_results(prompt)
        for item in wiki_items:
            if len(results) >= limit:
                break
            results.append(item)

        ddg_item = self._duckduckgo_result(prompt)
        if ddg_item and len(results) < limit:
            if not any(x["url"] == ddg_item["url"] for x in results):
                results.append(ddg_item)

        if not results:
            return None

        lines = ["Use the following web context only if it is relevant and useful:"]
        for idx, item in enumerate(results[:limit], start=1):
            lines.append(f"{idx}. {item['title']}")
            lines.append(f"Source: {item['url']}")
            lines.append(f"Snippet: {item['snippet']}")

        return {"kind": "search", "text": "\n".join(lines), "sources": results[:limit]}

    def _news_context(self, prompt, limit=None):
        limit = limit or self.max_results
        try:
            response = requests.get(
                f"https://news.google.com/rss/search?q={quote_plus(prompt)}",
                timeout=self.timeout,
                headers={"User-Agent": "local-flask-llm/1.0"},
            )
            response.raise_for_status()
            root = ET.fromstring(response.text)
        except Exception:
            return None

        items = []
        for item in root.findall(".//item")[:limit]:
            title = (item.findtext("title") or "").strip()
            link = (item.findtext("link") or "").strip()
            pub_date = (item.findtext("pubDate") or "").strip()
            if not title or not link:
                continue
            items.append(
                {
                    "title": title,
                    "url": link,
                    "snippet": f"Published: {pub_date}" if pub_date else "Recent news result",
                }
            )

        if not items:
            return None

        lines = ["Fresh news results:"]
        for idx, item in enumerate(items, start=1):
            lines.append(f"{idx}. {item['title']}")
            lines.append(f"Source: {item['url']}")
            lines.append(f"Snippet: {item['snippet']}")

        return {"kind": "news", "text": "\n".join(lines), "sources": items}

    def _weather_context(self, prompt):
        location = self._extract_location(prompt)
        if not location:
            return None

        geo = self._geocode(location)
        if not geo:
            return None

        try:
            response = requests.get(
                "https://api.open-meteo.com/v1/forecast",
                params={
                    "latitude": geo["lat"],
                    "longitude": geo["lon"],
                    "current": "temperature_2m,relative_humidity_2m,apparent_temperature,wind_speed_10m,weather_code",
                    "timezone": "auto",
                },
                timeout=self.timeout,
            )
            response.raise_for_status()
            data = response.json()
        except Exception:
            return None

        current = data.get("current") or {}
        timezone = data.get("timezone") or "local time"
        snippet = (
            f"Location: {geo['name']}. Timezone: {timezone}. "
            f"Temperature: {current.get('temperature_2m', 'n/a')} C. "
            f"Feels like: {current.get('apparent_temperature', 'n/a')} C. "
            f"Humidity: {current.get('relative_humidity_2m', 'n/a')}%. "
            f"Wind: {current.get('wind_speed_10m', 'n/a')} km/h. "
            f"Weather code: {current.get('weather_code', 'n/a')}."
        )
        item = {
            "title": f"Current weather for {geo['name']}",
            "url": f"https://open-meteo.com/en/docs?latitude={geo['lat']}&longitude={geo['lon']}",
            "snippet": snippet,
        }
        return {"kind": "weather", "text": f"Fresh weather data:\n1. {item['title']}\nSource: {item['url']}\nSnippet: {item['snippet']}", "sources": [item]}

    def _time_context(self, prompt):
        location = self._extract_location(prompt)
        if not location:
            return None

        geo = self._geocode(location)
        if not geo:
            return None

        try:
            response = requests.get(
                "https://api.open-meteo.com/v1/forecast",
                params={
                    "latitude": geo["lat"],
                    "longitude": geo["lon"],
                    "current": "temperature_2m",
                    "timezone": "auto",
                },
                timeout=self.timeout,
            )
            response.raise_for_status()
            data = response.json()
        except Exception:
            return None

        current = data.get("current") or {}
        timezone = data.get("timezone") or "local time"
        current_time = current.get("time") or "unknown"
        item = {
            "title": f"Current time for {geo['name']}",
            "url": f"https://open-meteo.com/en/docs?latitude={geo['lat']}&longitude={geo['lon']}",
            "snippet": f"Current local time: {current_time}. Timezone: {timezone}.",
        }
        return {"kind": "time", "text": f"Fresh time data:\n1. {item['title']}\nSource: {item['url']}\nSnippet: {item['snippet']}", "sources": [item]}

    def _extract_location(self, prompt):
        text = (prompt or "").strip()
        lower = text.lower()
        for marker in [" in ", " for ", " at "]:
            idx = lower.rfind(marker)
            if idx != -1:
                candidate = text[idx + len(marker):].strip(" ?.,!")
                if candidate:
                    return candidate
        return None

    def _geocode(self, location):
        try:
            response = requests.get(
                "https://nominatim.openstreetmap.org/search",
                params={"q": location, "format": "jsonv2", "limit": 1},
                timeout=self.timeout,
                headers={"User-Agent": "local-flask-llm/1.0"},
            )
            response.raise_for_status()
            rows = response.json()
        except Exception:
            return None

        if not rows:
            return None
        row = rows[0]
        return {
            "name": row.get("display_name", location),
            "lat": row.get("lat"),
            "lon": row.get("lon"),
        }

    def _duckduckgo_result(self, prompt):
        try:
            response = requests.get(
                "https://api.duckduckgo.com/",
                params={
                    "q": prompt,
                    "format": "json",
                    "no_html": "1",
                    "no_redirect": "1",
                },
                timeout=self.timeout,
            )
            response.raise_for_status()
            data = response.json()
        except Exception:
            return None

        abstract = (data.get("AbstractText") or "").strip()
        abstract_url = (data.get("AbstractURL") or "").strip()
        heading = (data.get("Heading") or "").strip() or prompt
        if abstract and abstract_url:
            return {"title": heading, "url": abstract_url, "snippet": abstract}
        return None

    def _wikipedia_results(self, prompt):
        try:
            response = requests.get(
                "https://en.wikipedia.org/w/rest.php/v1/search/title",
                params={"q": prompt, "limit": self.max_results},
                timeout=self.timeout,
                headers={"User-Agent": "local-flask-llm/1.0"},
            )
            response.raise_for_status()
            pages = response.json().get("pages", [])
        except Exception:
            return []

        results = []
        for page in pages[: self.max_results]:
            title = (page.get("title") or "").strip()
            if not title:
                continue
            summary = self._wikipedia_summary(title)
            if summary:
                results.append(summary)
        return results

    def _wikipedia_summary(self, title):
        try:
            response = requests.get(
                f"https://en.wikipedia.org/api/rest_v1/page/summary/{quote_plus(title.replace(' ', '_'))}",
                timeout=self.timeout,
                headers={"User-Agent": "local-flask-llm/1.0"},
            )
            response.raise_for_status()
            data = response.json()
        except Exception:
            return None

        extract = (data.get("extract") or "").strip()
        content_urls = data.get("content_urls") or {}
        desktop = content_urls.get("desktop") or {}
        page_url = (desktop.get("page") or "").strip()
        summary_title = (data.get("title") or title).strip()
        if not extract or not page_url:
            page_url = f"https://en.wikipedia.org/wiki/{quote_plus(title.replace(' ', '_'))}"
        if not extract:
            return None
        return {"title": summary_title, "url": page_url, "snippet": extract}
