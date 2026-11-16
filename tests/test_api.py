import pytest
from fastapi.testclient import TestClient
from backend.app.main import app

@pytest.fixture(scope="session")
def client():
    with TestClient(app) as test_client:
        yield test_client

def test_healthz(client: TestClient):
    response = client.get("/healthz")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"

def test_readyz(client: TestClient):
    response = client.get("/readyz")
    assert response.status_code == 200
    data = response.json()
    assert data["ready"] is True
    assert data["stations_loaded"] > 2000

def test_stats_overview(client: TestClient):
    response = client.get("/api/v1/stats/overview")
    assert response.status_code == 200
    data = response.json()
    assert data["total_wells"] == 2759
    assert data["total_states"] >= 18
    assert "status_distribution" in data
    assert data["avg_water_depth_mbgl"] > 0

def test_stats_states(client: TestClient):
    response = client.get("/api/v1/stats/states")
    assert response.status_code == 200
    states = response.json()
    assert isinstance(states, list)
    assert len(states) >= 18
    assert "state" in states[0]
    assert "well_count" in states[0]

def test_filter_options(client: TestClient):
    response = client.get("/api/v1/stats/filter-options")
    assert response.status_code == 200
    data = response.json()
    assert len(data["states"]) > 0
    assert len(data["districts"]) > 0
    assert "Safe" in data["statuses"]

def test_list_wells(client: TestClient):
    response = client.get("/api/v1/wells?page=1&page_size=10")
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 2759
    assert len(data["items"]) == 10
    first_well = data["items"][0]
    assert first_well["station_code"] == "GW-0001"
    assert first_well["status"] in ["Safe", "Semi-Critical", "Critical", "Over-Exploited"]

def test_list_wells_with_filter(client: TestClient):
    response = client.get("/api/v1/wells?state=Tamil%20Nadu&page=1&page_size=5")
    assert response.status_code == 200
    data = response.json()
    assert data["total"] > 0
    for item in data["items"]:
        assert item["state"].lower() == "tamil nadu"

def test_geojson_endpoint(client: TestClient):
    response = client.get("/api/v1/wells/geojson")
    assert response.status_code == 200
    data = response.json()
    assert data["type"] == "FeatureCollection"
    assert len(data["features"]) == 2759
    assert "geometry" in data["features"][0]
    assert data["features"][0]["geometry"]["type"] == "Point"

def test_well_detail(client: TestClient):
    response = client.get("/api/v1/wells/GW-0001")
    assert response.status_code == 200
    data = response.json()
    assert data["station_code"] == "GW-0001"
    assert len(data["time_series"]) == 92
    assert "seasonal_averages" in data
    assert len(data["recharge_history"]) > 0

def test_well_detail_not_found(client: TestClient):
    response = client.get("/api/v1/wells/GW-99999")
    assert response.status_code == 404
    err = response.json()
    assert err["status"] == 404
    assert "not found" in err["detail"].lower()

def test_evaluation_recharge(client: TestClient):
    payload = {
        "area_sq_km": 100.0,
        "specific_yield": 0.03,
        "delta_h_meters": 2.5
    }
    response = client.post("/api/v1/evaluation/recharge", json=payload)
    assert response.status_code == 200
    data = response.json()
    # 100 sq km * 100 ha/sq km * 2.5 m * 0.03 = 750 ham
    assert data["recharge_volume_ham"] == 750.0
    assert data["recharge_volume_mcm"] == 7.5

def test_evaluation_risk_assessment_by_code(client: TestClient):
    payload = {"station_code": "GW-0001"}
    response = client.post("/api/v1/evaluation/risk-assessment", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["category"] in ["Safe", "Semi-Critical", "Critical", "Over-Exploited"]
    assert 0 <= data["risk_score"] <= 100
    assert len(data["recommendations"]) > 0

