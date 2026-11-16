from backend.app.routers.health import router as health_router
from backend.app.routers.wells import router as wells_router
from backend.app.routers.stats import router as stats_router
from backend.app.routers.evaluation import router as evaluation_router
from backend.app.routers.dwlr import router as dwlr_router
from backend.app.routers.weather import router as weather_router

__all__ = [
    "health_router",
    "wells_router",
    "stats_router",
    "evaluation_router",
    "dwlr_router",
    "weather_router",
]
