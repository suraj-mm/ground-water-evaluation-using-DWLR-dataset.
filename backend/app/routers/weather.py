from typing import Any, Dict
from fastapi import APIRouter, Depends
from backend.app.services.weather_service import WeatherService, weather_service

router = APIRouter(prefix="/wells", tags=["Weather Impact & Well Health"])

@router.get("/{station_code}/weather-impact")
def get_well_weather_and_health(
    station_code: str,
    service: WeatherService = Depends(lambda: weather_service)
) -> Dict[str, Any]:
    """
    Retrieve real-time Open-Meteo weather and rainfall metrics at the well's coordinates,
    evaluate aquifer recharge impact, and generate a diagnostic Well Health Card with tailored recommendations.
    """
    return service.get_well_weather_and_health_impact(station_code)

