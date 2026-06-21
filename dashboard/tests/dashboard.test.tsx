import { render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, test } from "vitest";

import { DashboardView } from "../components/dashboard-view";
import {
  buildBoxPlotBuckets,
  buildDashboardPayload,
  buildMetricBuckets,
  buildSummaryFromBuckets,
  buildTimeSeriesPoints,
  computeMetricSummary,
  getRangeStartIso,
  parseDashboardRange,
  percentile,
} from "../lib/dashboard";
import { DailyMetricBucketRow, MeasurementRecord } from "../lib/types";

if (typeof window !== "undefined" && !window.ResizeObserver) {
  window.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

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
    const payload = buildDashboardPayload({
      latest: records[1],
      series: [records[1], records[0]],
      recent: [records[1], records[0]],
    });

    expect(payload.latest?.measured_at).toBe("2026-06-18T01:00:00.000Z");
    expect(payload.series.map((item) => item.id)).toEqual([1, 2]);
    expect(payload.charts.temperature_c.map((item) => item.value)).toEqual([24.5, 25.5]);
    expect(payload.recent.map((item) => item.id)).toEqual([2, 1]);
    expect(payload.summary.temperature_c.avg).toBe(25);
    expect(payload.recordCount).toBe(2);
  });

  test("builds time-series points with real timestamps", () => {
    const points = buildTimeSeriesPoints([records[1], records[0]], "temperature_c");
    expect(points.map((point) => point.timestamp)).toEqual([
      new Date("2026-06-18T00:00:00.000Z").getTime(),
      new Date("2026-06-18T01:00:00.000Z").getTime(),
    ]);
  });

  test("computes percentiles for odd, even, single, and empty samples", () => {
    expect(percentile([1, 3, 5], 0.5)).toBe(3);
    expect(percentile([1, 3, 5, 7], 0.5)).toBe(4);
    expect(percentile([9], 0.25)).toBe(9);
    expect(percentile([], 0.5)).toBeNull();
  });

  test("builds daily box-plot buckets", () => {
    const buckets = buildBoxPlotBuckets(
      [
        records[0],
        records[1],
        {
          ...records[1],
          id: 3,
          measured_at: "2026-06-19T01:00:00.000Z",
          temperature_c: 28.5,
        },
      ],
      "temperature_c",
    );

    expect(buckets).toHaveLength(2);
    expect(buckets[0]).toMatchObject({
      bucketStart: "2026-06-18",
      min: 24.5,
      median: 25,
      max: 25.5,
      count: 2,
    });
    expect(buckets[1]).toMatchObject({
      bucketStart: "2026-06-19",
      min: 28.5,
      median: 28.5,
      max: 28.5,
      count: 1,
    });
  });

  test("groups box-plot buckets by utc day", () => {
    const buckets = buildBoxPlotBuckets(
      [
        {
          ...records[0],
          id: 10,
          measured_at: "2026-06-18T23:30:00.000-05:00",
          temperature_c: 21.2,
        },
        {
          ...records[1],
          id: 11,
          measured_at: "2026-06-19T01:00:00.000Z",
          temperature_c: 23.4,
        },
      ],
      "temperature_c",
    );

    expect(buckets).toHaveLength(1);
    expect(buckets[0]).toMatchObject({
      bucketStart: "2026-06-19",
      min: 21.2,
      max: 23.4,
      count: 2,
    });
  });

  test("builds metric buckets and summary from aggregated rows", () => {
    const rows: DailyMetricBucketRow[] = [
      {
        bucket_date: "2026-06-18",
        metric: "temperature_c",
        min_value: 24.5,
        q1_value: 24.8,
        median_value: 25.0,
        q3_value: 25.2,
        max_value: 25.5,
        avg_value: 25.0,
        sample_count: 2,
      },
      {
        bucket_date: "2026-06-19",
        metric: "temperature_c",
        min_value: 26.0,
        q1_value: 26.2,
        median_value: 26.5,
        q3_value: 26.7,
        max_value: 27.0,
        avg_value: 26.5,
        sample_count: 4,
      },
    ];

    const buckets = buildMetricBuckets(rows);
    const summary = buildSummaryFromBuckets(buckets);

    expect(buckets.temperature_c).toEqual([
      {
        bucketStart: "2026-06-18",
        min: 24.5,
        q1: 24.8,
        median: 25.0,
        q3: 25.2,
        max: 25.5,
        avg: 25.0,
        count: 2,
      },
      {
        bucketStart: "2026-06-19",
        min: 26.0,
        q1: 26.2,
        median: 26.5,
        q3: 26.7,
        max: 27.0,
        avg: 26.5,
        count: 4,
      },
    ]);
    expect(summary.temperature_c).toEqual({
      min: 24.5,
      max: 27.0,
      avg: 26.0,
    });
  });
});

describe("dashboard view", () => {
  test("renders cards, range summary, and recent table", () => {
    const payload = buildDashboardPayload({
      latest: records[1],
      series: records,
      recent: [records[1], records[0]],
    });

    render(<DashboardView appName="BME280 Dashboard" payload={payload} range="24h" />);

    expect(screen.getByText("Current conditions")).toBeTruthy();
    expect(screen.getByText("24h at a glance")).toBeTruthy();
    expect(screen.getByText("Newest records in this range")).toBeTruthy();
    expect(screen.getAllByText("ok")[0]).toBeTruthy();
  });

  test("renders empty state without crashing", () => {
    const payload = buildDashboardPayload({
      latest: null,
      series: [],
      recent: [],
    });

    render(<DashboardView appName="BME280 Dashboard" payload={payload} range="30d" />);

    expect(screen.getByText("No measurements yet")).toBeTruthy();
    expect(screen.getByText("There are no measurements in the selected range.")).toBeTruthy();
  });

  test("renders aggregated 30d payload without raw series", () => {
    const payload = buildDashboardPayload({
      latest: records[1],
      series: [],
      recent: [records[1], records[0]],
      boxPlots: {
        temperature_c: [
          { bucketStart: "2026-06-18", min: 24.5, q1: 24.8, median: 25.0, q3: 25.2, max: 25.5, avg: 25.0, count: 2 },
        ],
        humidity_percent: [
          { bucketStart: "2026-06-18", min: 44.1, q1: 45.0, median: 46.2, q3: 47.0, max: 48.3, avg: 46.2, count: 2 },
        ],
        pressure_hpa: [
          { bucketStart: "2026-06-18", min: 1010.2, q1: 1010.8, median: 1011.3, q3: 1011.9, max: 1012.4, avg: 1011.3, count: 2 },
        ],
      },
      summary: {
        temperature_c: { min: 24.5, max: 25.5, avg: 25.0 },
        humidity_percent: { min: 44.1, max: 48.3, avg: 46.2 },
        pressure_hpa: { min: 1010.2, max: 1012.4, avg: 1011.3 },
      },
      recordCount: 2,
    });

    render(<DashboardView appName="BME280 Dashboard" payload={payload} range="30d" />);

    expect(screen.getAllByText("30d at a glance").length).toBeGreaterThan(0);
    expect(screen.getAllByText("2 records").length).toBeGreaterThan(0);
  });
});
