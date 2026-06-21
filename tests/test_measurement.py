from __future__ import annotations

from datetime import datetime, timezone
import unittest

from app.measurement import MeasurementError, measure_average


class MeasureAverageTest(unittest.TestCase):
    def test_measure_average_computes_expected_values(self) -> None:
        timestamps = [
            datetime(2026, 6, 21, 9, 0, index * 5, tzinfo=timezone.utc)
            for index in range(10)
        ]
        values = [
            (timestamps[index], 20.0 + index, 1000.0 + index * 2, 40.0 + index * 0.5)
            for index in range(10)
        ]

        result = measure_average(
            read_func=values.__iter__().__next__,
            sleep_func=lambda _: None,
        )

        self.assertEqual(result.measured_at, timestamps[-1])
        self.assertEqual(result.temperature_c, 24.5)
        self.assertEqual(result.pressure_hpa, 1009.0)
        self.assertEqual(result.humidity_percent, 42.25)
        self.assertEqual(result.status, "ok")

    def test_measure_average_waits_between_samples(self) -> None:
        calls: list[float] = []
        timestamps = [
            datetime(2026, 6, 21, 9, 0, min(index * 5, 59), tzinfo=timezone.utc)
            for index in range(3)
        ]
        values = [
            (timestamps[index], 20.0, 1000.0, 40.0)
            for index in range(3)
        ]

        measure_average(
            sample_count=3,
            interval_seconds=5.0,
            read_func=values.__iter__().__next__,
            sleep_func=calls.append,
        )

        self.assertEqual(calls, [5.0, 5.0])

    def test_measure_average_stops_on_failed_sample(self) -> None:
        attempts = 0
        sleep_calls: list[float] = []

        def fake_read() -> tuple[datetime, float, float, float]:
            nonlocal attempts
            attempts += 1
            if attempts == 3:
                raise MeasurementError("sensor read failed")
            return datetime(2026, 6, 21, 9, 0, tzinfo=timezone.utc), 20.0, 1000.0, 40.0

        with self.assertRaises(MeasurementError):
            measure_average(
                sample_count=5,
                read_func=fake_read,
                sleep_func=sleep_calls.append,
            )

        self.assertEqual(attempts, 3)
        self.assertEqual(sleep_calls, [5.0, 5.0])


if __name__ == "__main__":
    unittest.main()
