# measure_app

Raspberry Pi 5 with BME280 on I2C address `0x76`. The app measures temperature, pressure, and humidity once, then stores the result with timestamp into SQLite3.

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
- `app/repository.py`: SQLite initialization and INSERT only. It does not access I2C.
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
sudo apt install -y python3-smbus2 i2c-tools sqlite3
```

Check the sensor. The expected address is usually `76` for this project.

```sh
i2cdetect -y 1
```

## Manual run

Place this directory at `/home/pi/measure_app`.

```sh
cd /home/pi/measure_app
/usr/bin/python3 main.py run
```

Show latest rows:

```sh
/usr/bin/python3 main.py latest --limit 10
```

Direct SQLite check:

```sh
sqlite3 /home/pi/measure_app/data/measurements.sqlite3 \
"SELECT id, measured_at, temperature_c, pressure_hpa, humidity_percent, status, created_at FROM measurements ORDER BY id DESC LIMIT 10;"
```

## Enable 10 minute interval execution

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
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

If an older `measurements` table from the single-value sample app exists, it is renamed to `measurements_legacy` and a new BME280-compatible table is created.
