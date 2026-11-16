from fastapi import APIRouter, Depends, status
from backend.app.schemas.evaluation import (
    RechargeCalculationRequest,
    RechargeCalculationResponse,
    RiskAssessmentRequest,
    RiskAssessmentResponse,
)
from backend.app.services.evaluation_service import EvaluationService, evaluation_service

router = APIRouter(prefix="/evaluation", tags=["Hydrogeological Evaluation"])

@router.post(
    "/recharge",
    response_model=RechargeCalculationResponse,
    status_code=status.HTTP_200_OK,
)
def compute_monsoon_recharge(
    request: RechargeCalculationRequest,
    service: EvaluationService = Depends(lambda: evaluation_service),
):
    """
    Compute dynamic groundwater recharge using CGWB Water Level Fluctuation (WLF) method.
    Returns recharge volume in Hectare-Meters (ham) and Million Cubic Meters (MCM).
    """
    return service.calculate_recharge(request)

@router.post(
    "/risk-assessment",
    response_model=RiskAssessmentResponse,
    status_code=status.HTTP_200_OK,
)
def evaluate_groundwater_risk(
    request: RiskAssessmentRequest,
    service: EvaluationService = Depends(lambda: evaluation_service),
):
    """
    Assess groundwater stress risk score (0-100) and regulatory categorization (Safe, Semi-Critical, Critical, Over-Exploited)
    with tailored remediation recommendations.
    """
    return service.assess_risk(request)

