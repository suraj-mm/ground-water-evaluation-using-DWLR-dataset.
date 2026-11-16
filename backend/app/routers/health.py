from fastapi import APIRouter, status
from backend.app.repositories.groundwater_repo import groundwater_repo

router = APIRouter(tags=["Health"])

@router.get("/healthz", status_code=status.HTTP_200_OK)
def health_check():
    """Liveness probe: verifies that the server process is responsive."""
    return {"status": "ok", "service": "groundwater-evaluation-api"}

@router.get("/readyz", status_code=status.HTTP_200_OK)
def readiness_check():
    """Readiness probe: verifies that the dataset is loaded and ready for queries."""
    if not groundwater_repo.is_initialized:
        return {"status": "loading", "ready": False}
    return {
        "status": "ready",
        "ready": True,
        "stations_loaded": len(groundwater_repo._wells_summary),
    }

