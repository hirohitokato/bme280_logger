export type DashboardRange = "24h" | "7d" | "30d";
export type MetricKey = "temperature_c" | "humidity_percent" | "pressure_hpa";

export type LatestMeasurement = {
  measured_at: string;
  temperature_c: number;
  pressure_hpa: number;
  humidity_percent: number;
};

export type MeasurementRecord = LatestMeasurement & {
  id: number;
  status: string;
  raw_text: string | null;
  created_at: string;
};

export type RecentMeasurementRecord = LatestMeasurement & {
  id: number;
  status: string;
};

export type MetricSummary = {
  min: number | null;
  max: number | null;
  avg: number | null;
};

export type TimeSeriesPoint = {
  measured_at: string;
  timestamp: number;
  value: number;
};

export type BoxPlotBucket = {
  bucketStart: string;
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
  count: number;
  avg?: number;
};

export type DailyMetricBucketRow = {
  bucket_date: string;
  metric: MetricKey;
  min_value: number;
  q1_value: number;
  median_value: number;
  q3_value: number;
  max_value: number;
  avg_value: number;
  sample_count: number;
};

export type DashboardPayload = {
  latest: LatestMeasurement | null;
  series: MeasurementRecord[];
  boxPlots: Record<MetricKey, BoxPlotBucket[]>;
  charts: Record<MetricKey, TimeSeriesPoint[]>;
  summary: {
    temperature_c: MetricSummary;
    humidity_percent: MetricSummary;
    pressure_hpa: MetricSummary;
  };
  recent: RecentMeasurementRecord[];
  recordCount: number;
};
