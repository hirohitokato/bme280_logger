from __future__ import annotations

import sqlite3
from pathlib import Path

from app.models import MeasurementResult, StoredMeasurement


class MeasurementRepository:
    """SQLite repository for measurement results."""

    def __init__(self, db_path: Path) -> None:
        self.db_path = db_path

    def initialize(self) -> None:
        """Create DB, table, and indexes. Safe to call repeatedly."""

        self.db_path.parent.mkdir(parents=True, exist_ok=True)

        with sqlite3.connect(self.db_path) as conn:
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute("PRAGMA foreign_keys=ON")
            self._ensure_schema(conn)
            conn.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_measurements_measured_at
                ON measurements(measured_at)
                """
            )

    def _ensure_schema(self, conn: sqlite3.Connection) -> None:
        columns = self._get_table_columns(conn, "measurements")
        expected = {
            "id",
            "measured_at",
            "temperature_c",
            "pressure_hpa",
            "humidity_percent",
            "status",
            "raw_text",
            "created_at",
            "supabase_synced_at",
            "supabase_sync_error",
            "supabase_retry_count",
        }

        legacy_columns = {
            "id",
            "measured_at",
            "temperature_c",
            "pressure_hpa",
            "humidity_percent",
            "status",
            "raw_text",
            "created_at",
        }

        if columns and not (expected.issuperset(columns) and legacy_columns.issubset(columns)):
            conn.execute("ALTER TABLE measurements RENAME TO measurements_legacy")
            columns = set()

        if not columns:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS measurements (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    measured_at TEXT NOT NULL,
                    temperature_c REAL NOT NULL,
                    pressure_hpa REAL NOT NULL,
                    humidity_percent REAL NOT NULL,
                    status TEXT NOT NULL,
                    raw_text TEXT,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    supabase_synced_at TEXT,
                    supabase_sync_error TEXT,
                    supabase_retry_count INTEGER NOT NULL DEFAULT 0
                )
                """
            )
            columns = self._get_table_columns(conn, "measurements")

        if "supabase_synced_at" not in columns:
            conn.execute("ALTER TABLE measurements ADD COLUMN supabase_synced_at TEXT")
        if "supabase_sync_error" not in columns:
            conn.execute("ALTER TABLE measurements ADD COLUMN supabase_sync_error TEXT")
        if "supabase_retry_count" not in columns:
            conn.execute(
                "ALTER TABLE measurements ADD COLUMN supabase_retry_count INTEGER NOT NULL DEFAULT 0"
            )

    @staticmethod
    def _get_table_columns(conn: sqlite3.Connection, table_name: str) -> set[str]:
        rows = conn.execute(f"PRAGMA table_info({table_name})").fetchall()
        return {str(row[1]) for row in rows}

    def save(self, result: MeasurementResult) -> int:
        """Insert one result and return the created row id."""

        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.execute(
                """
                INSERT INTO measurements (
                    measured_at,
                    temperature_c,
                    pressure_hpa,
                    humidity_percent,
                    status,
                    raw_text
                )
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    result.measured_at.isoformat(timespec="seconds"),
                    result.temperature_c,
                    result.pressure_hpa,
                    result.humidity_percent,
                    result.status,
                    result.raw_text,
                ),
            )
            return int(cursor.lastrowid)

    def list_unsynced(self, limit: int = 100) -> list[StoredMeasurement]:
        with sqlite3.connect(self.db_path) as conn:
            rows = conn.execute(
                """
                SELECT
                    id,
                    measured_at,
                    temperature_c,
                    pressure_hpa,
                    humidity_percent,
                    status,
                    raw_text,
                    created_at,
                    supabase_synced_at,
                    supabase_sync_error,
                    supabase_retry_count
                FROM measurements
                WHERE supabase_synced_at IS NULL
                ORDER BY id ASC
                LIMIT ?
                """,
                (limit,),
            ).fetchall()
        return [StoredMeasurement(*row) for row in rows]

    def mark_synced(self, measurement_id: int, synced_at: str) -> None:
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                """
                UPDATE measurements
                SET
                    supabase_synced_at = ?,
                    supabase_sync_error = NULL
                WHERE id = ?
                """,
                (synced_at, measurement_id),
            )

    def mark_sync_failed(self, measurement_id: int, error_message: str) -> None:
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                """
                UPDATE measurements
                SET
                    supabase_sync_error = ?,
                    supabase_retry_count = supabase_retry_count + 1
                WHERE id = ?
                """,
                (error_message[:1000], measurement_id),
            )
