from __future__ import annotations

import json
from dataclasses import asdict
from datetime import datetime, timezone
from typing import Any
from urllib import error, parse, request

from app.models import StoredMeasurement


class SupabaseSyncError(Exception):
    """Raised when Supabase synchronization fails."""


class SupabaseClient:
    """Minimal Supabase REST client for measurement upserts."""

    def __init__(
        self,
        *,
        base_url: str,
        api_key: str,
        table: str,
        timeout_seconds: float = 10.0,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.table = table
        self.timeout_seconds = timeout_seconds

    def upsert_measurement(self, measurement: StoredMeasurement) -> None:
        query = parse.urlencode({"on_conflict": "id"})
        endpoint = f"{self.base_url}/rest/v1/{self.table}?{query}"
        payload = json.dumps([self._serialize_measurement(measurement)]).encode("utf-8")
        req = request.Request(
            endpoint,
            data=payload,
            method="POST",
            headers={
                "apikey": self.api_key,
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
                "Prefer": "resolution=merge-duplicates,return=minimal",
            },
        )

        try:
            with request.urlopen(req, timeout=self.timeout_seconds):
                return
        except error.HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace").strip()
            message = f"Supabase upsert failed with HTTP {exc.code}"
            if body:
                message = f"{message}: {body}"
            raise SupabaseSyncError(message) from exc
        except error.URLError as exc:
            raise SupabaseSyncError(f"Supabase request failed: {exc.reason}") from exc

    @staticmethod
    def _serialize_measurement(measurement: StoredMeasurement) -> dict[str, Any]:
        payload = asdict(measurement)
        return {
            "id": payload["id"],
            "measured_at": payload["measured_at"],
            "temperature_c": payload["temperature_c"],
            "pressure_hpa": payload["pressure_hpa"],
            "humidity_percent": payload["humidity_percent"],
            "status": payload["status"],
            "raw_text": payload["raw_text"],
            "created_at": payload["created_at"],
        }


def utc_now_isoformat() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")
