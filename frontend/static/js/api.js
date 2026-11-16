// API client for Groundwater Level Evaluation Platform
const API_BASE = '/api/v1';

async function fetchJson(endpoint, options = {}) {
  try {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        ...(options.headers || {})
      },
      ...options
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || `HTTP Error ${res.status}`);
    }
    return await res.json();
  } catch (error) {
    console.error(`API Error [${endpoint}]:`, error);
    throw error;
  }
}

export const api = {
  // Statistics
  getOverviewStats: () => fetchJson('/stats/overview'),
  getStateStats: () => fetchJson('/stats/states'),
  getFilterOptions: (state) => fetchJson(`/stats/filter-options${state ? `?state=${encodeURIComponent(state)}` : ''}`),

  // Monitoring Wells
  listWells: ({ state, district, status, search, page = 1, pageSize = 50 }) => {
    const params = new URLSearchParams();
    if (state) params.set('state', state);
    if (district) params.set('district', district);
    if (status) params.set('status', status);
    if (search) params.set('search', search);
    params.set('page', page);
    params.set('page_size', pageSize);
    return fetchJson(`/wells?${params.toString()}`);
  },

  getWellGeoJSON: ({ state, district, status } = {}) => {
    const params = new URLSearchParams();
    if (state) params.set('state', state);
    if (district) params.set('district', district);
    if (status) params.set('status', status);
    const qs = params.toString();
    return fetchJson(`/wells/geojson${qs ? `?${qs}` : ''}`);
  },

  getWellDetail: (stationCode) => fetchJson(`/wells/${encodeURIComponent(stationCode)}`),
  getAllWellNames: () => fetchJson('/wells/all-names'),
  searchWells: (query, limit = 30) => fetchJson(`/wells/search?q=${encodeURIComponent(query)}&limit=${limit}`),

  // Hydrogeological Evaluation
  calculateRecharge: ({ areaSqKm, specificYield, deltaHMeters }) => {
    return fetchJson('/evaluation/recharge', {
      method: 'POST',
      body: JSON.stringify({
        area_sq_km: parseFloat(areaSqKm),
        specific_yield: parseFloat(specificYield),
        delta_h_meters: parseFloat(deltaHMeters)
      })
    });
  },

  assessRisk: ({ stationCode, customDepthMbgl, customTrendSlope, customRechargeDeltaH }) => {
    const payload = {};
    if (stationCode) payload.station_code = stationCode;
    if (customDepthMbgl !== undefined && customDepthMbgl !== null && customDepthMbgl !== '') {
      payload.custom_depth_mbgl = parseFloat(customDepthMbgl);
    }
    if (customTrendSlope !== undefined && customTrendSlope !== null && customTrendSlope !== '') {
      payload.custom_trend_slope = parseFloat(customTrendSlope);
    }
    if (customRechargeDeltaH !== undefined && customRechargeDeltaH !== null && customRechargeDeltaH !== '') {
      payload.custom_recharge_delta_h = parseFloat(customRechargeDeltaH);
    }
    return fetchJson('/evaluation/risk-assessment', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  // DWLR Telemetry (6-Hour Updates)
  getDWLRStatus: () => fetchJson('/dwlr/status'),
  triggerDWLRSync: () => fetchJson('/dwlr/sync', { method: 'POST' }),

  // Live Open-Meteo Weather & Well Health
  getWellWeatherImpact: (stationCode) => fetchJson(`/wells/${encodeURIComponent(stationCode)}/weather-impact`),

  // Groundwater Level Prediction Engine
  getWellPrediction: (stationCode) => fetchJson(`/wells/${encodeURIComponent(stationCode)}/prediction`),
};

