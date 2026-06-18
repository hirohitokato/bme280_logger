from __future__ import annotations

import tempfile
import unittest
from datetime import datetime
from pathlib import Path

from app.models import MeasurementResult
from app.repository import MeasurementRepository


class MeasurementRepositoryTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.tempdir.name) / "measurements.sqlite3"
        self.repository = MeasurementRepository(self.db_path)
        self.repository.initialize()

    def tearDown(self) -> None:
        self.tempdir.cleanup()

    def test_initialize_adds_supabase_sync_columns(self) -> None:
        pending = self.repository.list_unsynced()
        self.assertEqual(pending, [])

    def test_save_and_mark_sync_state(self) -> None:
        row_id = self.repository.save(
            MeasurementResult(
                measured_at=datetime.fromisoformat("2026-06-18T09:00:00+09:00"),
                temperature_c=25.5,
                pressure_hpa=1009.1,
                humidity_percent=52.0,
                status="ok",
                raw_text=None,
            )
        )

        unsynced = self.repository.list_unsynced()
        self.assertEqual(len(unsynced), 1)
        self.assertEqual(unsynced[0].id, row_id)
        self.assertEqual(unsynced[0].supabase_retry_count, 0)

        self.repository.mark_sync_failed(row_id, "temporary failure")
        failed = self.repository.list_unsynced()[0]
        self.assertEqual(failed.supabase_retry_count, 1)
        self.assertEqual(failed.supabase_sync_error, "temporary failure")

        self.repository.mark_synced(row_id, "2026-06-18T00:01:00+00:00")
        self.assertEqual(self.repository.list_unsynced(), [])


if __name__ == "__main__":
    unittest.main()
