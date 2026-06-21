from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
import time
from typing import Callable

from app.models import MeasurementResult


class MeasurementError(Exception):
    """Raised when BME280 measurement fails."""


@dataclass
class BME280Reader:
    """BME280 reader using I2C via smbus2.

    This module is responsible only for measurement. It does not know anything
    about SQLite or persistence.
    """

    bus_number: int = 1
    i2c_address: int = 0x76
    _bus: object | None = field(default=None, init=False, repr=False)
    _dig_t: list[int] = field(default_factory=list, init=False, repr=False)
    _dig_p: list[int] = field(default_factory=list, init=False, repr=False)
    _dig_h: list[int] = field(default_factory=list, init=False, repr=False)
    _t_fine: float = field(default=0.0, init=False, repr=False)

    def __enter__(self) -> BME280Reader:
        self.open()
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        self.close()

    def open(self) -> None:
        if self._bus is not None:
            return

        try:
            from smbus2 import SMBus
        except ImportError as exc:
            raise MeasurementError(
                "smbus2 is not installed. Install it on Raspberry Pi with: "
                "sudo apt install -y python3-smbus2"
            ) from exc

        self._bus = SMBus(self.bus_number)
        self._setup()
        self._read_calibration_parameters()

    def close(self) -> None:
        if self._bus is not None:
            close = getattr(self._bus, "close", None)
            if callable(close):
                close()
            self._bus = None

    def read(self) -> tuple[float, float, float]:
        """Return temperature C, pressure hPa, humidity percent."""

        self.open()
        assert self._bus is not None

        data = self._bus.read_i2c_block_data(self.i2c_address, 0xF7, 8)
        pres_raw = (data[0] << 12) | (data[1] << 4) | (data[2] >> 4)
        temp_raw = (data[3] << 12) | (data[4] << 4) | (data[5] >> 4)
        hum_raw = (data[6] << 8) | data[7]

        temperature_c = self._compensate_temperature(temp_raw)
        pressure_hpa = self._compensate_pressure(pres_raw)
        humidity_percent = self._compensate_humidity(hum_raw)

        return temperature_c, pressure_hpa, humidity_percent

    def _write_reg(self, reg_address: int, data: int) -> None:
        assert self._bus is not None
        self._bus.write_byte_data(self.i2c_address, reg_address, data)

    def _setup(self) -> None:
        osrs_t = 1       # Temperature oversampling x 1
        osrs_p = 1       # Pressure oversampling x 1
        osrs_h = 1       # Humidity oversampling x 1
        mode = 3         # Normal mode
        t_sb = 5         # Standby time 1000 ms
        iir_filter = 0   # Filter off
        spi3w_en = 0     # 3-wire SPI disable

        ctrl_meas_reg = (osrs_t << 5) | (osrs_p << 2) | mode
        config_reg = (t_sb << 5) | (iir_filter << 2) | spi3w_en
        ctrl_hum_reg = osrs_h

        self._write_reg(0xF2, ctrl_hum_reg)
        self._write_reg(0xF4, ctrl_meas_reg)
        self._write_reg(0xF5, config_reg)

    def _read_calibration_parameters(self) -> None:
        assert self._bus is not None

        calib: list[int] = []
        for addr in range(0x88, 0x88 + 24):
            calib.append(self._bus.read_byte_data(self.i2c_address, addr))
        calib.append(self._bus.read_byte_data(self.i2c_address, 0xA1))
        for addr in range(0xE1, 0xE1 + 7):
            calib.append(self._bus.read_byte_data(self.i2c_address, addr))

        self._dig_t = [
            self._u16(calib[1], calib[0]),
            self._s16(calib[3], calib[2]),
            self._s16(calib[5], calib[4]),
        ]

        self._dig_p = [
            self._u16(calib[7], calib[6]),
            self._s16(calib[9], calib[8]),
            self._s16(calib[11], calib[10]),
            self._s16(calib[13], calib[12]),
            self._s16(calib[15], calib[14]),
            self._s16(calib[17], calib[16]),
            self._s16(calib[19], calib[18]),
            self._s16(calib[21], calib[20]),
            self._s16(calib[23], calib[22]),
        ]

        h4 = (calib[28] << 4) | (calib[29] & 0x0F)
        h5 = (calib[30] << 4) | ((calib[29] >> 4) & 0x0F)

        self._dig_h = [
            calib[24],
            self._s16(calib[26], calib[25]),
            calib[27],
            self._s12(h4),
            self._s12(h5),
            self._s8(calib[31]),
        ]

    @staticmethod
    def _u16(msb: int, lsb: int) -> int:
        return (msb << 8) | lsb

    @classmethod
    def _s16(cls, msb: int, lsb: int) -> int:
        value = cls._u16(msb, lsb)
        if value & 0x8000:
            value -= 0x10000
        return value

    @staticmethod
    def _s12(value: int) -> int:
        if value & 0x800:
            value -= 0x1000
        return value

    @staticmethod
    def _s8(value: int) -> int:
        if value & 0x80:
            value -= 0x100
        return value

    def _compensate_temperature(self, adc_t: int) -> float:
        var1 = (adc_t / 16384.0 - self._dig_t[0] / 1024.0) * self._dig_t[1]
        var2 = (
            (adc_t / 131072.0 - self._dig_t[0] / 8192.0)
            * (adc_t / 131072.0 - self._dig_t[0] / 8192.0)
            * self._dig_t[2]
        )
        self._t_fine = var1 + var2
        return self._t_fine / 5120.0

    def _compensate_pressure(self, adc_p: int) -> float:
        var1 = (self._t_fine / 2.0) - 64000.0
        var2 = (((var1 / 4.0) * (var1 / 4.0)) / 2048.0) * self._dig_p[5]
        var2 = var2 + ((var1 * self._dig_p[4]) * 2.0)
        var2 = (var2 / 4.0) + (self._dig_p[3] * 65536.0)
        var1 = (
            ((self._dig_p[2] * (((var1 / 4.0) * (var1 / 4.0)) / 8192.0)) / 8.0)
            + ((self._dig_p[1] * var1) / 2.0)
        ) / 262144.0
        var1 = ((32768.0 + var1) * self._dig_p[0]) / 32768.0

        if var1 == 0:
            raise MeasurementError("invalid pressure calibration: division by zero")

        pressure = ((1048576.0 - adc_p) - (var2 / 4096.0)) * 3125.0
        if pressure < 0x80000000:
            pressure = (pressure * 2.0) / var1
        else:
            pressure = (pressure / var1) * 2.0

        var1 = (self._dig_p[8] * (((pressure / 8.0) * (pressure / 8.0)) / 8192.0)) / 4096.0
        var2 = ((pressure / 4.0) * self._dig_p[7]) / 8192.0
        pressure = pressure + ((var1 + var2 + self._dig_p[6]) / 16.0)

        return pressure / 100.0

    def _compensate_humidity(self, adc_h: int) -> float:
        var_h = self._t_fine - 76800.0
        if var_h == 0:
            raise MeasurementError("invalid humidity calibration: division by zero")

        var_h = (
            adc_h
            - (self._dig_h[3] * 64.0 + self._dig_h[4] / 16384.0 * var_h)
        ) * (
            self._dig_h[1]
            / 65536.0
            * (1.0 + self._dig_h[5] / 67108864.0 * var_h * (1.0 + self._dig_h[2] / 67108864.0 * var_h))
        )
        var_h = var_h * (1.0 - self._dig_h[0] * var_h / 524288.0)

        if var_h > 100.0:
            var_h = 100.0
        elif var_h < 0.0:
            var_h = 0.0

        return var_h


def read_single_measurement() -> tuple[datetime, float, float, float]:
    """Read the sensor once and return timestamped raw values."""
    try:
        with BME280Reader(bus_number=1, i2c_address=0x76) as reader:
            temperature_c, pressure_hpa, humidity_percent = reader.read()
        measured_at = datetime.now(timezone.utc).astimezone()
        return measured_at, temperature_c, pressure_hpa, humidity_percent
    except Exception as exc:
        if isinstance(exc, MeasurementError):
            raise
        raise MeasurementError(f"BME280 measurement failed: {exc}") from exc


def measure_once() -> MeasurementResult:
    """Measure once and return a domain object for persistence."""

    measured_at, temperature_c, pressure_hpa, humidity_percent = read_single_measurement()
    return MeasurementResult(
        measured_at=measured_at,
        temperature_c=round(temperature_c, 2),
        pressure_hpa=round(pressure_hpa, 2),
        humidity_percent=round(humidity_percent, 2),
        status="ok",
        raw_text=None,
    )


def measure_average(
    *,
    sample_count: int = 10,
    interval_seconds: float = 5.0,
    read_func: Callable[[], tuple[datetime, float, float, float]] | None = None,
    sleep_func: Callable[[float], None] | None = None,
) -> MeasurementResult:
    """Measure multiple times and return one averaged record."""

    if sample_count <= 0:
        raise ValueError("sample_count must be greater than zero")

    reader = read_func or read_single_measurement
    sleeper = sleep_func or time.sleep
    samples: list[tuple[datetime, float, float, float]] = []

    for index in range(sample_count):
        samples.append(reader())
        if index < sample_count - 1:
            sleeper(interval_seconds)

    measured_at = samples[-1][0]
    temperature_c = sum(sample[1] for sample in samples) / sample_count
    pressure_hpa = sum(sample[2] for sample in samples) / sample_count
    humidity_percent = sum(sample[3] for sample in samples) / sample_count

    return MeasurementResult(
        measured_at=measured_at,
        temperature_c=round(temperature_c, 2),
        pressure_hpa=round(pressure_hpa, 2),
        humidity_percent=round(humidity_percent, 2),
        status="ok",
        raw_text=None,
    )
