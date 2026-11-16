from pathlib import Path
from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent.parent.parent

class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

    app_name: str = "Groundwater Level Evaluation Platform"
    app_version: str = "1.0.0"
    api_prefix: str = "/api/v1"
    host: str = "127.0.0.1"
    port: int = 8000
    debug: bool = False

    data_csv_path: str = str(
        BASE_DIR / "[]CGWB]-Quality_controlled_groundwater_levels_over_India" / "Output" / "CGWB_India_filtered_GWLs_ref_sy_2000_2022.csv"
    )
    extended_csv_path: str = str(
        BASE_DIR / "[]CGWB]-Quality_controlled_groundwater_levels_over_India" / "Output" / "4_India_GWLs_2000_2024_after_3sigma.csv"
    )

    cors_origins: List[str] = [
        "http://localhost:8000",
        "http://127.0.0.1:8000",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "*"
    ]

settings = Settings()

