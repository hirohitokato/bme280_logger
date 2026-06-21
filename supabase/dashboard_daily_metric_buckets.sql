CREATE INDEX IF NOT EXISTS idx_measurements_measured_at_utc
ON measurements (((measured_at)::timestamptz));

CREATE OR REPLACE FUNCTION dashboard_daily_metric_buckets(
    start_iso timestamptz,
    end_iso timestamptz
)
RETURNS TABLE (
    bucket_date date,
    metric text,
    min_value double precision,
    q1_value double precision,
    median_value double precision,
    q3_value double precision,
    max_value double precision,
    avg_value double precision,
    sample_count integer
)
LANGUAGE sql
STABLE
AS $$
    WITH filtered AS (
        SELECT
            date_trunc('day', (measured_at)::timestamptz AT TIME ZONE 'UTC')::date AS bucket_date,
            temperature_c::double precision AS temperature_c,
            humidity_percent::double precision AS humidity_percent,
            pressure_hpa::double precision AS pressure_hpa
        FROM measurements
        WHERE (measured_at)::timestamptz >= start_iso
          AND (measured_at)::timestamptz < end_iso
    ),
    exploded AS (
        SELECT bucket_date, 'temperature_c'::text AS metric, temperature_c AS value FROM filtered
        UNION ALL
        SELECT bucket_date, 'humidity_percent'::text AS metric, humidity_percent AS value FROM filtered
        UNION ALL
        SELECT bucket_date, 'pressure_hpa'::text AS metric, pressure_hpa AS value FROM filtered
    )
    SELECT
        bucket_date,
        metric,
        MIN(value) AS min_value,
        percentile_cont(0.25) WITHIN GROUP (ORDER BY value) AS q1_value,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY value) AS median_value,
        percentile_cont(0.75) WITHIN GROUP (ORDER BY value) AS q3_value,
        MAX(value) AS max_value,
        AVG(value) AS avg_value,
        COUNT(*)::integer AS sample_count
    FROM exploded
    GROUP BY bucket_date, metric
    ORDER BY bucket_date ASC, metric ASC;
$$;
