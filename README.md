# BME280 Logger

![Project screenshot](https://github.com/hirohitokato/myAssets/blob/main/bme280_logger/screenshot.png?raw=true)

BME280 Logger is a small end-to-end environment monitoring stack built around a Raspberry Pi and a BME280 sensor. It measures temperature, humidity, and pressure on a schedule, stores readings locally in SQLite, syncs them to Supabase, and visualizes them in a Next.js dashboard deployed on Vercel.

## Features

- Scheduled BME280 measurements on Raspberry Pi
- Local-first persistence with SQLite
- Retry-safe sync from Raspberry Pi to Supabase
- Web dashboard for browsing historical sensor data
- Range-based charts for `24h`, `7d`, and `30d`
- Latest reading cards, summary stats, and recent measurement table

## How It Works

The project has two deployable parts:

1. Raspberry Pi collector
   - Reads data from a BME280 sensor over I2C
   - Saves readings to a local SQLite database
   - Retries failed Supabase syncs automatically
2. Web dashboard
   - Runs as a Next.js app
   - Reads measurement data from Supabase on the server side
   - Renders charts and summaries in the browser

End-to-end flow:

```text
BME280 sensor
  -> Raspberry Pi collector
  -> SQLite
  -> Supabase
  -> Vercel dashboard
  -> Browser
```

## What You Get After Deployment

When both parts are deployed, the full system provides:

- Continuous environmental logging from a Raspberry Pi
- Local buffering when the network is unavailable
- Centralized historical storage in Supabase
- A browser-based dashboard with:
  - latest temperature, humidity, and pressure
  - time-series charts
  - min / max / average summaries
  - recent measurement history

## Repository Layout

```text
bme280_logger/
├── app/                    # Python collector modules
│   ├── config.py
│   ├── measurement.py      # BME280 access
│   ├── models.py
│   ├── repository.py       # SQLite persistence and sync state
│   └── supabase.py         # Supabase REST upsert
├── dashboard/              # Next.js dashboard for Vercel
│   ├── app/                # App Router entrypoints
│   ├── components/         # UI components
│   ├── lib/                # types, aggregation, Supabase reads
│   ├── tests/
│   ├── package.json
│   └── vercel.json
├── systemd/                # service and timer units
├── tests/                  # Python tests
├── main.py                 # collector entrypoint
├── install.sh              # systemd install helper
├── uninstall.sh
├── requirements.txt
├── LICENSE.txt
└── README.md
```

## Prerequisites

### Raspberry Pi collector

- Raspberry Pi 5
- BME280 sensor
- I2C enabled
- Python 3

### Cloud services

- A Supabase project for measurement storage
- A Vercel project for the dashboard
- A GitHub repository connected to Vercel

## Quick Start

### Run the collector locally

Enable I2C:

```sh
sudo raspi-config
```

Install system packages:

```sh
sudo apt update
sudo apt install -y python3-venv python3-smbus2 i2c-tools sqlite3
```

Create a virtual environment and install dependencies:

```sh
cd /home/pi/measure_app
python -m venv .venv
./.venv/bin/pip install -r requirements.txt
```

Verify that the sensor is visible. This project expects the BME280 at `0x76`.

```sh
i2cdetect -y 1
```

Take a single reading:

```sh
cd /home/pi/measure_app
python main.py run
```

Show recent locally stored readings:

```sh
python main.py latest --limit 10
```

## Deploy Your Own Copy

### 1. Create a Supabase project

Create a new Supabase project and add a `measurements` table.

Minimum required schema:

```sql
CREATE TABLE measurements (
    id INTEGER PRIMARY KEY,
    measured_at TEXT NOT NULL,
    temperature_c REAL NOT NULL,
    pressure_hpa REAL NOT NULL,
    humidity_percent REAL NOT NULL,
    status TEXT NOT NULL,
    raw_text TEXT,
    created_at TEXT NOT NULL
);
```

Notes:

- The Raspberry Pi collector uses `id` for retry-safe upserts.
- The dashboard reads from Supabase on the server side.
- Do not expose `SUPABASE_SERVICE_ROLE_KEY` to the browser.

### 2. Configure the Raspberry Pi collector

Create a root `.env` file:

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
MEASURE_APP_LOG_PATH=/home/pi/measure_app/logs/measure.log
```

Enable scheduled execution:

```sh
cd /home/pi/measure_app
sudo ./install.sh
```

Check status:

```sh
systemctl status measure-app.timer
systemctl list-timers --all | grep measure-app
journalctl -u measure-app.service -n 50 --no-pager
```

### 3. Deploy the dashboard to Vercel

Push this repository to GitHub, then import it into Vercel.

Use the following Vercel settings:

- Root Directory: `dashboard`
- Framework Preset: `Next.js`
- Output Directory: leave empty

If `public` is set as the Output Directory from a previous static-site configuration, remove it.

Set these environment variables in Vercel:

```dotenv
NEXT_PUBLIC_APP_NAME=BME280 Dashboard
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_TABLE=measurements
```

This repository includes [dashboard/vercel.json](/Users/a3140236/Desktop/bme280_logger/dashboard/vercel.json) so Vercel treats the dashboard as a Next.js app.

### 4. Run the dashboard locally

```sh
cd dashboard
npm install
npm run dev
```

Then open `http://localhost:3000`.

Run tests and a production build:

```sh
cd dashboard
npm test
npm run build
```

## Local Database Schema

The Raspberry Pi collector stores readings locally in SQLite using this schema:

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

Sync behavior:

1. Save every reading to SQLite first.
2. Try to upsert unsynced rows to Supabase.
3. Mark successful rows with `supabase_synced_at`.
4. Keep failed rows locally and increment `supabase_retry_count`.

## Development Notes

- The Python collector keeps measurement, persistence, and cloud sync separated.
- The dashboard uses Next.js App Router.
- Supabase reads happen on the server side only.
- Timestamps are stored in UTC and formatted in the browser's local time zone.

## License

This project is licensed under the MIT License. See [LICENSE.txt](LICENSE.txt).
