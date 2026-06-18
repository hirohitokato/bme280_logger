import { DashboardPayload, DashboardRange, MeasurementRecord, MetricSummary } from "./types";

const RANGE_HOURS: Record<DashboardRange, number> = {
  "24h": 24,
  "7d": 24 * 7,
  "30d": 24 * 30,
};

export function parseDashboardRange(value: string | string[] | undefined): DashboardRange {
  if (value === "24h" || value === "7d" || value === "30d") {
    return value;
  }
  return "24h";
}

export function getRangeStartIso(
  range: DashboardRange,
  now: Date = new Date(),
): string {
  const start = new Date(now.getTime() - RANGE_HOURS[range] * 60 * 60 * 1000);
  return start.toISOString();
}

export function computeMetricSummary(
  values: number[],
): MetricSummary {
  if (values.length === 0) {
    return { min: null, max: null, avg: null };
  }

  const total = values.reduce((sum, value) => sum + value, 0);
  return {
    min: Math.min(...values),
    max: Math.max(...values),
    avg: total / values.length,
  };
}

export function buildDashboardPayload(
  latest: MeasurementRecord | null,
  series: MeasurementRecord[],
): DashboardPayload {
  const chronological = [...series].sort((a, b) => a.measured_at.localeCompare(b.measured_at));
  const recent = [...series]
    .sort((a, b) => b.measured_at.localeCompare(a.measured_at))
    .slice(0, 12);

  return {
    latest,
    series: chronological,
    recent,
    summary: {
      temperature_c: computeMetricSummary(chronological.map((item) => item.temperature_c)),
      humidity_percent: computeMetricSummary(chronological.map((item) => item.humidity_percent)),
      pressure_hpa: computeMetricSummary(chronological.map((item) => item.pressure_hpa)),
    },
  };
}

export function formatMetricValue(
  value: number | null,
  digits = 1,
): string {
  if (value === null) {
    return "--";
  }
  return value.toFixed(digits);
}
