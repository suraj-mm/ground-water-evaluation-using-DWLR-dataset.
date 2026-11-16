import asyncio
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from backend.app.core.config import settings
from backend.app.core.errors import AppException, app_exception_handler, global_exception_handler
from backend.app.core.logging import logger, setup_logging
from backend.app.repositories.groundwater_repo import groundwater_repo
from backend.app.routers import (
    dwlr_router,
    evaluation_router,
    health_router,
    stats_router,
    weather_router,
    wells_router,
)

BASE_DIR = Path(__file__).resolve().parent.parent.parent
FRONTEND_DIR = BASE_DIR / "frontend"
STATIC_DIR = FRONTEND_DIR / "static"
INDEX_HTML = FRONTEND_DIR / "templates" / "index.html"

_DWLR_SYNC_INTERVAL = 6 * 3600   # 6 hours in seconds


async def _dwlr_background_sync() -> None:
    """Background task: refresh DWLR live data every 6 hours."""
    from backend.app.services.dwlr_service import dwlr_service
    while True:
        await asyncio.sleep(_DWLR_SYNC_INTERVAL)
        try:
            logger.info("Scheduled DWLR sync starting …")
            dwlr_service.perform_6hour_update()
            logger.info("Scheduled DWLR sync complete.")
        except Exception as exc:
            logger.warning(f"Scheduled DWLR sync failed: {exc}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Startup ──────────────────────────────────────────────────────
    setup_logging(settings.debug)
    logger.info("Initialising CGWB HydroEval platform …")
    try:
        groundwater_repo.initialize(settings.data_csv_path)
        logger.info(f"Loaded {len(groundwater_repo._wells_summary)} monitoring wells.")
    except Exception as exc:
        logger.error(f"Dataset load failed: {exc}", exc_info=True)

    # Start DWLR 6-hour background scheduler
    sync_task = asyncio.create_task(_dwlr_background_sync())

    yield

    # ── Shutdown ─────────────────────────────────────────────────────
    sync_task.cancel()
    logger.info("CGWB HydroEval platform shut down.")


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description=(
        "Central Ground Water Board (CGWB) Quality-Controlled "
        "Groundwater Level Evaluation & Geospatial Platform"
    ),
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Exception handlers
app.add_exception_handler(AppException, app_exception_handler)
app.add_exception_handler(Exception, global_exception_handler)

# Routers
app.include_router(health_router)
app.include_router(wells_router,      prefix=settings.api_prefix)
app.include_router(stats_router,      prefix=settings.api_prefix)
app.include_router(evaluation_router, prefix=settings.api_prefix)
app.include_router(dwlr_router,       prefix=settings.api_prefix)
app.include_router(weather_router,    prefix=settings.api_prefix)

# Static files
if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


@app.get("/", include_in_schema=False)
async def serve_index():
    """Serve the SPA frontend."""
    if INDEX_HTML.exists():
        return FileResponse(str(INDEX_HTML))
    return JSONResponse({"message": "CGWB HydroEval API", "docs": "/docs"})
