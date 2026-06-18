import { render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, test } from "vitest";

import { DashboardView } from "@/components/dashboard-view";
import {
  buildDashboardPayload,
  computeMetricSummary,
  getRangeStartIso,
  parseDashboardRange,
} from "@/lib/dashboard";
import { MeasurementRecord } from "@/lib/types";

const records: MeasurementRecord[] = [
  {
    id: 1,
    measured_at: "2026-06-18T00:00:00.000Z",
    temperature_c: 24.5,
    pressure_hpa: 1010.2,
    humidity_percent: 44.1,
    status: "ok",
    raw_text: null,
    created_at: "2026-06-18T00:00:05.000Z",
  },
  {
    id: 2,
    measured_at: "2026-06-18T01:00:00.000Z",
    temperature_c: 25.5,
    pressure_hpa: 1012.4,
    humidity_percent: 48.3,
    status: "ok",
    raw_text: null,
    created_at: "2026-06-18T01:00:05.000Z",
  },
];

describe("dashboard helpers", () => {
  test("parses supported ranges and falls back to 24h", () => {
    expect(parseDashboardRange("7d")).toBe("7d");
    expect(parseDashboardRange("unexpected")).toBe("24h");
  });

  test("computes range start for 24h, 7d, and 30d", () => {
    const now = new Date("2026-06-18T12:00:00.000Z");
    expect(getRangeStartIso("24h", now)).toBe("2026-06-17T12:00:00.000Z");
    expect(getRangeStartIso("7d", now)).toBe("2026-06-11T12:00:00.000Z");
    expect(getRangeStartIso("30d", now)).toBe("2026-05-19T12:00:00.000Z");
  });

  test("computes min, max, avg summaries", () => {
    expect(computeMetricSummary([1, 3, 5])).toEqual({
      min: 1,
      max: 5,
      avg: 3,
    });
    expect(computeMetricSummary([])).toEqual({
      min: null,
      max: null,
      avg: null,
    });
  });

  test("builds payload with sorted series and capped recent items", () => {
    const payload = buildDashboardPayload(records[1], [records[1], records[0]]);

    expect(payload.latest?.id).toBe(2);
    expect(payload.series.map((item) => item.id)).toEqual([1, 2]);
    expect(payload.recent.map((item) => item.id)).toEqual([2, 1]);
    expect(payload.summary.temperature_c.avg).toBe(25);
  });
});

describe("dashboard view", () => {
  test("renders cards, range summary, and recent table", () => {
    const payload = buildDashboardPayload(records[1], records);

    render(<DashboardView appName="BME280 Dashboard" payload={payload} range="24h" />);

    expect(screen.getByText("Current conditions")).toBeTruthy();
    expect(screen.getByText("24h at a glance")).toBeTruthy();
    expect(screen.getByText("Newest records in this range")).toBeTruthy();
    expect(screen.getAllByText("ok")[0]).toBeTruthy();
  });

  test("renders empty state without crashing", () => {
    const payload = buildDashboardPayload(null, []);

    render(<DashboardView appName="BME280 Dashboard" payload={payload} range="30d" />);

    expect(screen.getByText("No measurements yet")).toBeTruthy();
    expect(screen.getByText("There are no measurements in the selected range.")).toBeTruthy();
  });
});
