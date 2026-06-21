import {
  buildDashboardPayload,
  buildMetricBuckets,
  buildSummaryFromBuckets,
  getRangeStartIso,
} from "./dashboard";
import {
  DailyMetricBucketRow,
  DashboardPayload,
  DashboardRange,
  LatestMeasurement,
  MeasurementRecord,
  RecentMeasurementRecord,
} from "./types";

const SUPABASE_URL = process.env.SUPABASE_URL?.trim() ?? "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
const SUPABASE_TABLE = process.env.SUPABASE_TABLE?.trim() || "measurements";
const DAILY_BUCKETS_RPC = process.env.SUPABASE_DAILY_BUCKETS_RPC?.trim() || "dashboard_daily_metric_buckets";

function requireEnv(name: string, value: string): string {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function buildHeaders(): HeadersInit {
  const apiKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY", SUPABASE_SERVICE_ROLE_KEY);
  return {
    apikey: apiKey,
    Authorization: `Bearer ${apiKey}`,
    Accept: "application/json",
  };
}

function buildEndpoint(query: string): string {
  const baseUrl = requireEnv("SUPABASE_URL", SUPABASE_URL).replace(/\/$/, "");
  return `${baseUrl}/rest/v1/${SUPABASE_TABLE}?${query}`;
}

function buildRpcEndpoint(functionName: string): string {
  const baseUrl = requireEnv("SUPABASE_URL", SUPABASE_URL).replace(/\/$/, "");
  return `${baseUrl}/rest/v1/rpc/${functionName}`;
}

async function fetchJson<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    headers: buildHeaders(),
    cache: "no-store",
    ...init,
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Supabase fetch failed with HTTP ${response.status}: ${body}`);
  }

  return (await response.json()) as T;
}

async function fetchMeasurements(query: string): Promise<MeasurementRecord[]> {
  return fetchJson<MeasurementRecord[]>(buildEndpoint(query));
}

async function fetchLatestMeasurement(): Promise<LatestMeasurement | null> {
  const rows = await fetchJson<LatestMeasurement[]>(
    buildEndpoint("select=measured_at,temperature_c,pressure_hpa,humidity_percent&order=measured_at.desc&limit=1"),
  );
  return rows[0] ?? null;
}

async function fetchRecentMeasurements(startIso: string): Promise<RecentMeasurementRecord[]> {
  return fetchJson<RecentMeasurementRecord[]>(
    buildEndpoint(
      `select=id,measured_at,temperature_c,pressure_hpa,humidity_percent,status&measured_at=gte.${encodeURIComponent(startIso)}&order=measured_at.desc&limit=12`,
    ),
  );
}

async function fetchMeasurementsInRange(startIso: string): Promise<MeasurementRecord[]> {
  return fetchMeasurements(
    `select=id,measured_at,temperature_c,pressure_hpa,humidity_percent,status,raw_text,created_at&measured_at=gte.${encodeURIComponent(startIso)}&order=measured_at.asc`,
  );
}

async function fetchDailyMetricBuckets(
  startIso: string,
  endIso: string,
): Promise<DailyMetricBucketRow[]> {
  return fetchJson<DailyMetricBucketRow[]>(buildRpcEndpoint(DAILY_BUCKETS_RPC), {
    method: "POST",
    headers: {
      ...buildHeaders(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      start_iso: startIso,
      end_iso: endIso,
    }),
  });
}

export async function getDashboardPayload(range: DashboardRange): Promise<DashboardPayload> {
  const startIso = getRangeStartIso(range);
  const endIso = new Date().toISOString();

  if (range === "24h") {
    const [latest, series, recent] = await Promise.all([
      fetchLatestMeasurement(),
      fetchMeasurementsInRange(startIso),
      fetchRecentMeasurements(startIso),
    ]);

    return buildDashboardPayload({
      latest,
      series,
      recent,
    });
  }

  const [latest, recent, dailyRows] = await Promise.all([
    fetchLatestMeasurement(),
    fetchRecentMeasurements(startIso),
    fetchDailyMetricBuckets(startIso, endIso),
  ]);

  const boxPlots = buildMetricBuckets(dailyRows);
  const summary = buildSummaryFromBuckets(boxPlots);
  const recordCount = boxPlots.temperature_c.reduce((sum, bucket) => sum + bucket.count, 0);

  return buildDashboardPayload({
    latest,
    series: [],
    recent,
    boxPlots,
    summary,
    recordCount,
  });
}
