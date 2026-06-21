"use client";

import React, { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { buildBoxPlotBuckets } from "../lib/dashboard";
import { DashboardRange, MeasurementRecord, MetricKey, TimeSeriesPoint } from "../lib/types";

type MetricChartProps = {
  title: string;
  unit: string;
  color: string;
  range: DashboardRange;
  metric: MetricKey;
  records: MeasurementRecord[];
  points: TimeSeriesPoint[];
};

type HoveredBucket = {
  bucketStart: string;
  count: number;
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
  left: number;
  top: number;
};

function formatMetric(value: number, unit: string): string {
  return `${value.toFixed(1)} ${unit}`;
}

function formatTimestamp(value: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatDayLabel(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(date);
}

function MetricTooltip({
  active,
  payload,
  unit,
}: {
  active?: boolean;
  payload?: Array<{ value: number; payload: TimeSeriesPoint }>;
  unit: string;
}) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const point = payload[0]?.payload;
  if (!point) {
    return null;
  }

  return (
    <div className="chart-tooltip">
      <strong>{formatMetric(point.value, unit)}</strong>
      <span>{formatTimestamp(point.timestamp)}</span>
    </div>
  );
}

function TimeSeriesMetricChart({ points, color, title, unit }: Omit<MetricChartProps, "range" | "metric" | "records">) {
  if (points.length === 0) {
    return <div className="empty-chart">No measurements in this range.</div>;
  }

  const minTimestamp = points[0].timestamp;
  const maxTimestamp = points[points.length - 1].timestamp;
  const paddedDomain =
    minTimestamp === maxTimestamp
      ? [minTimestamp - 30 * 60 * 1000, maxTimestamp + 30 * 60 * 1000]
      : [minTimestamp, maxTimestamp];

  return (
    <div className="recharts-shell">
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={points} margin={{ top: 8, right: 8, left: -16, bottom: 8 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
          <XAxis
            dataKey="timestamp"
            domain={paddedDomain}
            tick={{ fill: "rgba(243,248,251,0.72)", fontSize: 12 }}
            tickFormatter={formatTimestamp}
            type="number"
            scale="time"
            minTickGap={36}
          />
          <YAxis
            dataKey="value"
            tick={{ fill: "rgba(243,248,251,0.72)", fontSize: 12 }}
            tickFormatter={(value: number) => value.toFixed(1)}
            width={44}
            domain={["auto", "auto"]}
          />
          <Tooltip content={<MetricTooltip unit={unit} />} />
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={3}
            dot={{ r: 3, fill: color, strokeWidth: 0 }}
            activeDot={{ r: 5, fill: color, stroke: "#071017", strokeWidth: 2 }}
            name={title}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function BoxPlotMetricChart({
  records,
  metric,
  color,
  unit,
}: Pick<MetricChartProps, "records" | "metric" | "color" | "unit">) {
  const buckets = useMemo(() => buildBoxPlotBuckets(records, metric), [records, metric]);
  const [hovered, setHovered] = useState<HoveredBucket | null>(null);

  if (buckets.length === 0) {
    return <div className="empty-chart">No measurements in this range.</div>;
  }

  const width = 560;
  const height = 260;
  const padding = { top: 14, right: 16, bottom: 32, left: 48 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const allValues = buckets.flatMap((bucket) => [bucket.min, bucket.q1, bucket.median, bucket.q3, bucket.max]);
  const minValue = Math.min(...allValues);
  const maxValue = Math.max(...allValues);
  const valuePadding = maxValue === minValue ? 1 : (maxValue - minValue) * 0.08;
  const lowerBound = minValue - valuePadding;
  const upperBound = maxValue + valuePadding;
  const step = buckets.length === 1 ? 0 : chartWidth / (buckets.length - 1);

  const toY = (value: number) =>
    padding.top + ((upperBound - value) / (upperBound - lowerBound || 1)) * chartHeight;

  const yTicks = Array.from({ length: 5 }, (_, index) => lowerBound + ((upperBound - lowerBound) * index) / 4).reverse();

  return (
    <div className="boxplot-shell">
      {hovered ? (
        <div className="chart-tooltip boxplot-tooltip" style={{ left: hovered.left, top: hovered.top }}>
          <strong>{formatDayLabel(hovered.bucketStart)}</strong>
          <span>count {hovered.count}</span>
          <span>min {formatMetric(hovered.min, unit)}</span>
          <span>q1 {formatMetric(hovered.q1, unit)}</span>
          <span>median {formatMetric(hovered.median, unit)}</span>
          <span>q3 {formatMetric(hovered.q3, unit)}</span>
          <span>max {formatMetric(hovered.max, unit)}</span>
        </div>
      ) : null}
      <svg className="chart-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${metric} box plot`}>
        <rect x="0" y="0" width={width} height={height} rx="18" fill="rgba(255,255,255,0.02)" />
        {yTicks.map((tick) => {
          const y = toY(tick);
          return (
            <g key={`tick-${tick}`}>
              <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="rgba(255,255,255,0.08)" />
              <text x={padding.left - 10} y={y + 4} textAnchor="end" className="chart-axis-label">
                {tick.toFixed(1)}
              </text>
            </g>
          );
        })}
        {buckets.map((bucket, index) => {
          const x = padding.left + index * step;
          const boxWidth = Math.max(10, Math.min(22, step * 0.55 || 22));
          const q1Y = toY(bucket.q1);
          const q3Y = toY(bucket.q3);
          const medianY = toY(bucket.median);
          const minY = toY(bucket.min);
          const maxY = toY(bucket.max);

          return (
            <g
              key={bucket.bucketStart}
              onMouseEnter={(event) =>
                setHovered({
                  ...bucket,
                  left: event.clientX,
                  top: event.clientY,
                })
              }
              onMouseMove={(event) =>
                setHovered((current) =>
                  current && current.bucketStart === bucket.bucketStart
                    ? { ...current, left: event.clientX, top: event.clientY }
                    : current,
                )
              }
              onMouseLeave={() => setHovered((current) => (current?.bucketStart === bucket.bucketStart ? null : current))}
            >
              <line x1={x} y1={maxY} x2={x} y2={q3Y} stroke={color} strokeWidth="2" />
              <line x1={x} y1={q1Y} x2={x} y2={minY} stroke={color} strokeWidth="2" />
              <line x1={x - boxWidth / 2} y1={maxY} x2={x + boxWidth / 2} y2={maxY} stroke={color} strokeWidth="2" />
              <line x1={x - boxWidth / 2} y1={minY} x2={x + boxWidth / 2} y2={minY} stroke={color} strokeWidth="2" />
              <rect
                x={x - boxWidth / 2}
                y={q3Y}
                width={boxWidth}
                height={Math.max(2, q1Y - q3Y)}
                fill={color}
                fillOpacity="0.22"
                stroke={color}
                strokeWidth="2"
                rx="4"
              />
              <line x1={x - boxWidth / 2} y1={medianY} x2={x + boxWidth / 2} y2={medianY} stroke={color} strokeWidth="2.5" />
              <text x={x} y={height - 10} textAnchor="middle" className="chart-axis-label">
                {formatDayLabel(bucket.bucketStart)}
              </text>
              <title>{`${formatDayLabel(bucket.bucketStart)} median ${formatMetric(bucket.median, unit)}`}</title>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function MetricChart({
  title,
  unit,
  color,
  range,
  metric,
  records,
  points,
}: MetricChartProps) {
  const values = points.map((point) => point.value);
  const min = values.length > 0 ? Math.min(...values) : null;
  const max = values.length > 0 ? Math.max(...values) : null;

  return (
    <section className="panel chart-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">{title}</p>
          <h2>{unit}</h2>
        </div>
        <div className="chart-stats">
          <span>min {min === null ? "--" : min.toFixed(1)}</span>
          <span>max {max === null ? "--" : max.toFixed(1)}</span>
        </div>
      </div>
      {range === "24h" ? (
        <TimeSeriesMetricChart color={color} points={points} title={title} unit={unit} />
      ) : (
        <BoxPlotMetricChart color={color} metric={metric} records={records} unit={unit} />
      )}
    </section>
  );
}
