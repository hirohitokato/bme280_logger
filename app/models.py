from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime


@dataclass(frozen=True)
class MeasurementResult:
    """One BME280 measurement result returned by the measurement module."""

    measured_at: datetime
    temperature_c: float
    pressure_hpa: float
    humidity_percent: float
    status: str
    raw_text: str | None = None


@dataclass(frozen=True)
class StoredMeasurement:
    """One measurement row persisted locally and eligible for sync."""

    id: int
    measured_at: str
    temperature_c: float
    pressure_hpa: float
    humidity_percent: float
    status: str
    raw_text: str | None
    created_at: str
    supabase_synced_at: str | None
    supabase_sync_error: str | None
    supabase_retry_count: int
