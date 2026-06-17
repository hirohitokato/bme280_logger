from __future__ import annotations

import sqlite3
from pathlib import Path

from app.models import MeasurementResult


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
        }

        if columns and not expected.issubset(columns):
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
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """
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
