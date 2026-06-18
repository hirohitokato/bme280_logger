from __future__ import annotations

import os
from pathlib import Path

try:
    from dotenv import load_dotenv
except ImportError:  # pragma: no cover
    load_dotenv = None


BASE_DIR = Path(__file__).resolve().parent.parent
if load_dotenv is not None:
    load_dotenv(BASE_DIR / ".env")

DATA_DIR = Path(os.environ.get("MEASURE_APP_DATA_DIR", BASE_DIR / "data"))
LOG_DIR = Path(os.environ.get("MEASURE_APP_LOG_DIR", BASE_DIR / "logs"))
DB_PATH = Path(os.environ.get("MEASURE_APP_DB_PATH", DATA_DIR / "measurements.sqlite3"))
LOG_PATH = Path(os.environ.get("MEASURE_APP_LOG_PATH", LOG_DIR / "measure.log"))
SUPABASE_URL = os.environ.get("SUPABASE_URL", "").strip()
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "").strip()
SUPABASE_TABLE = os.environ.get("SUPABASE_TABLE", "measurements").strip() or "measurements"
SUPABASE_SYNC_ENABLED = os.environ.get("SUPABASE_SYNC_ENABLED", "true").strip().lower() not in {
    "0",
    "false",
    "no",
    "off",
}
