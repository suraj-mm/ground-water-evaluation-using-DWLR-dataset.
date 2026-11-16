import { api } from './api.js?v=20261116h';
import { mapController } from './map.js?v=20261116h';
import { charts } from './charts.js?v=20261116h';

let appState = {
  currentTab: 'geo-view',
  selectedStationCode: 'GW-0001',
  selectedWell: null,
  allWellsList: [],
  filterState: '',
  filterDistrict: '',
  filterStatus: '',
  searchQuery: '',
  tablePage: 1,
  tablePageSize: 20,
  overview: null,
  statesData: [],
  dwlrData: null,
};

// Initialize Application on DOM Ready
document.addEventListener('DOMContentLoaded', async () => {
  setupNavigation();
  setupSidebarResizer();
  setupGlobalWellSearch();
  setupSidebarKPICards();
  setupEventListeners();
  mapController.init(handleStationSelection);

  try {
    await loadInitialData();
  } catch (err) {
    console.error('Initialization error:', err);
  }
});

async function loadInitialData() {
  // 1. Overview Macro KPIs
  const overview = await api.getOverviewStats();
  appState.overview = overview;
  renderKPIs(overview);

  // 2. Dropdown Filter Options
  const filters = await api.getFilterOptions();
  populateDropdowns(filters);

  // 3. Load First Page & Populate Global Well Selector
  await loadGlobalWellList();

  // 4. Load Map GeoJSON
  await reloadMapData();

  // 5. Load Stations Table
  await loadStationsTable();

  // 6. Load State Analytics
  await loadStateAnalytics();

  // 7. Load DWLR Telemetry
  await loadDWLRTelemetry();

  // 8. Sync Initial Well Context (GW-0001 default)
  await syncSelectedWellContext('GW-0001');
}

function renderKPIs(ov) {
  const safe = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  safe('kpiTotalWells', ov.total_wells.toLocaleString());
  safe('kpiStates', ov.total_states);
  safe('kpiAvgDepth', `${ov.avg_water_depth_mbgl}`);
  safe('kpiAvgRecharge', `${ov.avg_annual_recharge_m}`);
  safe('kpiSafeCount', ov.status_distribution.safe.toLocaleString());
  safe('kpiOverExploitedCount', (ov.status_distribution.over_exploited + ov.status_distribution.critical).toLocaleString());
}

function setupSidebarKPICards() {
  document.querySelectorAll('.sidebar-kpi-card[data-target]').forEach(card => {
    card.addEventListener('click', () => {
      const target = card.dataset.target;
      if (target) switchTab(target, card.title || target);
    });
  });
}

function populateDropdowns(data) {
  const stateSelects = [document.getElementById('mapFilterState'), document.getElementById('tableFilterState')];
  stateSelects.forEach(sel => {
    if (!sel) return;
    sel.innerHTML = '<option value="">All States</option>';
    data.states.forEach(st => {
      const opt = document.createElement('option');
      opt.value = st;
      opt.textContent = st;
      sel.appendChild(opt);
    });
  });
}

async function loadGlobalWellList() {
  try {
    // Load all 2,759 wells for instant autocomplete & real-time search
    const allWells = await api.getAllWellNames();
    appState.allWellsList = allWells;

    const countBadge = document.getElementById('globalSearchCountBadge');
    if (countBadge) {
      countBadge.textContent = `${allWells.length.toLocaleString()} wells`;
    }

    const selector = document.getElementById('globalWellSelector');
    if (selector) {
      selector.innerHTML = '';
      allWells.forEach(w => {
        const opt = document.createElement('option');
        opt.value = w.station_code;
        opt.textContent = `${w.station_code} · ${w.station_name} (${w.district}, ${w.state})`;
        selector.appendChild(opt);
      });
      selector.value = appState.selectedStationCode;
    }
  } catch (err) {
    console.error('Failed to load all well names:', err);
  }
}

async function reloadMapData() {
  const geojson = await api.getWellGeoJSON({
    state: appState.filterState,
    district: appState.filterDistrict,
    status: appState.filterStatus
  });
  mapController.renderGeoJSON(geojson);
}

// Global Well Context Synchronizer
async function syncSelectedWellContext(stationCode) {
  appState.selectedStationCode = stationCode;

  // Update hidden selector for legacy JS compatibility
  const selector = document.getElementById('globalWellSelector');
  if (selector && selector.value !== stationCode) {
    let exists = Array.from(selector.options).some(o => o.value === stationCode);
    if (!exists) {
      const opt = document.createElement('option');
      opt.value = stationCode;
      opt.textContent = `${stationCode} · Selected Station`;
      selector.appendChild(opt);
    }
    selector.value = stationCode;
  }

  try {
    const detail = await api.getWellDetail(stationCode);
    appState.selectedWell = detail;

    // 1. Update sidebar drawer
    renderStationDrawer(detail);

    // 2. Render pH card immediately (data already in well detail)
    renderPhCard(detail);

    // 3. Render recharge recommendations from well health data
    renderRechargeRecs(detail);

    // 4. Update Recharge Calculator
    updateCalculatorWithWell(detail);

    // 5. Update Risk Engine & Weather (async — won't block drawer render)
    updateRiskAndWeatherWithWell(stationCode, detail).catch(() => {});

    // 6. Fetch & render groundwater predictions (non-blocking)
    loadAndRenderPrediction(stationCode);

    // 7. Update sidebar search display
    const searchInput = document.getElementById('globalWellSearchInput');
    if (searchInput) {
      searchInput.value = `${detail.station_code} · ${detail.station_name} (${detail.district}, ${detail.state})`;
      const clearBtn = document.getElementById('btnClearWellSearch');
      if (clearBtn) clearBtn.style.display = 'block';
    }

  } catch (err) {
    console.error(`Failed to sync well context for ${stationCode}:`, err);
  }
}

// ── pH Water Quality Card ────────────────────────────────────────────────────
function renderPhCard(d) {
  const ph = d.ph;
  const phStatus = d.ph_status || '--';
  const phAg = d.ph_agriculture || '--';

  const phValEl = document.getElementById('phValue');
  const phStatusBadge = document.getElementById('phStatusBadge');
  const phDrinkableEl = document.getElementById('phDrinkable');
  const phAgEl = document.getElementById('phAgriculture');

  if (!phValEl) return;

  phValEl.textContent = ph != null ? ph.toFixed(2) : '--';

  // Color code pH value
  if (ph != null) {
    if (ph >= 6.5 && ph <= 8.5) phValEl.style.color = '#34d399';
    else if ((ph >= 5.5 && ph < 6.5) || (ph > 8.5 && ph <= 9.5)) phValEl.style.color = '#fbbf24';
    else phValEl.style.color = '#f87171';
  }

  if (phStatusBadge) {
    phStatusBadge.textContent = phStatus;
    phStatusBadge.className = 'status-pill ' + (
      phStatus === 'Drinkable' ? 'safe' :
      phStatus === 'Marginal'  ? 'semi-critical' : 'critical'
    );
  }
  if (phDrinkableEl) phDrinkableEl.textContent = phStatus;
  if (phAgEl) {
    phAgEl.textContent = phAg;
    phAgEl.style.color = phAg === 'Suitable' ? '#34d399' : phAg === 'Moderate' ? '#fbbf24' : '#f87171';
  }
}

// ── Groundwater Level Prediction ─────────────────────────────────────────────
async function loadAndRenderPrediction(stationCode) {
  const body = document.getElementById('predictionBody');
  if (!body) return;
  body.innerHTML = '<div style="color:var(--text-muted);font-size:0.72rem;padding:6px 0;">Loading live rainfall data…</div>';
  try {
    const data = await api.getWellPrediction(stationCode);
    renderPredictionCard(data);
  } catch (e) {
    if (body) body.innerHTML = '<div style="color:var(--text-muted);font-size:0.72rem;padding:6px 0;">Prediction unavailable (network).</div>';
  }
}

function renderPredictionCard(data) {
  const body = document.getElementById('predictionBody');
  if (!body || !data) return;

  const horizons = [
    { key: 'prediction_week',    label: '1 Week' },
    { key: 'prediction_month',   label: '1 Month' },
    { key: 'prediction_2months', label: '2 Months' },
    { key: 'prediction_3months', label: '3 Months' },
    { key: 'prediction_4months', label: '4 Months' },
    { key: 'prediction_6months', label: '6 Months' },
  ];

  const rain7d = (data.total_forecast_7d_mm || 0).toFixed(1);
  const rif    = ((data.rainfall_infiltration_factor || 0) * 100).toFixed(0);

  let html = `<div style="font-size:0.68rem;color:var(--text-muted);margin-bottom:6px;">
    7-day forecast rain: <b style="color:#38bdf8">${rain7d} mm</b> &nbsp;|&nbsp;
    Infiltration: <b style="color:#a78bfa">${rif}%</b>
  </div>`;

  horizons.forEach(({ key, label }) => {
    const val = data[key];
    if (val == null) return;
    const cls = val > 0.01 ? 'up' : val < -0.01 ? 'down' : 'flat';
    const sign = val > 0 ? '+' : '';
    html += `<div class="prediction-row">
      <span class="prediction-label">${label}</span>
      <span class="prediction-val ${cls}">${sign}${val.toFixed(3)} m</span>
    </div>`;
  });

  body.innerHTML = html;
}

// ── Recharge Recommendations ─────────────────────────────────────────────────
function renderRechargeRecs(detail) {
  const list = document.getElementById('rechargeRecsList');
  if (!list) return;

  // Build context-aware recommendations from well data
  const recs = _buildRechargeRecs(detail);
  list.innerHTML = recs.map(r => `<li>${r}</li>`).join('');
}

function _buildRechargeRecs(d) {
  const recs = [];
  const status = d.status || 'Safe';
  const aq = (d.aquifer_type || '').toLowerCase();
  const slope = d.trend_slope_m_per_year || 0;
  const depth = d.latest_reading || 0;
  const ph = d.ph;
  const phStatus = d.ph_status || 'Drinkable';
  const recharge = d.annual_recharge_delta_h || 0;

  // Depletion-based
  if (status === 'Over-Exploited') {
    recs.push('Immediately reduce extraction — well is critically over-exploited.');
    recs.push('Construct check dams and percolation ponds within 2 km radius.');
  } else if (status === 'Critical') {
    recs.push('Reduce pumping by 30–40% and monitor levels weekly.');
    recs.push('Install rooftop rainwater harvesting to recharge the aquifer.');
  } else if (status === 'Semi-Critical') {
    recs.push('Moderate water use; shift irrigation to drip/sprinkler systems.');
  } else {
    recs.push('Well is in Safe zone — maintain current extraction rates.');
  }

  // Aquifer-specific
  if (aq.includes('alluvium') || aq.includes('sand')) {
    recs.push('Recharge shafts (1–3 m diameter) are highly effective for alluvial aquifers here.');
  } else if (aq.includes('basalt') || aq.includes('trap')) {
    recs.push('Nala bunding and contour trenches maximise recharge in basaltic terrain.');
  } else if (aq.includes('granite') || aq.includes('gneiss') || aq.includes('hard rock')) {
    recs.push('Bore-well recharge with filtered surface runoff is recommended for hard rock.');
  }

  // Slope trend
  if (slope > 0.1) {
    recs.push('Long-term depletion trend detected — adopt seasonal cropping to cut irrigation demand.');
  } else if (slope < -0.05) {
    recs.push('Water table is recovering — continue recharge practices for sustained improvement.');
  }

  // pH-based farming advice
  if (ph != null) {
    if (phStatus === 'Unsuitable') {
      recs.push(`pH ${ph.toFixed(2)} is outside safe range — do NOT use for drinking. Test for heavy metals.`);
    } else if (phStatus === 'Marginal') {
      recs.push(`pH ${ph.toFixed(2)} is marginal — treat water before drinking; acceptable for irrigation.`);
    } else {
      if (d.ph_agriculture === 'Suitable') {
        recs.push(`pH ${ph.toFixed(2)}: ideal for most crops — suitable for rice, wheat, and vegetables.`);
      } else {
        recs.push(`pH ${ph.toFixed(2)}: moderately suitable — add lime to soil if growing legumes.`);
      }
    }
  }

  // Seasonal
  recs.push('Monsoon (Jun–Sep): maximise recharge; store excess surface runoff.');
  recs.push('Pre-monsoon (Mar–May): restrict extraction to conserve stored groundwater.');

  return recs.slice(0, 7); // cap at 7 items
}

async function handleStationSelection(stationCode) {
  const sidebar = document.getElementById('appSidebar');
  if (sidebar && sidebar.classList.contains('collapsed')) {
    sidebar.classList.remove('collapsed');
    const saved = localStorage.getItem('cgwb_sidebar_width');
    sidebar.style.width = saved ? `${saved}px` : '380px';
    setTimeout(() => {
      if (mapController.leafletMap) mapController.leafletMap.invalidateSize();
    }, 250);
  }

  await syncSelectedWellContext(stationCode);

  if (appState.selectedWell) {
    mapController.flyToStation(appState.selectedWell.latitude, appState.selectedWell.longitude);
  }
}

function renderStationDrawer(d) {
  document.getElementById('drawerStationName').textContent = d.station_name;
  document.getElementById('drawerStationCode').textContent = d.station_code;

  const statusEl = document.getElementById('drawerStatusBadge');
  const slug = d.status.toLowerCase().replace(' ', '-');
  statusEl.className = `status-pill ${slug}`;
  statusEl.textContent = d.status;

  document.getElementById('drawerState').textContent = d.state;
  document.getElementById('drawerDistrict').textContent = d.district;
  document.getElementById('drawerDepth').textContent = d.latest_reading != null ? `${d.latest_reading} mbgl` : 'N/A';
  document.getElementById('drawerAquifer').textContent = d.aquifer_type || 'Unconfined';
  document.getElementById('drawerWellDepth').textContent = d.well_depth != null ? `${d.well_depth} m` : 'N/A';
  document.getElementById('drawerSpecificYield').textContent = d.reference_sy != null ? d.reference_sy : '0.03';

  const slopeText = d.trend_slope_m_per_year != null
    ? `${d.trend_slope_m_per_year > 0 ? '+' : ''}${d.trend_slope_m_per_year} m/yr`
    : 'N/A';
  document.getElementById('drawerTrend').textContent = slopeText;

  // Render Charts
  charts.renderHistoricalTrendChart('stationTrendCanvas', d.time_series, d.trend_slope_m_per_year);
  charts.renderSeasonalChart('stationSeasonalCanvas', d.seasonal_averages);
  charts.renderRechargeHistoryChart('stationRechargeCanvas', d.recharge_history);
}

// Pre-fill and attach selected well to Recharge Calculator
function updateCalculatorWithWell(d) {
  const nameEl = document.getElementById('calcTraceName');
  if (nameEl) nameEl.textContent = `${d.station_name} · ${d.district}, ${d.state}`;
  
  const codeEl = document.getElementById('calcTraceCode');
  if (codeEl) codeEl.textContent = d.station_code;

  const stateEl = document.getElementById('calcTraceState');
  if (stateEl) stateEl.textContent = d.state;

  const distEl = document.getElementById('calcTraceDistrict');
  if (distEl) distEl.textContent = d.district;

  const coordsEl = document.getElementById('calcTraceCoords');
  if (coordsEl) coordsEl.textContent = `${d.latitude.toFixed(4)}° N, ${d.longitude.toFixed(4)}° E`;

  const aqEl = document.getElementById('calcTraceAquifer');
  if (aqEl) aqEl.textContent = d.aquifer_type || 'Alluvium / Hard Rock';

  const syEl = document.getElementById('calcTraceSy');
  const wellSy = d.reference_sy != null ? d.reference_sy : 0.030;
  if (syEl) syEl.textContent = wellSy;

  const dhEl = document.getElementById('calcTraceDeltaH');
  const wellDeltaH = d.annual_recharge_delta_h != null ? d.annual_recharge_delta_h : 2.65;
  if (dhEl) dhEl.textContent = `${wellDeltaH} m`;

  const statusEl = document.getElementById('calcTraceStatus');
  if (statusEl) {
    const slug = d.status.toLowerCase().replace(' ', '-');
    statusEl.className = `status-pill ${slug}`;
    statusEl.textContent = d.status;
  }

  // Pre-populate input fields
  document.getElementById('calcSy').value = wellSy;
  document.getElementById('calcDeltaH').value = wellDeltaH;

  // Automatically trigger calculation for this well's catchment
  const area = document.getElementById('calcArea').value || 100;
  api.calculateRecharge({
    areaSqKm: area,
    specificYield: wellSy,
    deltaHMeters: wellDeltaH
  }).then(res => {
    document.getElementById('calcResultBox').style.display = 'block';
    document.getElementById('resHam').textContent = `${res.recharge_volume_ham.toLocaleString()} ham`;
    document.getElementById('resMcm').textContent = `${res.recharge_volume_mcm.toLocaleString()} MCM`;
    document.getElementById('resDepth').textContent = `${res.recharge_depth_mm} mm`;
    document.getElementById('resInterp').textContent = `Catchment evaluation for ${d.station_name} (${d.district}): ${res.interpretation}`;
  }).catch(e => console.error('Auto recharge calc error:', e));
}

// Fetch Open-Meteo Weather Impact and Well Health Card
async function updateRiskAndWeatherWithWell(stationCode, d) {
  // Update Location Trace Banner in Risk View
  const nameEl = document.getElementById('riskTraceName');
  if (nameEl) nameEl.textContent = `${d.station_name} · ${d.district}, ${d.state}`;

  const codeEl = document.getElementById('riskTraceCode');
  if (codeEl) codeEl.textContent = d.station_code;

  const stateEl = document.getElementById('riskTraceState');
  if (stateEl) stateEl.textContent = d.state;

  const distEl = document.getElementById('riskTraceDistrict');
  if (distEl) distEl.textContent = d.district;

  const coordsEl = document.getElementById('riskTraceCoords');
  if (coordsEl) coordsEl.textContent = `${d.latitude.toFixed(4)}° N, ${d.longitude.toFixed(4)}° E`;

  const depthEl = document.getElementById('riskTraceDepth');
  if (depthEl) depthEl.textContent = d.latest_reading != null ? `${d.latest_reading} mbgl` : 'N/A';

  const trendEl = document.getElementById('riskTraceTrend');
  if (trendEl) {
    const slope = d.trend_slope_m_per_year;
    trendEl.textContent = slope != null ? `${slope > 0 ? '+' : ''}${slope} m/yr` : 'N/A';
  }

  const statusEl = document.getElementById('riskTraceStatus');
  if (statusEl) {
    const slug = d.status.toLowerCase().replace(' ', '-');
    statusEl.className = `status-pill ${slug}`;
    statusEl.textContent = d.status;
  }

  // Fetch Open-Meteo Weather & Diagnostic Well Health
  try {
    const data = await api.getWellWeatherImpact(stationCode);

    // 1. Weather KPI Chips
    const w = data.weather || {};
    document.getElementById('weatherTemp').textContent = w.temperature_c != null ? `${w.temperature_c}°C` : '--';
    document.getElementById('weatherHumidity').textContent = w.relative_humidity_pct != null ? `${w.relative_humidity_pct}%` : '--';

    const rf = data.rainfall_analysis || {};
    document.getElementById('weatherPastRain').textContent = `${rf.past_7d_rainfall_mm || 0} mm`;
    document.getElementById('weatherForecastRain').textContent = `${rf.forecast_7d_rainfall_mm || 0} mm`;

    // 2. Infiltration & Replenishment
    document.getElementById('rainInfiltrationMm').textContent = `${rf.estimated_recharge_infiltration_mm || 0} mm`;
    document.getElementById('rainWaterTableRiseM').textContent = `+${rf.estimated_water_table_replenishment_m || 0} m`;

    // 3. 14-Day Rainfall Bar Chart
    if (rf.daily_rainfall_series && rf.daily_rainfall_series.length > 0) {
      charts.renderRainfallImpactChart('wellRainfallChartCanvas', rf.daily_rainfall_series);
    }

    // 4. Well Health Card & Recommendations
    const wh = data.well_health || {};
    const scoreNumEl = document.getElementById('wellHealthScoreNum');
    scoreNumEl.textContent = `${wh.score} / 100`;
    scoreNumEl.style.color = wh.color_code || '#10b981';

    document.getElementById('wellHealthStatusText').textContent = wh.status || 'Active';

    const catBadge = document.getElementById('wellHealthCategoryBadge');
    catBadge.textContent = d.status;
    catBadge.className = `status-pill ${d.status.toLowerCase().replace(' ', '-')}`;

    const recsList = document.getElementById('wellHealthRecsList');
    recsList.innerHTML = '';
    (wh.actionable_recommendations || []).forEach(rec => {
      const li = document.createElement('li');
      li.textContent = rec;
      recsList.appendChild(li);
    });

  } catch (err) {
    console.error(`Failed to load weather & health impact for ${stationCode}:`, err);
  }
}

async function loadStationsTable() {
  const res = await api.listWells({
    state: appState.filterState,
    district: appState.filterDistrict,
    status: appState.filterStatus,
    search: appState.searchQuery,
    page: appState.tablePage,
    pageSize: appState.tablePageSize
  });

  const tbody = document.getElementById('stationsTableBody');
  tbody.innerHTML = '';

  if (res.items.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 32px; color: var(--text-muted);">No groundwater stations found matching current criteria.</td></tr>`;
    document.getElementById('tablePageInfo').textContent = 'Page 0 of 0';
    return;
  }

  res.items.forEach(w => {
    const tr = document.createElement('tr');
    tr.className = 'clickable-row';
    const slopeStr = w.trend_slope_m_per_year != null ? `${w.trend_slope_m_per_year > 0 ? '+' : ''}${w.trend_slope_m_per_year}` : '-';
    const statusSlug = w.status.toLowerCase().replace(' ', '-');
    tr.innerHTML = `
      <td><code>${w.station_code}</code></td>
      <td><strong>${w.station_name}</strong></td>
      <td>${w.state}</td>
      <td>${w.district}</td>
      <td>${w.latest_reading != null ? w.latest_reading + ' m' : '-'}</td>
      <td>${slopeStr}</td>
      <td><span class="status-pill ${statusSlug}">${w.status}</span></td>
      <td>
        <button class="btn-secondary inspect-btn" data-code="${w.station_code}" style="padding: 4px 8px; font-size: 0.76rem;">Select Well</button>
      </td>
    `;

    // Make row clickable
    tr.addEventListener('click', (e) => {
      // Don't double trigger if inspect-btn was directly clicked
      if (e.target.closest('.inspect-btn')) return;
      syncSelectedWellContext(w.station_code);
      handleStationSelection(w.station_code);
      switchTab('geo-view', `Geospatial Map Explorer · ${w.station_name}`);
    });

    tbody.appendChild(tr);
  });

  document.querySelectorAll('.inspect-btn').forEach(btn => {
    btn.onclick = () => {
      const code = btn.getAttribute('data-code');
      syncSelectedWellContext(code);
      handleStationSelection(code);
      switchTab('geo-view', 'Geospatial Map Explorer');
    };
  });

  document.getElementById('tablePageInfo').textContent = `Page ${res.page} of ${res.total_pages} (${res.total.toLocaleString()} monitoring wells)`;
  document.getElementById('prevPageBtn').disabled = res.page <= 1;
  document.getElementById('nextPageBtn').disabled = res.page >= res.total_pages;
}

async function loadStateAnalytics() {
  const states = await api.getStateStats();
  appState.statesData = states;

  const tbody = document.getElementById('stateAnalyticsTableBody');
  tbody.innerHTML = '';
  states.forEach(s => {
    const tr = document.createElement('tr');
    tr.className = 'clickable-row';
    tr.title = `Click to filter map and stations for ${s.state}`;
    tr.innerHTML = `
      <td><strong>${s.state} ↗</strong></td>
      <td>${s.well_count.toLocaleString()}</td>
      <td>${s.avg_depth_mbgl} mbgl</td>
      <td>${s.avg_recharge_m} m</td>
      <td>${s.avg_specific_yield}</td>
      <td><span style="color: ${s.over_exploited_pct > 20 ? 'var(--status-over)' : 'inherit'}; font-weight: 700;">${s.over_exploited_pct}%</span></td>
    `;

    tr.addEventListener('click', async () => {
      appState.filterState = s.state;
      const mapFilter = document.getElementById('mapFilterState');
      const tableFilter = document.getElementById('tableFilterState');
      if (mapFilter) mapFilter.value = s.state;
      if (tableFilter) tableFilter.value = s.state;
      appState.tablePage = 1;
      await reloadMapData();
      await loadStationsTable();
      switchTab('geo-view', `Geospatial Map Explorer · ${s.state}`);
    });

    tbody.appendChild(tr);
  });

  // Render Horizontal State Bar Chart
  charts.renderStateBarChart('stateComparisonCanvas', states);
}

async function loadDWLRTelemetry() {
  try {
    const status = await api.getDWLRStatus();
    appState.dwlrData = status;

    const timeStr = status.last_update_local ? new Date(status.last_update_local).toLocaleTimeString() : 'Recent';
    document.getElementById('dwlrLastSync').textContent = timeStr;
    document.getElementById('dwlrSyncStatus').textContent = status.status || 'ONLINE';

    const tbody = document.getElementById('dwlrTableBody');
    tbody.innerHTML = '';

    const proofList = status.proof_of_6hour_intervals || [];
    if (proofList.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 24px; color: var(--text-muted);">No DWLR telemetry records cached yet. Click 'Sync DWLR Telemetry'.</td></tr>`;
      return;
    }

    proofList.forEach(item => {
      const tr = document.createElement('tr');
      tr.className = 'clickable-row';
      tr.title = `Click to inspect telemetry station ${item.station_name}`;
      tr.innerHTML = `
        <td><code>${item.station_code}</code></td>
        <td><strong>${item.station_name}</strong></td>
        <td><span style="font-family: var(--font-mono); color: var(--accent-cyan); font-weight: 600;">${item.timestamp}</span></td>
        <td>${item.water_level_mbgl != null ? item.water_level_mbgl + ' m' : 'N/A'}</td>
        <td><span class="status-pill safe">${item.mode || 'Telemetric'}</span></td>
        <td>India-WRIS GPRS</td>
      `;

      tr.addEventListener('click', () => {
        if (item.station_code) {
          syncSelectedWellContext(item.station_code);
          handleStationSelection(item.station_code);
          switchTab('geo-view', `Geospatial Map Explorer · ${item.station_name}`);
        }
      });

      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error('Failed to load DWLR telemetry:', err);
  }
}

function setupNavigation() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      const target = item.getAttribute('data-target');
      const title = item.getAttribute('data-title') || 'Dashboard';
      switchTab(target, title);
    });
  });
}

function switchTab(targetId, title) {
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-target') === targetId);
  });
  document.querySelectorAll('.view-viewport').forEach(view => {
    view.classList.toggle('active', view.id === targetId);
  });
  appState.currentTab = targetId;

  if (title) {
    document.getElementById('breadcrumbCurrent').textContent = title;
  }

  if (targetId === 'geo-view') {
    mapController.switchView('2d');
  } else if (targetId === 'analytics-view') {
    // Explicit re-render after tab becomes visible to ensure exact canvas layout
    setTimeout(() => {
      if (appState.statesData.length > 0) {
        charts.renderStateBarChart('stateComparisonCanvas', appState.statesData);
      }
    }, 60);
  } else if (targetId === 'dwlr-view') {
    loadDWLRTelemetry();
  } else if (targetId === 'calculator-view' && appState.selectedWell) {
    updateCalculatorWithWell(appState.selectedWell);
  } else if (targetId === 'risk-view' && appState.selectedWell) {
    updateRiskAndWeatherWithWell(appState.selectedStationCode, appState.selectedWell);
  }
}

function setupEventListeners() {
  // Global Well Selector Dropdown in Topbar
  const wellSelector = document.getElementById('globalWellSelector');
  if (wellSelector) {
    wellSelector.addEventListener('change', (e) => {
      const code = e.target.value;
      if (code) {
        syncSelectedWellContext(code);
      }
    });
  }

  // Quick Pick Stressed Well Button (e.g. GW-0157 Eluru-pz, 31.25 mbgl, Over-Exploited)
  const btnPickStressed = document.getElementById('btnPickStressed');
  if (btnPickStressed) {
    btnPickStressed.addEventListener('click', () => {
      syncSelectedWellContext('GW-0157');
    });
  }

  // Quick Pick Healthy Well Button (GW-0001 Alampur)
  const btnPickHealthy = document.getElementById('btnPickHealthy');
  if (btnPickHealthy) {
    btnPickHealthy.addEventListener('click', () => {
      syncSelectedWellContext('GW-0001');
    });
  }

  // Drawer shortcut buttons
  const btnDrawerCalc = document.getElementById('btnDrawerRunCalculator');
  if (btnDrawerCalc) {
    btnDrawerCalc.addEventListener('click', () => {
      switchTab('calculator-view', 'GEC-2015 Dynamic Recharge Calculator');
    });
  }

  const btnDrawerHealth = document.getElementById('btnDrawerRunHealth');
  if (btnDrawerHealth) {
    btnDrawerHealth.addEventListener('click', () => {
      switchTab('risk-view', 'Aquifer Depletion & Health Diagnostic Engine');
    });
  }

  // Sidebar Collapse Toggle
  const sidebar = document.getElementById('appSidebar');
  const toggleBtn = document.getElementById('sidebarToggleBtn');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      const isNowCollapsed = sidebar.classList.toggle('collapsed');
      if (isNowCollapsed) {
        sidebar.style.width = '';
      } else {
        const saved = localStorage.getItem('cgwb_sidebar_width');
        sidebar.style.width = saved ? `${saved}px` : '380px';
      }
      setTimeout(() => {
        if (mapController.leafletMap) mapController.leafletMap.invalidateSize();
      }, 250);
    });
  }

  // Topbar Telemetry Sync Button
  const syncBtn = document.getElementById('btnSyncTelemetry');
  if (syncBtn) {
    syncBtn.addEventListener('click', async () => {
      syncBtn.disabled = true;
      syncBtn.innerHTML = `<span>Syncing...</span>`;
      try {
        await api.triggerDWLRSync();
        await loadDWLRTelemetry();
        alert('DWLR 6-hour telemetric dataset refreshed successfully!');
      } catch (err) {
        alert(`Sync error: ${err.message}`);
      } finally {
        syncBtn.disabled = false;
        syncBtn.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
          <span>Sync DWLR Telemetry</span>
        `;
      }
    });
  }

  const refreshBtn = document.getElementById('btnDwlrRefresh');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', loadDWLRTelemetry);
  }

  // Map 2D vs 3D View Toggle
  document.getElementById('btnView2D').addEventListener('click', () => {
    document.getElementById('btnView2D').classList.add('active');
    document.getElementById('btnView3D').classList.remove('active');
    mapController.switchView('2d');
  });

  document.getElementById('btnView3D').addEventListener('click', () => {
    document.getElementById('btnView3D').classList.add('active');
    document.getElementById('btnView2D').classList.remove('active');
    mapController.switchView('3d');
  });

  // Map Filters
  document.getElementById('mapFilterState').addEventListener('change', async (e) => {
    appState.filterState = e.target.value;
    await reloadMapData();
  });

  document.getElementById('mapFilterStatus').addEventListener('change', async (e) => {
    appState.filterStatus = e.target.value;
    await reloadMapData();
  });

  // Table Filters
  document.getElementById('tableFilterState').addEventListener('change', async (e) => {
    appState.filterState = e.target.value;
    appState.tablePage = 1;
    await loadStationsTable();
  });

  document.getElementById('tableFilterStatus').addEventListener('change', async (e) => {
    appState.filterStatus = e.target.value;
    appState.tablePage = 1;
    await loadStationsTable();
  });

  const searchInput = document.getElementById('tableSearchInput');
  let searchDebounce = null;
  searchInput.addEventListener('input', (e) => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(async () => {
      appState.searchQuery = e.target.value;
      appState.tablePage = 1;
      await loadStationsTable();
    }, 280);
  });

  // Pagination
  document.getElementById('prevPageBtn').addEventListener('click', async () => {
    if (appState.tablePage > 1) {
      appState.tablePage--;
      await loadStationsTable();
    }
  });

  document.getElementById('nextPageBtn').addEventListener('click', async () => {
    appState.tablePage++;
    await loadStationsTable();
  });

  // Macro Metrics Ribbon (Clickable Navigation & Filters)
  document.querySelectorAll('.metric-tile').forEach(tile => {
    tile.addEventListener('click', async () => {
      const target = tile.getAttribute('data-target');
      const title = tile.getAttribute('data-title');
      const filterStatus = tile.getAttribute('data-filter-status');

      if (filterStatus) {
        appState.filterStatus = filterStatus;
        const mapFilter = document.getElementById('mapFilterStatus');
        const tableFilter = document.getElementById('tableFilterStatus');
        if (mapFilter) mapFilter.value = filterStatus;
        if (tableFilter) tableFilter.value = filterStatus;
        appState.tablePage = 1;
        await reloadMapData();
        await loadStationsTable();
      }

      if (target) {
        switchTab(target, title);
      }
    });
  });

  // Map Legend (Click to Filter Map & Stations Table)
  document.querySelectorAll('.map-legend-row-clickable').forEach(row => {
    row.addEventListener('click', async () => {
      const status = row.getAttribute('data-status');
      if (status) {
        appState.filterStatus = status;
        const mapFilter = document.getElementById('mapFilterStatus');
        const tableFilter = document.getElementById('tableFilterStatus');
        if (mapFilter) mapFilter.value = status;
        if (tableFilter) tableFilter.value = status;
        appState.tablePage = 1;
        await reloadMapData();
        await loadStationsTable();
      }
    });
  });

  const btnResetLegend = document.getElementById('btnResetMapStatusFilter');
  if (btnResetLegend) {
    btnResetLegend.addEventListener('click', async () => {
      appState.filterStatus = '';
      const mapFilter = document.getElementById('mapFilterStatus');
      const tableFilter = document.getElementById('tableFilterStatus');
      if (mapFilter) mapFilter.value = '';
      if (tableFilter) tableFilter.value = '';
      appState.tablePage = 1;
      await reloadMapData();
      await loadStationsTable();
    });
  }

  // Location Trace Banner Buttons: Navigate & Focus
  const btnCalcLocate = document.getElementById('btnCalcLocateMap');
  if (btnCalcLocate) {
    btnCalcLocate.addEventListener('click', () => {
      if (appState.selectedWell) {
        switchTab('geo-view', 'Geospatial Map Explorer');
        mapController.flyToStation(appState.selectedWell.latitude, appState.selectedWell.longitude);
        document.getElementById('stationDrawer').classList.remove('collapsed');
      }
    });
  }

  const btnCalcHealth = document.getElementById('btnCalcViewHealth');
  if (btnCalcHealth) {
    btnCalcHealth.addEventListener('click', () => {
      switchTab('risk-view', 'Aquifer Depletion & Health Diagnostic Engine');
    });
  }

  const btnRiskLocate = document.getElementById('btnRiskLocateMap');
  if (btnRiskLocate) {
    btnRiskLocate.addEventListener('click', () => {
      if (appState.selectedWell) {
        switchTab('geo-view', 'Geospatial Map Explorer');
        mapController.flyToStation(appState.selectedWell.latitude, appState.selectedWell.longitude);
        document.getElementById('stationDrawer').classList.remove('collapsed');
      }
    });
  }

  const btnRiskCalc = document.getElementById('btnRiskOpenCalc');
  if (btnRiskCalc) {
    btnRiskCalc.addEventListener('click', () => {
      switchTab('calculator-view', 'GEC-2015 Dynamic Recharge Calculator');
    });
  }

  // Catchment Area Preset Chips
  document.querySelectorAll('.preset-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const area = chip.getAttribute('data-area');
      if (area) {
        document.getElementById('calcArea').value = area;
        document.querySelectorAll('.preset-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        triggerRechargeCalculation();
      }
    });
  });

  // Real-Time Recharge Calculation function & input debouncer
  const triggerRechargeCalculation = async () => {
    const area = document.getElementById('calcArea').value;
    const sy = document.getElementById('calcSy').value;
    const deltaH = document.getElementById('calcDeltaH').value;
    if (!area || !sy || !deltaH) return;

    try {
      const res = await api.calculateRecharge({
        areaSqKm: area,
        specificYield: sy,
        deltaHMeters: deltaH
      });

      document.getElementById('calcResultBox').style.display = 'block';
      document.getElementById('resHam').textContent = `${res.recharge_volume_ham.toLocaleString()} ham`;
      document.getElementById('resMcm').textContent = `${res.recharge_volume_mcm.toLocaleString()} MCM`;
      document.getElementById('resDepth').textContent = `${res.recharge_depth_mm} mm`;
      const wellName = appState.selectedWell ? appState.selectedWell.station_name : 'Selected Catchment';
      document.getElementById('resInterp').textContent = `Catchment evaluation for ${wellName}: ${res.interpretation}`;
    } catch (err) {
      console.warn('Live recharge calc error:', err);
    }
  };

  let calcDebounce = null;
  ['calcArea', 'calcSy', 'calcDeltaH'].forEach(id => {
    const input = document.getElementById(id);
    if (input) {
      input.addEventListener('input', () => {
        clearTimeout(calcDebounce);
        calcDebounce = setTimeout(triggerRechargeCalculation, 150);
      });
    }
  });

  // Drawer Close (if button exists)
  const closeBtn = document.getElementById('closeDrawerBtn');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      document.getElementById('stationDrawer')?.classList.add('collapsed');
    });
  }

  // Recharge Calculator Form Manual Submit
  const calcForm = document.getElementById('rechargeCalcForm');
  calcForm.addEventListener('submit', (e) => {
    e.preventDefault();
    triggerRechargeCalculation();
  });

  // Sidebar DWLR Sync Button
  const btnSidebarSync = document.getElementById('btnSidebarSyncDwlr');
  if (btnSidebarSync) {
    btnSidebarSync.addEventListener('click', async () => {
      btnSidebarSync.disabled = true;
      btnSidebarSync.textContent = 'Syncing...';
      try {
        await api.triggerDWLRSync();
        const dwlrData = await api.getDWLRStatus();
        const timeEl = document.getElementById('sidebarDwlrLastSync');
        if (timeEl && dwlrData) {
          const ts = dwlrData.last_sync_timestamp || dwlrData.timestamp || new Date().toISOString();
          timeEl.textContent = new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
        }
      } catch (e) {
        console.warn('DWLR sidebar sync error:', e);
      } finally {
        btnSidebarSync.disabled = false;
        btnSidebarSync.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg> Sync Now';
      }
    });
  }

  // Prediction Refresh Button
  const btnPred = document.getElementById('btnRefreshPrediction');
  if (btnPred) {
    btnPred.addEventListener('click', () => {
      if (appState.selectedStationCode) {
        loadAndRenderPrediction(appState.selectedStationCode);
      }
    });
  }
}

// Draggable Interactive Sidebar Width Resizer
function setupSidebarResizer() {
  const sidebar = document.getElementById('appSidebar');
  const handle = document.getElementById('sidebarResizeHandle');
  if (!sidebar || !handle) return;

  const minWidth = 280;
  const getMaxWidth = () => Math.min(800, window.innerWidth * 0.65);

  // Restore saved width on initial load
  const savedWidth = localStorage.getItem('cgwb_sidebar_width');
  if (savedWidth) {
    const parsed = parseInt(savedWidth, 10);
    if (!isNaN(parsed) && parsed >= minWidth && parsed <= getMaxWidth()) {
      if (!sidebar.classList.contains('collapsed')) {
        sidebar.style.width = `${parsed}px`;
      }
    }
  }

  let isDragging = false;
  let startX = 0;
  let startWidth = 0;

  const startDrag = (clientX) => {
    if (sidebar.classList.contains('collapsed')) return;
    isDragging = true;
    startX = clientX;
    startWidth = sidebar.getBoundingClientRect().width;
    document.body.classList.add('sidebar-resizing');
    sidebar.classList.add('resizing');
    handle.classList.add('active');
  };

  const onDrag = (clientX) => {
    if (!isDragging) return;
    const deltaX = clientX - startX;
    let newWidth = startWidth + deltaX;
    const maxWidth = getMaxWidth();
    if (newWidth < minWidth) newWidth = minWidth;
    if (newWidth > maxWidth) newWidth = maxWidth;

    sidebar.style.width = `${newWidth}px`;

    if (mapController.leafletMap) {
      mapController.leafletMap.invalidateSize();
    }
  };

  const endDrag = () => {
    if (!isDragging) return;
    isDragging = false;
    document.body.classList.remove('sidebar-resizing');
    sidebar.classList.remove('resizing');
    handle.classList.remove('active');

    const finalWidth = parseInt(sidebar.style.width, 10);
    if (!isNaN(finalWidth) && finalWidth >= minWidth) {
      localStorage.setItem('cgwb_sidebar_width', finalWidth);
    }

    if (mapController.leafletMap) {
      mapController.leafletMap.invalidateSize();
    }
  };

  handle.addEventListener('mousedown', (e) => {
    startDrag(e.clientX);
    e.preventDefault();
  });

  window.addEventListener('mousemove', (e) => {
    if (isDragging) {
      onDrag(e.clientX);
    }
  });

  window.addEventListener('mouseup', endDrag);

  // Touch Support for tablet/touch devices
  handle.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
      startDrag(e.touches[0].clientX);
    }
  }, { passive: true });

  window.addEventListener('touchmove', (e) => {
    if (isDragging && e.touches.length === 1) {
      onDrag(e.touches[0].clientX);
    }
  }, { passive: true });

  window.addEventListener('touchend', endDrag);
}

// Global 2,759 Wells Real-Time Search & Autocomplete (sidebar-mounted)
function setupGlobalWellSearch() {
  const searchInput = document.getElementById('globalWellSearchInput');
  const dropdownMenu = document.getElementById('globalWellSearchResults');
  const resultsList = document.getElementById('wellSearchResultsList');
  const statusText = document.getElementById('searchDropdownStatusText');
  const clearBtn = document.getElementById('btnClearWellSearch');

  if (!searchInput || !dropdownMenu || !resultsList) return;

  // Position the dropdown relative to the sidebar search wrap
  dropdownMenu.classList.add('sidebar-search-dropdown');
  resultsList.classList.add('sidebar-search-results-list');

  if (!searchInput || !dropdownMenu || !resultsList) return;

  let selectedIndex = -1;

  function highlightMatch(text, query) {
    if (!text) return '';
    if (!query) return text;
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escaped})`, 'gi');
    return text.replace(regex, '<mark>$1</mark>');
  }

  function filterAndRankWells(query) {
    const q = (query || '').trim().toLowerCase();
    const wells = appState.allWellsList || [];
    if (!q) {
      return wells.slice(0, 35);
    }

    const exact = [];
    const prefix = [];
    const substring = [];

    for (const w of wells) {
      const name = (w.station_name || '').toLowerCase();
      const code = (w.station_code || '').toLowerCase();
      const dist = (w.district || '').toLowerCase();
      const state = (w.state || '').toLowerCase();
      const village = (w.village || '').toLowerCase();
      const tehsil = (w.tehsil || '').toLowerCase();
      const block = (w.block || '').toLowerCase();
      // composite search string covers city/area names
      const allFields = `${name} ${code} ${dist} ${state} ${village} ${tehsil} ${block}`;

      if (name === q || code === q || dist === q || village === q) {
        exact.push(w);
      } else if (
        name.startsWith(q) || code.startsWith(q) ||
        dist.startsWith(q) || village.startsWith(q) || tehsil.startsWith(q)
      ) {
        prefix.push(w);
      } else if (allFields.includes(q)) {
        substring.push(w);
      }

      if (exact.length + prefix.length + substring.length >= 100) {
        break;
      }
    }

    return [...exact, ...prefix, ...substring].slice(0, 60);
  }

  function renderSearchResults(query) {
    const matches = filterAndRankWells(query);
    resultsList.innerHTML = '';
    selectedIndex = -1;

    if (statusText) {
      if (!query.trim()) {
        statusText.textContent = `All 2,759 Monitored Wells (Showing First ${matches.length})`;
      } else {
        statusText.textContent = `${matches.length} matching wells found for "${query}"`;
      }
    }

    if (matches.length === 0) {
      resultsList.innerHTML = `
        <div style="padding: 24px; text-align: center; color: var(--text-muted); font-size: 0.8rem;">
          No groundwater monitoring stations found matching "<strong>${query}</strong>" across all 2,759 benchmark wells.
        </div>
      `;
      return;
    }

    matches.forEach((w, idx) => {
      const item = document.createElement('div');
      item.className = 'search-result-item';
      item.setAttribute('data-code', w.station_code);
      item.setAttribute('data-index', idx);

      const statusSlug = (w.status || 'safe').toLowerCase().replace(' ', '-');
      const depthStr = w.latest_reading != null ? `${w.latest_reading} mbgl` : '';

      item.innerHTML = `
        <div class="search-result-main">
          <div class="search-result-name">
            ${highlightMatch(w.station_name, query)}
            <code style="font-family: var(--font-mono); font-size: 0.72rem; color: var(--accent-cyan); margin-left: 6px;">${highlightMatch(w.station_code, query)}</code>
          </div>
          <div class="search-result-meta">${highlightMatch(w.district, query)}, ${highlightMatch(w.state, query)}</div>
        </div>
        <div class="search-result-right">
          <span class="status-pill ${statusSlug}">${w.status}</span>
          <span class="search-result-depth">${depthStr}</span>
        </div>
      `;

      item.addEventListener('click', () => {
        selectWellFromSearch(w);
      });

      resultsList.appendChild(item);
    });
  }

  function selectWellFromSearch(w) {
    dropdownMenu.style.display = 'none';
    searchInput.value = `${w.station_code} · ${w.station_name} (${w.district}, ${w.state})`;
    if (clearBtn) clearBtn.style.display = 'block';

    syncSelectedWellContext(w.station_code);
    handleStationSelection(w.station_code);

    if (w.latitude && w.longitude) {
      mapController.flyToStation(w.latitude, w.longitude);
    }
  }

  // Input event with instant filtering
  searchInput.addEventListener('input', (e) => {
    const val = e.target.value;
    if (clearBtn) clearBtn.style.display = val ? 'block' : 'none';
    dropdownMenu.style.display = 'flex';
    renderSearchResults(val);
  });

  searchInput.addEventListener('focus', () => {
    dropdownMenu.style.display = 'flex';
    renderSearchResults(searchInput.value);
  });

  // Clear button
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      searchInput.value = '';
      clearBtn.style.display = 'none';
      renderSearchResults('');
      searchInput.focus();
    });
  }

  // Keyboard navigation
  searchInput.addEventListener('keydown', (e) => {
    const items = resultsList.querySelectorAll('.search-result-item');
    if (items.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
      updateSelectedItem(items);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedIndex = Math.max(selectedIndex - 1, 0);
      updateSelectedItem(items);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex >= 0 && selectedIndex < items.length) {
        items[selectedIndex].click();
      }
    } else if (e.key === 'Escape') {
      dropdownMenu.style.display = 'none';
    }
  });

  function updateSelectedItem(items) {
    items.forEach((item, idx) => {
      item.classList.toggle('selected', idx === selectedIndex);
      if (idx === selectedIndex) {
        item.scrollIntoView({ block: 'nearest' });
      }
    });
  }

  // Click outside to dismiss dropdown
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#globalWellSearchWrap')) {
      dropdownMenu.style.display = 'none';
    }
  });

  // Sidebar Quick Search Bar logic
  const sidebarInput = document.getElementById('sidebarStationSearchInput');
  const sidebarResults = document.getElementById('sidebarSearchResultsList');
  if (sidebarInput && sidebarResults) {
    sidebarInput.addEventListener('input', (e) => {
      const q = e.target.value.trim().toLowerCase();
      if (!q) {
        sidebarResults.style.display = 'none';
        return;
      }

      const matches = filterAndRankWells(q).slice(0, 15);
      sidebarResults.innerHTML = '';
      if (matches.length === 0) {
        sidebarResults.innerHTML = `<div style="padding: 10px; color: var(--text-muted); font-size: 0.72rem; text-align: center;">No matching wells found</div>`;
      } else {
        matches.forEach(w => {
          const row = document.createElement('div');
          row.className = 'search-result-item';
          row.style.padding = '6px 10px';
          row.innerHTML = `
            <div>
              <div style="font-weight: 600; font-size: 0.78rem; color: #fff;">${w.station_name}</div>
              <div style="font-size: 0.68rem; color: var(--text-secondary);">${w.district}, ${w.state} (${w.station_code})</div>
            </div>
            <span class="status-pill ${(w.status || 'safe').toLowerCase().replace(' ', '-')}" style="font-size: 0.65rem; padding: 2px 6px;">${w.status}</span>
          `;
          row.onclick = () => {
            selectWellFromSearch(w);
            sidebarResults.style.display = 'none';
            sidebarInput.value = '';
          };
          sidebarResults.appendChild(row);
        });
      }
      sidebarResults.style.display = 'flex';
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.sidebar-search-box-wrap')) {
        sidebarResults.style.display = 'none';
      }
    });
  }
}
