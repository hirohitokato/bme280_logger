import {
  BoxPlotBucket,
  DailyMetricBucketRow,
  DashboardPayload,
  DashboardRange,
  LatestMeasurement,
  MeasurementRecord,
  MetricKey,
  MetricSummary,
  RecentMeasurementRecord,
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
      date.getUTCFullYear().toString().padStart(4, "0"),
      (date.getUTCMonth() + 1).toString().padStart(2, "0"),
      date.getUTCDate().toString().padStart(2, "0"),
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
        avg: sorted.reduce((sum, value) => sum + value, 0) / sorted.length,
      };
    });
}

export function buildMetricBuckets(
  rows: DailyMetricBucketRow[],
): Record<MetricKey, BoxPlotBucket[]> {
  const initialBuckets: Record<MetricKey, BoxPlotBucket[]> = {
    temperature_c: [],
    humidity_percent: [],
    pressure_hpa: [],
  };

  for (const row of rows) {
    initialBuckets[row.metric].push({
      bucketStart: row.bucket_date,
      min: row.min_value,
      q1: row.q1_value,
      median: row.median_value,
      q3: row.q3_value,
      max: row.max_value,
      count: row.sample_count,
      avg: row.avg_value,
    });
  }

  for (const metric of METRIC_KEYS) {
    initialBuckets[metric].sort((left, right) => left.bucketStart.localeCompare(right.bucketStart));
  }

  return initialBuckets;
}

export function buildSummaryFromBuckets(
  buckets: Record<MetricKey, BoxPlotBucket[]>,
): Record<MetricKey, MetricSummary> {
  return METRIC_KEYS.reduce<Record<MetricKey, MetricSummary>>((accumulator, metric) => {
    const metricBuckets = buckets[metric];
    if (metricBuckets.length === 0) {
      accumulator[metric] = { min: null, max: null, avg: null };
      return accumulator;
    }

    let totalCount = 0;
    let weightedSum = 0;
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;

    for (const bucket of metricBuckets) {
      totalCount += bucket.count;
      weightedSum += (bucket.avg ?? bucket.median) * bucket.count;
      min = Math.min(min, bucket.min);
      max = Math.max(max, bucket.max);
    }

    accumulator[metric] = {
      min,
      max,
      avg: totalCount === 0 ? null : weightedSum / totalCount,
    };
    return accumulator;
  }, {
    temperature_c: { min: null, max: null, avg: null },
    humidity_percent: { min: null, max: null, avg: null },
    pressure_hpa: { min: null, max: null, avg: null },
  });
}

export function buildDashboardPayload({
  latest,
  series,
  recent,
  boxPlots,
  summary,
  recordCount,
}: {
  latest: LatestMeasurement | null;
  series: MeasurementRecord[];
  recent: RecentMeasurementRecord[];
  boxPlots?: Record<MetricKey, BoxPlotBucket[]>;
  summary?: Record<MetricKey, MetricSummary>;
  recordCount?: number;
}): DashboardPayload {
  const chronological = [...series].sort((a, b) => a.measured_at.localeCompare(b.measured_at));
  const resolvedBoxPlots = boxPlots ?? {
    temperature_c: [],
    humidity_percent: [],
    pressure_hpa: [],
  };

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
    boxPlots: resolvedBoxPlots,
    charts,
    recent,
    summary: summary ?? {
      temperature_c: computeMetricSummary(chronological.map((item) => item.temperature_c)),
      humidity_percent: computeMetricSummary(chronological.map((item) => item.humidity_percent)),
      pressure_hpa: computeMetricSummary(chronological.map((item) => item.pressure_hpa)),
    },
    recordCount: recordCount ?? chronological.length,
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
