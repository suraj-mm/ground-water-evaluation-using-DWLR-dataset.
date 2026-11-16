from typing import Any, Dict, List, Optional
from backend.app.core.errors import BadRequestError, NotFoundError
from backend.app.repositories.groundwater_repo import groundwater_repo, classify_well_status
from backend.app.schemas.evaluation import (
    RechargeCalculationRequest,
    RechargeCalculationResponse,
    RiskAssessmentRequest,
    RiskAssessmentResponse,
)

class EvaluationService:
    def __init__(self, repo=groundwater_repo):
        self.repo = repo

    def calculate_recharge(
        self, req: RechargeCalculationRequest
    ) -> RechargeCalculationResponse:
        """
        Calculate dynamic groundwater recharge using CGWB Groundwater Estimation Committee (GEC)
        Water Level Fluctuation (WLF) method:
        Recharge Volume (ham) = Area (ha) * Delta_h (m) * Specific Yield (Sy)
        1 sq km = 100 hectares
        Recharge Volume (MCM) = Volume (ham) / 100 = Area (sq km) * Delta_h * Sy
        """
        if req.area_sq_km <= 0:
            raise BadRequestError("Assessment area must be greater than 0 sq km")

        area_ha = req.area_sq_km * 100.0
        recharge_ham = area_ha * req.delta_h_meters * req.specific_yield
        recharge_mcm = req.area_sq_km * req.delta_h_meters * req.specific_yield
        recharge_mm = req.delta_h_meters * req.specific_yield * 1000.0

        if req.delta_h_meters >= 4.0:
            interp = "High monsoon recharge potential. Substantial aquifer replenishment observed."
        elif req.delta_h_meters >= 2.0:
            interp = "Moderate monsoon recharge. Aquifer replenishment is within normal seasonal bounds."
        elif req.delta_h_meters > 0:
            interp = "Low monsoon recharge. Potential storage limitation or below-average precipitation."
        else:
            interp = "Negative fluctuation. Groundwater level continued to decline post-monsoon; high stress."

        return RechargeCalculationResponse(
            area_sq_km=req.area_sq_km,
            specific_yield=req.specific_yield,
            delta_h_meters=req.delta_h_meters,
            recharge_volume_ham=round(recharge_ham, 2),
            recharge_volume_mcm=round(recharge_mcm, 4),
            recharge_depth_mm=round(recharge_mm, 2),
            formula="Dynamic Recharge Volume = Area (ha) * Water Level Fluctuation (m) * Specific Yield",
            methodology="CGWB / GEC-2015 Water Level Fluctuation (WLF) Standard Model",
            interpretation=interp,
        )

    def assess_risk(self, req: RiskAssessmentRequest) -> RiskAssessmentResponse:
        station_name: Optional[str] = None
        depth = req.custom_depth_mbgl
        slope = req.custom_trend_slope
        recharge = req.custom_recharge_delta_h

        # If station code is provided, fetch its real parameters
        if req.station_code:
            well = self.repo.get_well_by_code(req.station_code)
            if not well:
                raise NotFoundError(f"Station '{req.station_code}' not found")
            station_name = well.station_name
            if depth is None:
                depth = well.latest_reading
            if slope is None:
                slope = well.trend_slope_m_per_year
            if recharge is None:
                recharge = well.annual_recharge_delta_h

        if depth is None:
            depth = 5.0
        if slope is None:
            slope = 0.0
        if recharge is None:
            recharge = 2.5

        # Compute continuous risk score from 0 to 100
        # Depth score: 0-40 mbgl maps to 0-40 points
        depth_score = min(40.0, max(0.0, (depth / 40.0) * 40.0))
        # Trend slope score: -0.2 to +0.4 m/yr maps to 0-40 points
        slope_score = min(40.0, max(0.0, ((slope + 0.1) / 0.5) * 40.0))
        # Recharge deficit score: 5m to 0m recharge maps to 0-20 points
        recharge_score = min(20.0, max(0.0, (1.0 - (recharge / 4.0)) * 20.0))

        risk_score = round(min(100.0, max(0.0, depth_score + slope_score + recharge_score)), 1)

        category = classify_well_status(depth, slope)

        color_map = {
            "Safe": "#10b981",          # Emerald
            "Semi-Critical": "#f59e0b", # Amber
            "Critical": "#f97316",      # Orange
            "Over-Exploited": "#ef4444",# Red
        }

        recs = []
        if category == "Over-Exploited":
            recs = [
                "Implement strict moratorium on new commercial tube-well energization.",
                "Mandate drip / sprinkler micro-irrigation systems for all agricultural land.",
                "Construct managed aquifer recharge (MAR) check-dams and percolation tanks.",
                "Deploy automated telemetry for continuous groundwater table monitoring."
            ]
        elif category == "Critical":
            recs = [
                "Prioritize rooftop rainwater harvesting and artificial recharge shafts.",
                "Restrict deep groundwater extraction beyond unconfined aquifer zone.",
                "Incentivize crop diversification from water-intensive paddy to millets/pulses.",
                "Conduct community water budgeting and village groundwater audits."
            ]
        elif category == "Semi-Critical":
            recs = [
                "Encourage farm ponds and watershed contour bunding for in-situ recharge.",
                "Monitor pre- and post-monsoon water levels closely each quarter.",
                "Promote conjunctive use of surface canal water with groundwater."
            ]
        else:
            recs = [
                "Groundwater development is within sustainable yield capacity.",
                "Maintain periodic seasonal water quality and depth monitoring.",
                "Preserve natural wetlands and drainage lines to protect recharge zones."
            ]

        factors = {
            "current_depth_mbgl": depth,
            "depletion_trend_m_per_year": slope,
            "annual_monsoon_recharge_m": recharge,
            "depth_risk_contribution": round(depth_score, 1),
            "trend_risk_contribution": round(slope_score, 1),
            "recharge_deficit_contribution": round(recharge_score, 1),
        }

        return RiskAssessmentResponse(
            station_code=req.station_code,
            station_name=station_name,
            category=category,
            risk_score=risk_score,
            color_code=color_map.get(category, "#10b981"),
            recommendations=recs,
            factors=factors,
        )

evaluation_service = EvaluationService()

