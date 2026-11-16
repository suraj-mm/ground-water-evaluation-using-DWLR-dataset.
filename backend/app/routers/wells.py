from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, Query, status
from backend.app.schemas.common import PaginatedResponse
from backend.app.schemas.well import WellDetail, WellGeoJSONCollection, WellLookupItem, WellSummary
from backend.app.services.groundwater_service import GroundwaterService, groundwater_service
from backend.app.services.prediction_engine import prediction_engine

router = APIRouter(prefix="/wells", tags=["Monitoring Wells"])


# ──────────────────────────────────────────────────────────────────────────────
# Specific paths MUST come before /{station_code} wildcard
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/all-names", response_model=List[Dict[str, Any]])
def get_all_well_names(
    service: GroundwaterService = Depends(lambda: groundwater_service),
):
    """Fast lightweight index of all 2,759 wells for instant autocomplete."""
    return service.get_all_well_names()


@router.get("/search", response_model=List[WellSummary])
def search_monitoring_wells(
    q: str = Query(..., min_length=1, description="Keyword — name, code, district, state, village, tehsil, block"),
    limit: int = Query(30, ge=1, le=100),
    service: GroundwaterService = Depends(lambda: groundwater_service),
):
    """Real-time search across all 2,759 monitoring wells."""
    return service.search_wells(q, limit=limit)


@router.get("", response_model=PaginatedResponse[WellSummary])
def list_monitoring_wells(
    state: Optional[str] = Query(None),
    district: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    service: GroundwaterService = Depends(lambda: groundwater_service),
):
    """Paginated list of CGWB groundwater monitoring wells."""
    return service.list_stations(
        state=state, district=district, status=status,
        search=search, page=page, page_size=page_size,
    )


@router.get("/geojson", response_model=WellGeoJSONCollection)
def get_wells_geojson(
    state: Optional[str] = Query(None),
    district: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    service: GroundwaterService = Depends(lambda: groundwater_service),
):
    """GeoJSON FeatureCollection for Leaflet / Cesium map."""
    return service.get_spatial_geojson(state=state, district=district, status=status)


# ──────────────────────────────────────────────────────────────────────────────
# Sub-resource endpoints (must stay before /{station_code})
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/{station_code}/prediction")
def get_well_prediction(station_code: str) -> Dict[str, Any]:
    """
    Run the groundwater level prediction engine for a specific well.
    Returns Δh (metres) for 1 week, 1 month, 2/3/4/6 months using
    Open-Meteo live rainfall + seasonal climatology + Sy-based physics.
    """
    return prediction_engine.predict(station_code)


# ──────────────────────────────────────────────────────────────────────────────
# Wildcard — must be last
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/{station_code}", response_model=WellDetail)
def get_well_detail(
    station_code: str,
    service: GroundwaterService = Depends(lambda: groundwater_service),
):
    """Full well record with time-series, seasonal averages, recharge history, pH, and predictions."""
    return service.get_station_detail(station_code)
