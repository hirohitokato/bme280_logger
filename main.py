#!/usr/bin/env python3
from __future__ import annotations

import argparse
import logging
import sqlite3
import sys
from logging.handlers import RotatingFileHandler
from pathlib import Path

from app.config import DB_PATH, LOG_PATH
from app.measurement import measure
from app.repository import MeasurementRepository


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

    logger.info(
        "measurement saved: id=%s measured_at=%s temperature_c=%s pressure_hpa=%s humidity_percent=%s status=%s db=%s",
        row_id,
        result.measured_at.isoformat(timespec="seconds"),
        result.temperature_c,
        result.pressure_hpa,
        result.humidity_percent,
        result.status,
        DB_PATH,
    )
    return row_id


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
                created_at
            FROM measurements
            ORDER BY id DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()

    if not rows:
        print("No measurements found.")
        return

    print("id | measured_at | temperature_c | pressure_hpa | humidity_percent | status | raw_text | created_at")
    print("---|-------------|---------------|--------------|------------------|--------|----------|-----------")
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
