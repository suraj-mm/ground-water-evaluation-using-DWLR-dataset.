from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field

class RechargeCalculationRequest(BaseModel):
    area_sq_km: float = Field(..., gt=0, description="Assessment unit area in square kilometers")
    specific_yield: float = Field(..., gt=0, le=0.5, description="Specific yield (dimensionless, e.g. 0.02 - 0.20)")
    delta_h_meters: float = Field(..., description="Water table rise between pre- and post-monsoon (meters)")

class RechargeCalculationResponse(BaseModel):
    area_sq_km: float
    specific_yield: float
    delta_h_meters: float
    recharge_volume_ham: float = Field(..., description="Recharge volume in Hectare-Meters (ham)")
    recharge_volume_mcm: float = Field(..., description="Recharge volume in Million Cubic Meters (mcm)")
    recharge_depth_mm: float = Field(..., description="Equivalent recharge water column in mm")
    formula: str
    methodology: str
    interpretation: str

class RiskAssessmentRequest(BaseModel):
    station_code: Optional[str] = None
    custom_depth_mbgl: Optional[float] = Field(None, ge=0)
    custom_trend_slope: Optional[float] = Field(None, description="Water depth change per year in meters (+ means deepening/depletion)")
    custom_recharge_delta_h: Optional[float] = Field(None, description="Annual monsoon recharge in meters")

class RiskAssessmentResponse(BaseModel):
    station_code: Optional[str] = None
    station_name: Optional[str] = None
    category: str = Field(..., description="Safe, Semi-Critical, Critical, Over-Exploited")
    risk_score: float = Field(..., ge=0, le=100)
    color_code: str
    recommendations: List[str]
    factors: Dict[str, Any]

