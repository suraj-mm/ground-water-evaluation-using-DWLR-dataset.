from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, Query
from backend.app.schemas.stats import OverviewStats, StateStats
from backend.app.services.groundwater_service import GroundwaterService, groundwater_service

router = APIRouter(prefix="/stats", tags=["Statistics & Analytics"])

@router.get("/overview", response_model=OverviewStats)
def get_overview_statistics(
    service: GroundwaterService = Depends(lambda: groundwater_service),
):
    """Retrieve macro-level groundwater KPIs across India (wells, average depth, recharge, status breakdown)."""
    return service.get_overview()

@router.get("/states", response_model=List[StateStats])
def get_state_level_statistics(
    service: GroundwaterService = Depends(lambda: groundwater_service),
):
    """Retrieve state-wise groundwater metrics, average depths, specific yields, and stress proportions."""
    return service.get_state_statistics()

@router.get("/filter-options")
def get_filter_options(
    state: Optional[str] = Query(None, description="Optional state to filter districts"),
    service: GroundwaterService = Depends(lambda: groundwater_service),
) -> Dict[str, Any]:
    """Retrieve dropdown filter options for states, districts, and status categories."""
    states = service.get_states()
    districts = service.get_districts(state=state)
    return {
        "states": states,
        "districts": districts,
        "statuses": ["Safe", "Semi-Critical", "Critical", "Over-Exploited"],
    }

