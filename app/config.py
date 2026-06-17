from __future__ import annotations

import os
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.environ.get("MEASURE_APP_DATA_DIR", BASE_DIR / "data"))
LOG_DIR = Path(os.environ.get("MEASURE_APP_LOG_DIR", BASE_DIR / "logs"))
DB_PATH = Path(os.environ.get("MEASURE_APP_DB_PATH", DATA_DIR / "measurements.sqlite3"))
LOG_PATH = Path(os.environ.get("MEASURE_APP_LOG_PATH", LOG_DIR / "measure.log"))
