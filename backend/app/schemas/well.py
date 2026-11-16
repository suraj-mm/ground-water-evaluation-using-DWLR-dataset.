from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class TimeSeriesPoint(BaseModel):
    quarter: str
    year: int
    season: str
    depth_mbgl: Optional[float] = None


class RechargePoint(BaseModel):
    year: int
    pre_monsoon: Optional[float] = None
    post_monsoon: Optional[float] = None
    delta_h: Optional[float] = None


class GeoJSONGeometry(BaseModel):
    type: str = "Point"
    coordinates: List[float]


class GeoJSONFeature(BaseModel):
    type: str = "Feature"
    geometry: GeoJSONGeometry
    properties: Dict[str, Any] = Field(default_factory=dict)


class WellLookupItem(BaseModel):
    station_code: str
    station_name: str
    state: Optional[str] = None
    district: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    latest_reading: Optional[float] = None
    status: Optional[str] = None
    village: Optional[str] = None
    tehsil: Optional[str] = None
    block: Optional[str] = None


class WellSummary(BaseModel):
    station_code: str
    station_name: str
    state: Optional[str] = None
    district: Optional[str] = None
    tehsil: Optional[str] = None
    block: Optional[str] = None
    village: Optional[str] = None
    status: Optional[str] = None
    latest_reading: Optional[float] = None
    latest_depth: Optional[float] = None           # alias used by some frontend calls
    latest_quarter: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    well_depth: Optional[float] = None
    aquifer_type: Optional[str] = None
    reference_sy: Optional[float] = None
    trend_slope_m_per_year: Optional[float] = None
    annual_recharge_delta_h: Optional[float] = None


class WellDetail(BaseModel):
    # Core identity
    station_code: str
    station_name: str
    state: Optional[str] = None
    district: Optional[str] = None
    tehsil: Optional[str] = None
    block: Optional[str] = None
    village: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    # Hydrogeology
    aquifer_type: Optional[str] = None
    well_depth: Optional[float] = None
    reference_sy: Optional[float] = None
    # Status & metrics
    status: Optional[str] = None
    latest_reading: Optional[float] = None
    latest_depth: Optional[float] = None
    latest_quarter: Optional[str] = None
    trend_slope_m_per_year: Optional[float] = None
    annual_recharge_delta_h: Optional[float] = None
    # Historical data
    time_series: List[TimeSeriesPoint] = Field(default_factory=list)
    seasonal_averages: Dict[str, Optional[float]] = Field(default_factory=dict)
    recharge_history: List[RechargePoint] = Field(default_factory=list)
    depth_series: List[float] = Field(default_factory=list)
    # Water quality
    ph: Optional[float] = None
    ph_status: Optional[str] = None          # "Drinkable" | "Marginal" | "Unsuitable"
    ph_agriculture: Optional[str] = None     # "Suitable" | "Moderate" | "Unsuitable"
    # Weather forecast (next 7 days rainfall mm per day)
    forecast_rain_7d: List[float] = Field(default_factory=list)
    # Groundwater level predictions (Δh metres — positive = rising water table)
    prediction_week: Optional[float] = None
    prediction_month: Optional[float] = None
    prediction_2months: Optional[float] = None
    prediction_3months: Optional[float] = None
    prediction_4months: Optional[float] = None
    prediction_6months: Optional[float] = None


class WellGeoJSONCollection(BaseModel):
    type: str = "FeatureCollection"
    features: List[Dict[str, Any]] = Field(default_factory=list)
