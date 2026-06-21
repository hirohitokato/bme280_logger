import {
  BoxPlotBucket,
  DashboardPayload,
  DashboardRange,
  MeasurementRecord,
  MetricKey,
  MetricSummary,
  TimeSeriesPoint,
} from "./types";

const RANGE_HOURS: Record<DashboardRange, number> = {
  "24h": 24,
  "7d": 24 * 7,
  "30d": 24 * 30,
};

const METRIC_KEYS: MetricKey[] = ["temperature_c", "humidity_percent", "pressure_hpa"];

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

export function computeMetricSummary(values: number[]): MetricSummary {
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

export function buildTimeSeriesPoints(
  records: MeasurementRecord[],
  metric: MetricKey,
): TimeSeriesPoint[] {
  return [...records]
    .sort((a, b) => a.measured_at.localeCompare(b.measured_at))
    .map((record) => ({
      measured_at: record.measured_at,
      timestamp: new Date(record.measured_at).getTime(),
      value: record[metric],
    }));
}

export function percentile(sortedValues: number[], ratio: number): number | null {
  if (sortedValues.length === 0) {
    return null;
  }
  if (sortedValues.length === 1) {
    return sortedValues[0];
  }

  const index = (sortedValues.length - 1) * ratio;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) {
    return sortedValues[lower];
  }

  const weight = index - lower;
  return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
}

export function buildBoxPlotBuckets(
  records: MeasurementRecord[],
  metric: MetricKey,
): BoxPlotBucket[] {
  const grouped = new Map<string, number[]>();

  for (const record of records) {
    const date = new Date(record.measured_at);
    const dayKey = [
      date.getFullYear().toString().padStart(4, "0"),
      (date.getMonth() + 1).toString().padStart(2, "0"),
      date.getDate().toString().padStart(2, "0"),
    ].join("-");
    const values = grouped.get(dayKey) ?? [];
    values.push(record[metric]);
    grouped.set(dayKey, values);
  }

  return [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([bucketStart, values]) => {
      const sorted = [...values].sort((a, b) => a - b);
      return {
        bucketStart,
        min: sorted[0],
        q1: percentile(sorted, 0.25) ?? sorted[0],
        median: percentile(sorted, 0.5) ?? sorted[0],
        q3: percentile(sorted, 0.75) ?? sorted[0],
        max: sorted[sorted.length - 1],
        count: sorted.length,
      };
    });
}

export function buildDashboardPayload(
  latest: MeasurementRecord | null,
  series: MeasurementRecord[],
): DashboardPayload {
  const chronological = [...series].sort((a, b) => a.measured_at.localeCompare(b.measured_at));
  const recent = [...series]
    .sort((a, b) => b.measured_at.localeCompare(a.measured_at))
    .slice(0, 12);

  const charts = METRIC_KEYS.reduce<Record<MetricKey, TimeSeriesPoint[]>>((accumulator, metric) => {
    accumulator[metric] = buildTimeSeriesPoints(chronological, metric);
    return accumulator;
  }, {
    temperature_c: [],
    humidity_percent: [],
    pressure_hpa: [],
  });

  return {
    latest,
    series: chronological,
    charts,
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
