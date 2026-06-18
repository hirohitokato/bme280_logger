import React from "react";
import { MeasurementRecord } from "@/lib/types";

type MetricChartProps = {
  title: string;
  unit: string;
  color: string;
  records: MeasurementRecord[];
  accessor: (record: MeasurementRecord) => number;
};

type Point = {
  x: number;
  y: number;
  value: number;
};

function buildChartPoints(records: MeasurementRecord[], accessor: (record: MeasurementRecord) => number): Point[] {
  if (records.length === 0) {
    return [];
  }

  const values = records.map(accessor);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const width = 560;
  const height = 220;
  const padding = 18;
  const xStep = records.length === 1 ? 0 : (width - padding * 2) / (records.length - 1);
  const range = max - min || 1;

  return records.map((record, index) => {
    const value = accessor(record);
    return {
      x: padding + index * xStep,
      y: height - padding - ((value - min) / range) * (height - padding * 2),
      value,
    };
  });
}

function toPath(points: Point[]): string {
  if (points.length === 0) {
    return "";
  }

  return points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(" ");
}

export function MetricChart({
  title,
  unit,
  color,
  records,
  accessor,
}: MetricChartProps) {
  const points = buildChartPoints(records, accessor);
  const values = records.map(accessor);
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
      {points.length === 0 ? (
        <div className="empty-chart">No measurements in this range.</div>
      ) : (
        <svg className="chart-svg" viewBox="0 0 560 220" role="img" aria-label={`${title} chart`}>
          <defs>
            <linearGradient id={`gradient-${title}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.35" />
              <stop offset="100%" stopColor={color} stopOpacity="0.04" />
            </linearGradient>
          </defs>
          <rect x="0" y="0" width="560" height="220" rx="18" fill="rgba(255,255,255,0.02)" />
          <path d={toPath(points)} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" />
          {points.map((point, index) => (
            <circle key={`${title}-${index}`} cx={point.x} cy={point.y} r="3.5" fill={color}>
              <title>{`${point.value.toFixed(1)} ${unit}`}</title>
            </circle>
          ))}
        </svg>
      )}
    </section>
  );
}
