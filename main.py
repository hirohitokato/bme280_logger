#!/usr/bin/env python3
from __future__ import annotations

import argparse
import logging
import sqlite3
import sys
from logging.handlers import RotatingFileHandler
from pathlib import Path

from app.config import (
    DB_PATH,
    LOG_PATH,
    SUPABASE_KEY,
    SUPABASE_SYNC_ENABLED,
    SUPABASE_TABLE,
    SUPABASE_URL,
)
from app.measurement import measure
from app.repository import MeasurementRepository
from app.supabase import SupabaseClient, SupabaseSyncError, utc_now_isoformat


def setup_logging() -> None:
    LOG_PATH.parent.mkdir(parents=True, exist_ok=True)

    file_handler = RotatingFileHandler(
        LOG_PATH,
        maxBytes=1_000_000,
        backupCount=5,
        encoding="utf-8",
    )
    file_handler.setFormatter(
        logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s")
    )

    console_handler = logging.StreamHandler()
    console_handler.setFormatter(logging.Formatter("%(levelname)s: %(message)s"))

    logging.basicConfig(
        level=logging.INFO,
        handlers=[file_handler, console_handler],
    )


def run_once() -> int:
    logger = logging.getLogger(__name__)
    repository = MeasurementRepository(Path(DB_PATH))
    repository.initialize()

    result = measure()
    row_id = repository.save(result)
    sync_summary = sync_pending_measurements(repository, logger)

    logger.info(
        "measurement saved: id=%s measured_at=%s temperature_c=%s pressure_hpa=%s humidity_percent=%s status=%s db=%s sync=%s",
        row_id,
        result.measured_at.isoformat(timespec="seconds"),
        result.temperature_c,
        result.pressure_hpa,
        result.humidity_percent,
        result.status,
        DB_PATH,
        sync_summary,
    )
    return row_id


def build_supabase_client() -> SupabaseClient | None:
    if not SUPABASE_SYNC_ENABLED:
        return None
    if not SUPABASE_URL or not SUPABASE_KEY:
        return None
    return SupabaseClient(
        base_url=SUPABASE_URL,
        api_key=SUPABASE_KEY,
        table=SUPABASE_TABLE,
    )


def sync_pending_measurements(
    repository: MeasurementRepository,
    logger: logging.Logger,
    *,
    batch_size: int = 100,
) -> str:
    client = build_supabase_client()
    if client is None:
        if SUPABASE_SYNC_ENABLED:
            logger.warning(
                "Supabase sync skipped because SUPABASE_URL or SUPABASE_KEY is not configured."
            )
        else:
            logger.info("Supabase sync disabled by SUPABASE_SYNC_ENABLED.")
        return "skipped"

    pending_rows = repository.list_unsynced(limit=batch_size)
    if not pending_rows:
        return "no-pending"

    synced = 0
    failed = 0
    for row in pending_rows:
        try:
            client.upsert_measurement(row)
        except SupabaseSyncError as exc:
            failed += 1
            repository.mark_sync_failed(row.id, str(exc))
            logger.warning("Supabase sync failed for measurement id=%s: %s", row.id, exc)
            continue

        repository.mark_synced(row.id, utc_now_isoformat())
        synced += 1

    return f"synced={synced} failed={failed} pending={max(len(pending_rows) - synced - failed, 0)}"


def show_latest(limit: int) -> None:
    repository = MeasurementRepository(Path(DB_PATH))
    repository.initialize()

    with sqlite3.connect(DB_PATH) as conn:
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
            ORDER BY id DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()

    if not rows:
        print("No measurements found.")
        return

    print("id | measured_at | temperature_c | pressure_hpa | humidity_percent | status | raw_text | created_at | supabase_synced_at | supabase_sync_error | supabase_retry_count")
    print("---|-------------|---------------|--------------|------------------|--------|----------|-----------|---------------------|---------------------|----------------------")
    for row in rows:
        print(" | ".join("" if item is None else str(item) for item in row))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Measure BME280 once and save to SQLite.")
    subparsers = parser.add_subparsers(dest="command")

    subparsers.add_parser("run", help="Run one BME280 measurement and save it.")

    latest_parser = subparsers.add_parser("latest", help="Show latest saved rows.")
    latest_parser.add_argument("--limit", type=int, default=10)

    parser.add_argument(
        "--db-path",
        default=None,
        help="Override SQLite DB path for this process.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    if args.db_path:
        import app.config as config

        config.DB_PATH = Path(args.db_path)
        globals()["DB_PATH"] = Path(args.db_path)

    setup_logging()
    logger = logging.getLogger(__name__)

    try:
        if args.command in (None, "run"):
            run_once()
            return 0

        if args.command == "latest":
            show_latest(args.limit)
            return 0

        logger.error("unknown command: %s", args.command)
        return 2

    except Exception:
        logger.exception("measure_app failed")
        return 1


if __name__ == "__main__":
    sys.exit(main())
