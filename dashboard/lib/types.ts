export type DashboardRange = "24h" | "7d" | "30d";
export type MetricKey = "temperature_c" | "humidity_percent" | "pressure_hpa";

export type MeasurementRecord = {
  id: number;
  measured_at: string;
  temperature_c: number;
  pressure_hpa: number;
  humidity_percent: number;
  status: string;
  raw_text: string | null;
  created_at: string;
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
};

export type DashboardPayload = {
  latest: MeasurementRecord | null;
  series: MeasurementRecord[];
  charts: Record<MetricKey, TimeSeriesPoint[]>;
  summary: {
    temperature_c: MetricSummary;
    humidity_percent: MetricSummary;
    pressure_hpa: MetricSummary;
  };
  recent: MeasurementRecord[];
};
