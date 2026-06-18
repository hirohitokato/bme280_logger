from __future__ import annotations

import tempfile
import unittest
from datetime import datetime
from pathlib import Path
from unittest import mock

from app.models import MeasurementResult
from app.repository import MeasurementRepository
from app.supabase import SupabaseClient, SupabaseSyncError
import main


class SupabaseClientTest(unittest.TestCase):
    def test_serialize_payload_includes_local_id(self) -> None:
        repo_dir = tempfile.TemporaryDirectory()
        self.addCleanup(repo_dir.cleanup)
        repository = MeasurementRepository(Path(repo_dir.name) / "measurements.sqlite3")
        repository.initialize()
        row_id = repository.save(
            MeasurementResult(
                measured_at=datetime.fromisoformat("2026-06-18T09:00:00+09:00"),
                temperature_c=24.1,
                pressure_hpa=1011.2,
                humidity_percent=43.8,
                status="ok",
                raw_text="raw",
            )
        )
        stored = repository.list_unsynced()[0]

        payload = SupabaseClient._serialize_measurement(stored)
        self.assertEqual(payload["id"], row_id)
        self.assertEqual(payload["status"], "ok")


class SyncPendingMeasurementsTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.tempdir.name) / "measurements.sqlite3"
        self.repository = MeasurementRepository(self.db_path)
        self.repository.initialize()
        self.logger = main.logging.getLogger("test-sync")

    def tearDown(self) -> None:
        self.tempdir.cleanup()

    def _save_result(self) -> int:
        return self.repository.save(
            MeasurementResult(
                measured_at=datetime.fromisoformat("2026-06-18T09:00:00+09:00"),
                temperature_c=25.0,
                pressure_hpa=1008.0,
                humidity_percent=50.0,
                status="ok",
                raw_text=None,
            )
        )

    def test_sync_skips_when_not_configured(self) -> None:
        self._save_result()
        with mock.patch.object(main, "SUPABASE_SYNC_ENABLED", True), mock.patch.object(
            main, "SUPABASE_URL", ""
        ), mock.patch.object(main, "SUPABASE_KEY", ""):
            summary = main.sync_pending_measurements(self.repository, self.logger)
        self.assertEqual(summary, "skipped")
        self.assertEqual(len(self.repository.list_unsynced()), 1)

    def test_sync_marks_rows_as_synced(self) -> None:
        row_id = self._save_result()
        fake_client = mock.Mock()
        with mock.patch.object(main, "build_supabase_client", return_value=fake_client):
            summary = main.sync_pending_measurements(self.repository, self.logger)
        self.assertIn("synced=1", summary)
        self.assertEqual(self.repository.list_unsynced(), [])
        fake_client.upsert_measurement.assert_called_once()
        self.assertEqual(fake_client.upsert_measurement.call_args[0][0].id, row_id)

    def test_sync_records_failure_and_retries_later(self) -> None:
        row_id = self._save_result()
        fake_client = mock.Mock()
        fake_client.upsert_measurement.side_effect = SupabaseSyncError("network issue")
        with mock.patch.object(main, "build_supabase_client", return_value=fake_client):
            summary = main.sync_pending_measurements(self.repository, self.logger)
        self.assertIn("failed=1", summary)
        pending = self.repository.list_unsynced()
        self.assertEqual(len(pending), 1)
        self.assertEqual(pending[0].id, row_id)
        self.assertEqual(pending[0].supabase_retry_count, 1)


if __name__ == "__main__":
    unittest.main()
