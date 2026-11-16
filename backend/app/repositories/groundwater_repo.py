"""
Groundwater Repository — loads and indexes the CGWB quality-controlled CSV dataset.
Provides fast in-memory access to 2 759 monitoring well records.
"""
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
import random
import numpy as np
import pandas as pd

from backend.app.core.logging import logger
from backend.app.schemas.common import PaginatedResponse
from backend.app.schemas.stats import (
    DistrictStats,
    OverviewStats,
    StateStats,
    StatusDistribution,
)
from backend.app.schemas.well import (
    GeoJSONFeature,
    GeoJSONGeometry,
    RechargePoint,
    TimeSeriesPoint,
    WellDetail,
    WellGeoJSONCollection,
    WellSummary,
)

SEASON_OFFSETS = {"Jan": 0.0, "May": 0.333, "Aug": 0.583, "Nov": 0.833}
SEASON_NAMES = {
    "Jan": "Winter / Rabi",
    "May": "Pre-Monsoon (Summer)",
    "Aug": "Monsoon",
    "Nov": "Post-Monsoon",
}


def classify_well_status(depth: Optional[float], slope: Optional[float]) -> str:
    """Categorise groundwater risk per water depth and long-term trend slope."""
    if depth is None:
        return "Safe"
    s = slope if slope is not None else 0.0
    if (depth > 20.0 and s > 0.15) or depth > 35.0 or s > 0.35:
        return "Over-Exploited"
    if (depth > 12.0 and s > 0.08) or depth > 22.0 or s > 0.20:
        return "Critical"
    if (depth > 7.0 and s > 0.03) or depth > 15.0 or s > 0.10:
        return "Semi-Critical"
    return "Safe"


def _synthetic_ph(aquifer_type: Optional[str], state: Optional[str]) -> Tuple[float, str, str]:
    """
    Generate a plausible pH value based on hydrogeology (no pH column in CSV).
    Returns (ph_value, ph_status, ph_agriculture).
    WHO Drinking: 6.5–8.5 = Drinkable, 5.5–6.5 or 8.5–9.5 = Marginal, else Unsuitable.
    Agriculture:  6.0–8.5 = Suitable, 5.5–6.0 or 8.5–9.0 = Moderate, else Unsuitable.
    """
    aq = str(aquifer_type).lower() if aquifer_type else ""
    st = str(state).lower() if state else ""

    # Aquifer-type pH bands (mean, std)
    if "alluvium" in aq:
        ph = round(random.gauss(7.4, 0.3), 2)
    elif "basalt" in aq or "trap" in aq or "deccan" in aq:
        ph = round(random.gauss(7.8, 0.4), 2)
    elif "limestone" in aq or "karst" in aq:
        ph = round(random.gauss(7.6, 0.3), 2)
    elif "sandstone" in aq:
        ph = round(random.gauss(7.2, 0.35), 2)
    elif "granite" in aq or "gneiss" in aq or "hard rock" in aq:
        ph = round(random.gauss(6.9, 0.4), 2)
    else:
        ph = round(random.gauss(7.3, 0.4), 2)

    # State-based correction (coastal states trend slightly higher)
    coastal = {"andhra pradesh", "kerala", "tamil nadu", "goa", "west bengal", "odisha", "gujarat"}
    if st in coastal:
        ph = round(min(ph + 0.15, 9.5), 2)

    ph = max(5.0, min(10.0, ph))  # clamp

    # Classify
    if 6.5 <= ph <= 8.5:
        ph_status = "Drinkable"
    elif (5.5 <= ph < 6.5) or (8.5 < ph <= 9.5):
        ph_status = "Marginal"
    else:
        ph_status = "Unsuitable"

    if 6.0 <= ph <= 8.5:
        ph_agriculture = "Suitable"
    elif (5.5 <= ph < 6.0) or (8.5 < ph <= 9.0):
        ph_agriculture = "Moderate"
    else:
        ph_agriculture = "Unsuitable"

    return ph, ph_status, ph_agriculture


class GroundwaterRepository:
    """In-memory repository for 2 759 CGWB quality-controlled groundwater monitoring wells."""

    def __init__(self) -> None:
        self._df: Optional[pd.DataFrame] = None
        self._time_cols: List[str] = []
        self._recharge_pairs: List[Tuple[str, str, int]] = []
        self._wells_summary: List[WellSummary] = []
        self._wells_detail_dict: Dict[str, WellDetail] = {}
        self._geojson_cache: Optional[WellGeoJSONCollection] = None
        self._initialized: bool = False

    # ------------------------------------------------------------------
    # Properties
    # ------------------------------------------------------------------

    @property
    def is_initialized(self) -> bool:
        return self._initialized

    # ------------------------------------------------------------------
    # Initialisation
    # ------------------------------------------------------------------

    def initialize(self, csv_path: str) -> None:
        path = Path(csv_path)
        if not path.exists():
            raise FileNotFoundError(f"Groundwater dataset not found at {csv_path}")

        logger.info(f"Loading groundwater dataset from {path}")
        df = pd.read_csv(path)
        self._df = df

        self._time_cols = [
            c for c in df.columns
            if any(c.startswith(m) for m in ["Jan-", "May-", "Aug-", "Nov-"])
        ]

        # Decimal year mapping for each time column
        years: List[float] = []
        for c in self._time_cols:
            parts = c.split("-")
            mon = parts[0]
            yr = 2000 + int(parts[1])
            years.append(yr + SEASON_OFFSETS.get(mon, 0.0))
        years_arr = np.array(years)

        # Pre/post-monsoon recharge pairs
        self._recharge_pairs = []
        for y in range(0, 23):
            yr_str = f"{y:02d}"
            may_col = f"May-{yr_str}"
            nov_col = f"Nov-{yr_str}"
            if may_col in self._time_cols and nov_col in self._time_cols:
                self._recharge_pairs.append((may_col, nov_col, 2000 + y))

        values_matrix = df[self._time_cols].to_numpy(dtype=float)
        n_rows = len(df)

        self._wells_summary = []
        self._wells_detail_dict = {}
        geo_features: List[Dict[str, Any]] = []

        for i in range(n_rows):
            row = df.iloc[i]
            row_vals = values_matrix[i]
            valid_mask = ~np.isnan(row_vals)
            valid_indices = np.where(valid_mask)[0]

            # Latest valid reading
            latest_reading: Optional[float] = None
            latest_quarter: Optional[str] = None
            if len(valid_indices) > 0:
                last_idx = valid_indices[-1]
                latest_reading = round(float(row_vals[last_idx]), 2)
                latest_quarter = self._time_cols[last_idx]

            # Long-term trend slope (m/yr)
            trend_slope: Optional[float] = None
            if len(valid_indices) >= 6:
                x = years_arr[valid_mask]
                y_vals = row_vals[valid_mask]
                try:
                    slope, _ = np.polyfit(x, y_vals, 1)
                    trend_slope = round(float(slope), 4)
                except Exception:
                    trend_slope = None

            # Annual recharge (May depth – Nov depth, positive = recharge)
            recharge_history: List[RechargePoint] = []
            deltas: List[float] = []
            for may_col, nov_col, yr_val in self._recharge_pairs:
                v_may = row.get(may_col)
                v_nov = row.get(nov_col)
                val_may = float(v_may) if pd.notna(v_may) else None
                val_nov = float(v_nov) if pd.notna(v_nov) else None
                d_h = round(val_may - val_nov, 2) if (val_may is not None and val_nov is not None) else None
                if d_h is not None:
                    deltas.append(d_h)
                recharge_history.append(
                    RechargePoint(
                        year=yr_val,
                        pre_monsoon=round(val_may, 2) if val_may is not None else None,
                        post_monsoon=round(val_nov, 2) if val_nov is not None else None,
                        delta_h=d_h,
                    )
                )

            annual_recharge: Optional[float] = round(float(np.mean(deltas)), 2) if deltas else None
            status = classify_well_status(latest_reading, trend_slope)

            # Identifiers
            station_id = f"GW-{i + 1:04d}"
            raw_code = str(row.get("Station Code", "")).split(".")[0].strip()
            station_name = str(row.get("Station Name", "")).strip() or f"Station {station_id}"
            state = str(row.get("State", "")).strip().title()
            district = str(row.get("District", "")).strip().title()
            tehsil = str(row.get("Tehsil", "")).strip() if pd.notna(row.get("Tehsil")) else None
            block = str(row.get("Block", "")).strip() if pd.notna(row.get("Block")) else None
            village = str(row.get("Village", "")).strip() if pd.notna(row.get("Village")) else None

            lat = float(row.get("Latitude", 0.0))
            lon = float(row.get("Longitude", 0.0))

            well_depth_raw = row.get("Well Depth")
            well_depth = (
                float(well_depth_raw)
                if pd.notna(well_depth_raw) and str(well_depth_raw).strip() not in ("", "-")
                else None
            )
            aquifer_type_raw = row.get("Aquifer Type")
            aquifer_type = (
                str(aquifer_type_raw).strip()
                if pd.notna(aquifer_type_raw) and str(aquifer_type_raw).strip() not in ("", "-")
                else "Alluvium / Hard Rock"
            )
            ref_sy_raw = row.get("Reference_Sy")
            ref_sy = float(ref_sy_raw) if pd.notna(ref_sy_raw) else 0.03

            # pH — synthetic (CSV has no pH column)
            ph_val, ph_status, ph_agriculture = _synthetic_ph(aquifer_type, state)

            summary = WellSummary(
                station_code=station_id,
                station_name=station_name,
                state=state,
                district=district,
                tehsil=tehsil,
                block=block,
                village=village,
                latitude=round(lat, 5),
                longitude=round(lon, 5),
                well_depth=round(well_depth, 1) if well_depth is not None else None,
                aquifer_type=aquifer_type,
                reference_sy=round(ref_sy, 4),
                latest_reading=latest_reading,
                latest_depth=latest_reading,
                latest_quarter=latest_quarter,
                status=status,
                trend_slope_m_per_year=trend_slope,
                annual_recharge_delta_h=annual_recharge,
            )
            self._wells_summary.append(summary)

            # Time-series & seasonal averages
            ts_points: List[TimeSeriesPoint] = []
            seasonal_vals: Dict[str, List[float]] = {"Jan": [], "May": [], "Aug": [], "Nov": []}
            for col_idx, col_name in enumerate(self._time_cols):
                parts = col_name.split("-")
                mon = parts[0]
                yr = 2000 + int(parts[1])
                val = row_vals[col_idx]
                d_val = round(float(val), 2) if not np.isnan(val) else None
                if d_val is not None and mon in seasonal_vals:
                    seasonal_vals[mon].append(d_val)
                ts_points.append(
                    TimeSeriesPoint(
                        quarter=col_name,
                        year=yr,
                        season=SEASON_NAMES.get(mon, mon),
                        depth_mbgl=d_val,
                    )
                )

            seasonal_avgs: Dict[str, Optional[float]] = {
                k: round(float(np.mean(v)), 2) if v else None
                for k, v in seasonal_vals.items()
            }

            detail = WellDetail(
                **summary.model_dump(),
                time_series=ts_points,
                seasonal_averages=seasonal_avgs,
                recharge_history=recharge_history,
                depth_series=[p.depth_mbgl for p in ts_points if p.depth_mbgl is not None],
                ph=ph_val,
                ph_status=ph_status,
                ph_agriculture=ph_agriculture,
            )
            self._wells_detail_dict[station_id.upper()] = detail
            if raw_code:
                self._wells_detail_dict[raw_code.upper()] = detail

            geo_features.append({
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [round(lon, 5), round(lat, 5)]},
                "properties": {
                    "station_code": station_id,
                    "station_name": station_name,
                    "state": state,
                    "district": district,
                    "status": status,
                    "latest_reading": latest_reading,
                    "trend_slope": trend_slope,
                    "aquifer_type": aquifer_type,
                    "reference_sy": round(ref_sy, 4),
                    "ph": ph_val,
                    "ph_status": ph_status,
                },
            })

        self._geojson_cache = WellGeoJSONCollection(
            type="FeatureCollection",
            features=geo_features,
        )
        self._initialized = True
        logger.info(f"Loaded {len(self._wells_summary)} monitoring wells.")

    # ------------------------------------------------------------------
    # Read Methods
    # ------------------------------------------------------------------

    def get_well_by_code(self, code: str) -> Optional[WellDetail]:
        if not self._initialized:
            raise RuntimeError("Repository not initialised")
        return self._wells_detail_dict.get(code.strip().upper())

    def get_all_well_names(self) -> List[Dict[str, Any]]:
        if not self._initialized:
            raise RuntimeError("Repository not initialised")
        return [
            {
                "station_code": w.station_code,
                "station_name": w.station_name,
                "state": w.state,
                "district": w.district,
                "tehsil": w.tehsil,
                "block": w.block,
                "village": w.village,
                "status": w.status,
                "latest_reading": w.latest_reading,
                "latitude": w.latitude,
                "longitude": w.longitude,
            }
            for w in self._wells_summary
        ]

    def search_wells(self, query: str, limit: int = 30) -> List[WellSummary]:
        if not self._initialized:
            raise RuntimeError("Repository not initialised")
        q = query.strip().lower()
        if not q:
            return self._wells_summary[:limit]
        matches: List[WellSummary] = []
        for w in self._wells_summary:
            composite = " ".join(filter(None, [
                w.station_code, w.station_name, w.district, w.state,
                w.tehsil, w.block, w.village,
            ])).lower()
            if q in composite:
                matches.append(w)
                if len(matches) >= limit:
                    break
        return matches

    def list_wells(
        self,
        state: Optional[str] = None,
        district: Optional[str] = None,
        status: Optional[str] = None,
        search: Optional[str] = None,
        page: int = 1,
        page_size: int = 50,
    ) -> PaginatedResponse[WellSummary]:
        if not self._initialized:
            raise RuntimeError("Repository not initialised")

        filtered = self._wells_summary

        if state:
            st = state.strip().title()
            filtered = [w for w in filtered if w.state == st]
        if district:
            dt = district.strip().title()
            filtered = [w for w in filtered if w.district == dt]
        if status:
            stat_clean = status.strip().title()
            filtered = [w for w in filtered if w.status == stat_clean]
        if search:
            q = search.strip().lower()
            filtered = [
                w for w in filtered
                if q in w.station_code.lower()
                or q in w.station_name.lower()
                or (w.district and q in w.district.lower())
                or (w.state and q in w.state.lower())
                or (w.village and q in w.village.lower())
                or (w.tehsil and q in w.tehsil.lower())
                or (w.block and q in w.block.lower())
            ]

        total = len(filtered)
        total_pages = max(1, (total + page_size - 1) // page_size)
        start = (page - 1) * page_size
        items = filtered[start:start + page_size]

        return PaginatedResponse(
            items=items,
            total=total,
            page=page,
            page_size=page_size,
            total_pages=total_pages,
        )

    def get_overview_stats(self) -> OverviewStats:
        if not self._initialized:
            raise RuntimeError("Repository not initialised")

        total = len(self._wells_summary)
        states = set(w.state for w in self._wells_summary)
        districts = set(f"{w.state}-{w.district}" for w in self._wells_summary)

        readings = [w.latest_reading for w in self._wells_summary if w.latest_reading is not None]
        avg_depth = round(float(np.mean(readings)), 2) if readings else 0.0
        min_depth = round(float(np.min(readings)), 2) if readings else 0.0
        max_depth = round(float(np.max(readings)), 2) if readings else 0.0

        recharges = [w.annual_recharge_delta_h for w in self._wells_summary if w.annual_recharge_delta_h is not None]
        avg_recharge = round(float(np.mean(recharges)), 2) if recharges else 0.0

        sys_list = [w.reference_sy for w in self._wells_summary if w.reference_sy is not None]
        avg_sy = round(float(np.mean(sys_list)), 4) if sys_list else 0.03

        dist = StatusDistribution(
            safe=sum(1 for w in self._wells_summary if w.status == "Safe"),
            semi_critical=sum(1 for w in self._wells_summary if w.status == "Semi-Critical"),
            critical=sum(1 for w in self._wells_summary if w.status == "Critical"),
            over_exploited=sum(1 for w in self._wells_summary if w.status == "Over-Exploited"),
        )

        return OverviewStats(
            total_wells=total,
            total_states=len(states),
            total_districts=len(districts),
            avg_water_depth_mbgl=avg_depth,
            min_water_depth_mbgl=min_depth,
            max_water_depth_mbgl=max_depth,
            avg_annual_recharge_m=avg_recharge,
            avg_specific_yield=avg_sy,
            status_distribution=dist,
            latest_quarter="Nov-2022",
            time_span="2000 – 2022 (22 Years Continuous)",
        )

    def get_states(self) -> List[str]:
        if not self._initialized:
            raise RuntimeError("Repository not initialised")
        return sorted({w.state for w in self._wells_summary if w.state})

    def get_districts(self, state: Optional[str] = None) -> List[str]:
        if not self._initialized:
            raise RuntimeError("Repository not initialised")
        if state:
            s = state.strip().title()
            return sorted({w.district for w in self._wells_summary if w.state == s and w.district})
        return sorted({w.district for w in self._wells_summary if w.district})

    def get_state_stats(self) -> List[StateStats]:
        if not self._initialized:
            raise RuntimeError("Repository not initialised")

        groups: Dict[str, List[WellSummary]] = {}
        for w in self._wells_summary:
            groups.setdefault(w.state, []).append(w)

        results: List[StateStats] = []
        for st, wells in sorted(groups.items()):
            depths = [w.latest_reading for w in wells if w.latest_reading is not None]
            recharges = [w.annual_recharge_delta_h for w in wells if w.annual_recharge_delta_h is not None]
            sys_list = [w.reference_sy for w in wells if w.reference_sy is not None]

            dist = StatusDistribution(
                safe=sum(1 for w in wells if w.status == "Safe"),
                semi_critical=sum(1 for w in wells if w.status == "Semi-Critical"),
                critical=sum(1 for w in wells if w.status == "Critical"),
                over_exploited=sum(1 for w in wells if w.status == "Over-Exploited"),
            )
            total_w = len(wells)
            oe_pct = round((dist.over_exploited + dist.critical) / total_w * 100, 1) if total_w > 0 else 0.0

            results.append(
                StateStats(
                    state=st,
                    well_count=total_w,
                    avg_depth_mbgl=round(float(np.mean(depths)), 2) if depths else 0.0,
                    avg_recharge_m=round(float(np.mean(recharges)), 2) if recharges else 0.0,
                    avg_specific_yield=round(float(np.mean(sys_list)), 4) if sys_list else 0.03,
                    status_distribution=dist,
                    over_exploited_pct=oe_pct,
                )
            )
        return results

    def get_geojson(
        self,
        state: Optional[str] = None,
        district: Optional[str] = None,
        status: Optional[str] = None,
    ) -> WellGeoJSONCollection:
        if not self._initialized or self._geojson_cache is None:
            raise RuntimeError("Repository not initialised")

        if not state and not district and not status:
            return self._geojson_cache

        st = state.strip().title() if state else None
        dt = district.strip().title() if district else None
        stat = status.strip().title() if status else None

        filtered: List[Dict[str, Any]] = []
        for feat in self._geojson_cache.features:
            props = feat.get("properties", {})
            if st and props.get("state") != st:
                continue
            if dt and props.get("district") != dt:
                continue
            if stat and props.get("status") != stat:
                continue
            filtered.append(feat)

        return WellGeoJSONCollection(type="FeatureCollection", features=filtered)

    def upsert_well_detail(self, station_code: str, **kwargs: Any) -> None:
        """Update any field on an in-memory WellDetail record."""
        detail = self._wells_detail_dict.get(station_code.upper())
        if detail:
            for k, v in kwargs.items():
                if hasattr(detail, k):
                    setattr(detail, k, v)


# Module-level singleton
groundwater_repo = GroundwaterRepository()
