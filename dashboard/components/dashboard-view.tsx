import React from "react";
import { LocalTime } from "./local-time";
import { MetricChart } from "./metric-chart";
import { RangeTabs } from "./range-tabs";
import { formatMetricValue } from "../lib/dashboard";
import { DashboardPayload, DashboardRange } from "../lib/types";

type DashboardViewProps = {
  appName: string;
  range: DashboardRange;
  payload: DashboardPayload;
};

type DashboardErrorProps = {
  appName: string;
  range: DashboardRange;
  message: string;
};

export function DashboardError({ appName, range, message }: DashboardErrorProps) {
  return (
    <main className="dashboard-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">Supabase monitor</p>
          <h1>{appName}</h1>
        </div>
        <RangeTabs current={range} />
      </header>
      <section className="panel error-panel">
        <h2>Unable to load measurements</h2>
        <p>{message}</p>
      </section>
    </main>
  );
}

function MetricCard({
  label,
  value,
  unit,
}: {
  label: string;
  value: number | null;
  unit: string;
}) {
  return (
    <article className="metric-card">
      <p>{label}</p>
      <strong>
        {value === null ? "--" : value.toFixed(1)}
        <span>{unit}</span>
      </strong>
    </article>
  );
}

export function DashboardView({ appName, range, payload }: DashboardViewProps) {
  const { latest, recent, series, summary } = payload;

  return (
    <main className="dashboard-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">Supabase monitor</p>
          <h1>{appName}</h1>
          <p className="hero-copy">
            BME280 から蓄積された温度・湿度・気圧を、範囲ごとにざっと把握できるダッシュボードです。
          </p>
        </div>
        <RangeTabs current={range} />
      </header>

      <section className="latest-grid">
        <article className="panel latest-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Latest reading</p>
              <h2>{latest ? "Current conditions" : "No measurements yet"}</h2>
            </div>
            {latest ? <LocalTime className="muted" iso={latest.measured_at} /> : null}
          </div>
          <div className="metric-grid">
            <MetricCard label="Temperature" value={latest?.temperature_c ?? null} unit="°C" />
            <MetricCard label="Humidity" value={latest?.humidity_percent ?? null} unit="%" />
            <MetricCard label="Pressure" value={latest?.pressure_hpa ?? null} unit="hPa" />
          </div>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Range summary</p>
              <h2>{range} at a glance</h2>
            </div>
            <span className="muted">{series.length} records</span>
          </div>
          <div className="summary-grid">
            <div className="summary-item">
              <p>Temperature</p>
              <span>{formatMetricValue(summary.temperature_c.avg)} avg</span>
              <small>
                {formatMetricValue(summary.temperature_c.min)} / {formatMetricValue(summary.temperature_c.max)} °C
              </small>
            </div>
            <div className="summary-item">
              <p>Humidity</p>
              <span>{formatMetricValue(summary.humidity_percent.avg)} avg</span>
              <small>
                {formatMetricValue(summary.humidity_percent.min)} / {formatMetricValue(summary.humidity_percent.max)} %
              </small>
            </div>
            <div className="summary-item">
              <p>Pressure</p>
              <span>{formatMetricValue(summary.pressure_hpa.avg)} avg</span>
              <small>
                {formatMetricValue(summary.pressure_hpa.min)} / {formatMetricValue(summary.pressure_hpa.max)} hPa
              </small>
            </div>
          </div>
        </article>
      </section>

      <section className="chart-grid">
        <MetricChart
          title="Temperature"
          unit="°C"
          color="#ff7a18"
          records={series}
          accessor={(record) => record.temperature_c}
        />
        <MetricChart
          title="Humidity"
          unit="%"
          color="#37b8ff"
          records={series}
          accessor={(record) => record.humidity_percent}
        />
        <MetricChart
          title="Pressure"
          unit="hPa"
          color="#9ce25b"
          records={series}
          accessor={(record) => record.pressure_hpa}
        />
      </section>

      <section className="panel table-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Recent measurements</p>
            <h2>Newest records in this range</h2>
          </div>
        </div>
        {recent.length === 0 ? (
          <p className="empty-state">There are no measurements in the selected range.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Measured at</th>
                  <th>Temp</th>
                  <th>Humidity</th>
                  <th>Pressure</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((record) => (
                  <tr key={record.id}>
                    <td>
                      <LocalTime iso={record.measured_at} />
                    </td>
                    <td>{record.temperature_c.toFixed(1)} °C</td>
                    <td>{record.humidity_percent.toFixed(1)} %</td>
                    <td>{record.pressure_hpa.toFixed(1)} hPa</td>
                    <td>
                      <span className="status-pill">{record.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
