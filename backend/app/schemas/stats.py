from typing import Dict, List, Optional
from pydantic import BaseModel

class StatusDistribution(BaseModel):
    safe: int = 0
    semi_critical: int = 0
    critical: int = 0
    over_exploited: int = 0

class OverviewStats(BaseModel):
    total_wells: int
    total_states: int
    total_districts: int
    avg_water_depth_mbgl: float
    min_water_depth_mbgl: float
    max_water_depth_mbgl: float
    avg_annual_recharge_m: float
    avg_specific_yield: float
    status_distribution: StatusDistribution
    latest_quarter: str
    time_span: str

class StateStats(BaseModel):
    state: str
    well_count: int
    avg_depth_mbgl: float
    avg_recharge_m: float
    avg_specific_yield: float
    status_distribution: StatusDistribution
    over_exploited_pct: float

class DistrictStats(BaseModel):
    state: str
    district: str
    well_count: int
    avg_depth_mbgl: float
    avg_recharge_m: float
    status_distribution: StatusDistribution

