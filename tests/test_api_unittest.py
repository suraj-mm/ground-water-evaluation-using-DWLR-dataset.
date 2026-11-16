import unittest
from fastapi.testclient import TestClient
from backend.app.main import app

class TestGroundwaterAPI(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client_ctx = TestClient(app)
        cls.client = cls.client_ctx.__enter__()

    @classmethod
    def tearDownClass(cls):
        cls.client_ctx.__exit__(None, None, None)

    def test_01_healthz(self):
        res = self.client.get("/healthz")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["status"], "ok")

    def test_02_readyz(self):
        res = self.client.get("/readyz")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(data["ready"])
        self.assertGreater(data["stations_loaded"], 2000)

    def test_03_stats_overview(self):
        res = self.client.get("/api/v1/stats/overview")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["total_wells"], 2759)
        self.assertGreaterEqual(data["total_states"], 18)
        self.assertIn("status_distribution", data)
        self.assertGreater(data["avg_water_depth_mbgl"], 0)

    def test_04_stats_states(self):
        res = self.client.get("/api/v1/stats/states")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIsInstance(data, list)
        self.assertGreaterEqual(len(data), 18)
        self.assertIn("state", data[0])
        self.assertIn("well_count", data[0])

    def test_05_filter_options(self):
        res = self.client.get("/api/v1/stats/filter-options")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(len(data["states"]) > 0)
        self.assertTrue(len(data["districts"]) > 0)
        self.assertIn("Safe", data["statuses"])

    def test_06_list_wells(self):
        res = self.client.get("/api/v1/wells?page=1&page_size=10")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["total"], 2759)
        self.assertEqual(len(data["items"]), 10)
        self.assertEqual(data["items"][0]["station_code"], "GW-0001")

    def test_07_list_wells_with_filter(self):
        res = self.client.get("/api/v1/wells?state=Tamil%20Nadu&page=1&page_size=5")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertGreater(data["total"], 0)
        for item in data["items"]:
            self.assertEqual(item["state"].lower(), "tamil nadu")

    def test_08_geojson(self):
        res = self.client.get("/api/v1/wells/geojson")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["type"], "FeatureCollection")
        self.assertEqual(len(data["features"]), 2759)
        self.assertEqual(data["features"][0]["geometry"]["type"], "Point")

    def test_09_well_detail(self):
        res = self.client.get("/api/v1/wells/GW-0001")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["station_code"], "GW-0001")
        self.assertEqual(len(data["time_series"]), 92)
        self.assertIn("seasonal_averages", data)
        self.assertGreater(len(data["recharge_history"]), 0)

    def test_10_well_detail_not_found(self):
        res = self.client.get("/api/v1/wells/GW-99999")
        self.assertEqual(res.status_code, 404)
        data = res.json()
        self.assertEqual(data["status"], 404)

    def test_11_evaluation_recharge(self):
        payload = {
            "area_sq_km": 100.0,
            "specific_yield": 0.03,
            "delta_h_meters": 2.5
        }
        res = self.client.post("/api/v1/evaluation/recharge", json=payload)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["recharge_volume_ham"], 750.0)
        self.assertEqual(data["recharge_volume_mcm"], 7.5)

    def test_12_evaluation_risk(self):
        payload = {"station_code": "GW-0001"}
        res = self.client.post("/api/v1/evaluation/risk-assessment", json=payload)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn(data["category"], ["Safe", "Semi-Critical", "Critical", "Over-Exploited"])
        self.assertTrue(0 <= data["risk_score"] <= 100)
        self.assertGreater(len(data["recommendations"]), 0)

if __name__ == "__main__":
    unittest.main()

