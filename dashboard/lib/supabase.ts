import { buildDashboardPayload, getRangeStartIso } from "./dashboard";
import { DashboardPayload, DashboardRange, MeasurementRecord } from "./types";

const SUPABASE_URL = process.env.SUPABASE_URL?.trim() ?? "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
const SUPABASE_TABLE = process.env.SUPABASE_TABLE?.trim() || "measurements";

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

async function fetchMeasurements(query: string): Promise<MeasurementRecord[]> {
  const response = await fetch(buildEndpoint(query), {
    headers: buildHeaders(),
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Supabase fetch failed with HTTP ${response.status}: ${body}`);
  }

  return (await response.json()) as MeasurementRecord[];
}

export async function getDashboardPayload(range: DashboardRange): Promise<DashboardPayload> {
  const startIso = getRangeStartIso(range);
  const baseSelect =
    "select=id,measured_at,temperature_c,pressure_hpa,humidity_percent,status,raw_text,created_at";

  const [latestRows, rangeRows] = await Promise.all([
    fetchMeasurements(`${baseSelect}&order=measured_at.desc&limit=1`),
    fetchMeasurements(
      `${baseSelect}&measured_at=gte.${encodeURIComponent(startIso)}&order=measured_at.desc&limit=1000`,
    ),
  ]);

  return buildDashboardPayload(latestRows[0] ?? null, rangeRows);
}
