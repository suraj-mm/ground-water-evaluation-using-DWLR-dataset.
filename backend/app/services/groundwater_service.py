from typing import List, Optional
from backend.app.core.errors import NotFoundError
from backend.app.repositories.groundwater_repo import groundwater_repo
from backend.app.schemas.common import PaginatedResponse
from backend.app.schemas.stats import OverviewStats, StateStats
from backend.app.schemas.well import WellDetail, WellGeoJSONCollection, WellSummary

class GroundwaterService:
    def __init__(self, repo=groundwater_repo):
        self.repo = repo

    def get_overview(self) -> OverviewStats:
        return self.repo.get_overview_stats()

    def get_states(self) -> List[str]:
        return self.repo.get_states()

    def get_districts(self, state: Optional[str] = None) -> List[str]:
        return self.repo.get_districts(state)

    def get_state_statistics(self) -> List[StateStats]:
        return self.repo.get_state_stats()

    def list_stations(
        self,
        state: Optional[str] = None,
        district: Optional[str] = None,
        status: Optional[str] = None,
        search: Optional[str] = None,
        page: int = 1,
        page_size: int = 50,
    ) -> PaginatedResponse[WellSummary]:
        return self.repo.list_wells(
            state=state,
            district=district,
            status=status,
            search=search,
            page=page,
            page_size=page_size,
        )

    def get_station_detail(self, code: str) -> WellDetail:
        well = self.repo.get_well_by_code(code)
        if not well:
            raise NotFoundError(f"Monitoring well station '{code}' not found")
        return well

    def get_spatial_geojson(
        self,
        state: Optional[str] = None,
        district: Optional[str] = None,
        status: Optional[str] = None,
    ) -> WellGeoJSONCollection:
        return self.repo.get_geojson(state=state, district=district, status=status)

    def get_all_well_names(self):
        return self.repo.get_all_well_names()

    def search_wells(self, query: str, limit: int = 30) -> List[WellSummary]:
        return self.repo.search_wells(query, limit=limit)

groundwater_service = GroundwaterService()

