"""
Groundwater Level Prediction Engine
------------------------------------
Hydrogeologically Optimal Water-Balance Model combining:
1. Live Open-Meteo 7-day precipitation forecasts at high-resolution coordinates
2. Aquifer-specific Rainfall Infiltration Factor (RIF) and Specific Yield (Sy)
3. Seasonal recharge efficiency factors (wet-season infiltration vs. dry crust runoff)
4. Baseline aquifer extraction and baseflow discharge rates derived from 22-year trend slope

Governing Equations:
    R_gross = (RIF * Rainfall_mm / 1000.0) / Sy * eta_season
    D_draft = max(0.02, abs(trend_slope)) * (days / 365.25) * psi_draft
    Delta_h = R_gross - D_draft

Positive Delta_h represents a rising water table (aquifer replenishment).
Negative Delta_h represents net water table decline (seasonal draft exceeding recharge).
"""
from typing import Any, Dict, List, Optional
import datetime
import requests

from backend.app.core.logging import logger
from backend.app.repositories.groundwater_repo import groundwater_repo


# ── Climatological Monthly Precipitation Normals (India Averages in mm) ─────────
_MONTHLY_RAIN_MM = {
    1: 16.0,  # Jan (Winter)
    2: 19.5,  # Feb
    3: 24.0,  # Mar (Pre-Monsoon)
    4: 38.0,  # Apr
    5: 62.0,  # May
    6: 165.0, # Jun (Monsoon onset)
    7: 285.0, # Jul (Peak Monsoon)
    8: 255.0, # Aug
    9: 170.0, # Sep (Withdrawal)
    10: 75.0, # Oct (Post-Monsoon)
    11: 28.0, # Nov
    12: 14.0, # Dec
}

# ── Hydrogeological Rainfall Infiltration Factors (RIF) by Aquifer Lithology ────
_RIF_TABLE = {
    "alluvium": 0.22,
    "sand": 0.22,
    "sandstone": 0.16,
    "semi-consolidated": 0.16,
    "basalt": 0.12,
    "trap": 0.12,
    "deccan": 0.12,
    "limestone": 0.15,
    "karst": 0.15,
    "granite": 0.10,
    "gneiss": 0.10,
    "hard rock": 0.10,
    "quartzite": 0.08,
}

# ── Monthly Seasonal Infiltration Efficiency (eta) ──────────────────────────────
_SEASON_EFFICIENCY = {
    1: 0.60, 2: 0.55, 3: 0.50, 4: 0.55, 5: 0.65,
    6: 1.15, 7: 1.45, 8: 1.50, 9: 1.30, 10: 1.05,
    11: 0.80, 12: 0.65,
}

# ── Monthly Agricultural & Pumping Draft Intensity Factor (psi) ─────────────────
_SEASON_DRAFT = {
    1: 1.30, 2: 1.35, 3: 1.45, 4: 1.50, 5: 1.40,
    6: 0.80, 7: 0.40, 8: 0.40, 9: 0.60, 10: 0.90,
    11: 1.15, 12: 1.25,
}


def _rif(aquifer_type: Optional[str]) -> float:
    aq = str(aquifer_type).lower() if aquifer_type else ""
    for key, val in _RIF_TABLE.items():
        if key in aq:
            return val
    return 0.10


def _mean_monthly_rain(months: List[int]) -> float:
    if not months:
        return 45.0
    return sum(_MONTHLY_RAIN_MM.get(m, 45.0) for m in months) / len(months)


def _months_ahead(n: int) -> List[int]:
    today = datetime.date.today()
    return [(today.month + i - 1) % 12 + 1 for i in range(1, n + 1)]


class PredictionEngine:
    """Predict groundwater level fluctuation (Delta_h in metres) across 6 forecasting horizons."""

    def predict(self, station_code: str) -> Dict[str, Any]:
        well = groundwater_repo.get_well_by_code(station_code)
        if not well:
            return {"error": f"Well {station_code} not found"}

        lat = well.latitude or 20.0
        lon = well.longitude or 78.0
        sy = max(0.005, well.reference_sy or 0.03)
        rif = _rif(well.aquifer_type)
        slope = well.trend_slope_m_per_year if well.trend_slope_m_per_year is not None else -0.05
        # Depletion rate in m/yr (positive depth slope indicates deepening water table)
        annual_depletion_m_yr = max(0.015, abs(slope) if abs(slope) > 0.005 else 0.04)
        today = datetime.date.today()

        # ── 1. Live Weather & 7-Day Rainfall Forecast from Open-Meteo ───────────
        forecast_rain_7d: List[float] = []
        try:
            url = (
                f"https://api.open-meteo.com/v1/forecast?"
                f"latitude={lat}&longitude={lon}&"
                f"daily=precipitation_sum&timezone=auto&forecast_days=7"
            )
            resp = requests.get(url, timeout=7)
            if resp.status_code == 200:
                data = resp.json()
                forecast_rain_7d = [
                    round(float(v or 0), 1)
                    for v in (data.get("daily", {}).get("precipitation_sum") or [])
                ]
        except Exception as exc:
            logger.warning(f"Open-Meteo forecast call failed for {station_code}: {exc}")

        total_7d_mm = sum(forecast_rain_7d) if forecast_rain_7d else (_MONTHLY_RAIN_MM.get(today.month, 30.0) * (7 / 30.4))

        # ── 2. 1-Week Prediction (7-Day Horizon) ─────────────────────────────────
        eta_7d = _SEASON_EFFICIENCY.get(today.month, 1.0)
        psi_7d = _SEASON_DRAFT.get(today.month, 1.0)
        r_gross_7d = (rif * total_7d_mm / 1000.0) / sy * eta_7d
        d_draft_7d = annual_depletion_m_yr * (7.0 / 365.25) * psi_7d
        dh_7d = round(r_gross_7d - d_draft_7d, 3)

        # ── 3. Multi-Month Horizon Predictions (1M, 2M, 3M, 4M, 6M) ──────────────
        def calculate_horizon_dh(n_months: int) -> float:
            target_months = _months_ahead(n_months)
            days = sum(31 if m in (1, 3, 5, 7, 8, 10, 12) else (28 if m == 2 else 30) for m in target_months)

            # Cumulative projected rainfall across target months
            tot_rain_mm = sum(_MONTHLY_RAIN_MM.get(m, 40.0) for m in target_months)
            mean_eta = sum(_SEASON_EFFICIENCY.get(m, 1.0) for m in target_months) / len(target_months)
            mean_psi = sum(_SEASON_DRAFT.get(m, 1.0) for m in target_months) / len(target_months)

            r_gross = (rif * tot_rain_mm / 1000.0) / sy * mean_eta
            d_draft = annual_depletion_m_yr * (days / 365.25) * mean_psi
            return round(r_gross - d_draft, 3)

        predictions = {
            "prediction_week":    dh_7d,
            "prediction_month":   calculate_horizon_dh(1),
            "prediction_2months": calculate_horizon_dh(2),
            "prediction_3months": calculate_horizon_dh(3),
            "prediction_4months": calculate_horizon_dh(4),
            "prediction_6months": calculate_horizon_dh(6),
        }

        # ── 4. Cache in Repository for Session Persistence ───────────────────────
        groundwater_repo.upsert_well_detail(
            station_code,
            forecast_rain_7d=forecast_rain_7d,
            **predictions,
        )

        return {
            "station_code": station_code,
            "station_name": well.station_name,
            "aquifer_type": well.aquifer_type,
            "specific_yield": sy,
            "rainfall_infiltration_factor": rif,
            "forecast_rain_7d_mm": forecast_rain_7d,
            "total_forecast_7d_mm": round(total_7d_mm, 1),
            "current_month": today.month,
            "season_efficiency_factor": eta_7d,
            "annual_baseline_depletion_m_yr": round(annual_depletion_m_yr, 4),
            **predictions,
            "governing_formula": "Delta_h = ((RIF * Rain_mm / 1000) / Sy * eta_season) - (Draft_annual * (days / 365) * psi_draft)",
            "interpretation": "Delta_h > 0 indicates water-table rise; Delta_h < 0 indicates seasonal net extraction decline."
        }


prediction_engine = PredictionEngine()
