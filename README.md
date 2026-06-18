# measure_app

Raspberry Pi 5 with BME280 on I2C address `0x76`. The app measures temperature, pressure, and humidity once, stores the result with timestamp into SQLite3, and can retry-safe sync the same row to Supabase.

## Layout

```text
measure_app/
├── app/
│   ├── __init__.py
│   ├── config.py
│   ├── measurement.py
│   ├── models.py
│   └── repository.py
├── main.py
├── requirements.txt
├── systemd/
│   ├── measure-app.service
│   └── measure-app.timer
├── install.sh
├── uninstall.sh
└── README.md
```

## Responsibilities

- `app/measurement.py`: BME280 measurement only. It does not access SQLite.
- `app/repository.py`: SQLite initialization, INSERT, and Supabase sync state management.
- `app/supabase.py`: Supabase REST upsert only.
- `main.py`: Application orchestration.
- `systemd/`: Runs `main.py run` every 10 minutes.

## Raspberry Pi prerequisites

Enable I2C first.

```sh
sudo raspi-config
```

Then install packages.

```sh
sudo apt update
sudo apt install -y python3-venv python3-smbus2 i2c-tools sqlite3
```

Create the virtual environment as `.venv` and install Python dependencies there.

```sh
cd /home/pi/measure_app
python -m venv .venv
./.venv/bin/pip install -r requirements.txt
```

Check the sensor. The expected address is usually `76` for this project.

```sh
i2cdetect -y 1
```

## Manual run

Place this directory at `/home/pi/measure_app`.

```sh
cd /home/pi/measure_app
python main.py run
```

If you use Supabase sync, create `.env` first.

```sh
cp .env.example .env
```

Example:

```dotenv
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-service-role-key
SUPABASE_TABLE=measurements
SUPABASE_SYNC_ENABLED=true
MEASURE_APP_DB_PATH=/home/pi/measure_app/data/measurements.sqlite3
```

Show latest rows:

```sh
python main.py latest --limit 10
```

Direct SQLite check:

```sh
sqlite3 /home/pi/measure_app/data/measurements.sqlite3 \
"SELECT id, measured_at, temperature_c, pressure_hpa, humidity_percent, status, supabase_synced_at, supabase_retry_count FROM measurements ORDER BY id DESC LIMIT 10;"
```

## Enable 10 minute interval execution

```sh
cd /home/pi/measure_app
sudo ./install.sh
```

`measure-app.service` runs with `/home/pi/measure_app/.venv/bin/python`, so `.venv` must exist before installation.

Check status:

```sh
systemctl status measure-app.timer
systemctl list-timers --all | grep measure-app
journalctl -u measure-app.service -n 50 --no-pager
```

The service also loads `/home/pi/measure_app/.env` automatically if it exists.

## Disable timer

```sh
cd /home/pi/measure_app
sudo ./uninstall.sh
```

The app directory and SQLite database are not removed.

## Database schema

```sql
CREATE TABLE measurements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    measured_at TEXT NOT NULL,
    temperature_c REAL NOT NULL,
    pressure_hpa REAL NOT NULL,
    humidity_percent REAL NOT NULL,
    status TEXT NOT NULL,
    raw_text TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    supabase_synced_at TEXT,
    supabase_sync_error TEXT,
    supabase_retry_count INTEGER NOT NULL DEFAULT 0
);
```

If an older `measurements` table from the single-value sample app exists, it is renamed to `measurements_legacy` and a new BME280-compatible table is created.

## Supabase table requirements

Create a `measurements` table in Supabase that accepts `id`, `measured_at`, `temperature_c`, `pressure_hpa`, `humidity_percent`, `status`, `raw_text`, and `created_at`. For retry-safe upsert, keep `id` as a primary key or unique key on the Supabase side as well.

The sync flow is:

1. Save the row to local SQLite.
2. Try to upsert all pending unsynced rows to Supabase.
3. On success, store `supabase_synced_at`.
4. On failure, keep the row locally and increment `supabase_retry_count` for the next timer run.
