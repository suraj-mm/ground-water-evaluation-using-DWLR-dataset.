from typing import Any, Dict
from fastapi import APIRouter, Depends, status
from backend.app.services.dwlr_service import DWLRService, dwlr_service

router = APIRouter(prefix="/dwlr", tags=["DWLR Telemetry (6-Hour Updates)"])

@router.get("/status")
def get_dwlr_update_status(
    service: DWLRService = Depends(lambda: dwlr_service)
) -> Dict[str, Any]:
    """Check whether the DWLR dataset is updating every 6 hours and view the proof of updates."""
    return service.get_status()

@router.post("/sync", status_code=status.HTTP_200_OK)
def trigger_dwlr_sync(
    service: DWLRService = Depends(lambda: dwlr_service)
) -> Dict[str, Any]:
    """Execute on-demand 6-hour DWLR telemetry extraction from India-WRIS servers."""
    return service.perform_6hour_update()

