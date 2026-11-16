// Geospatial Map Controller: Dual-mode 2D Leaflet & 3D Cesium Globe

let leafletMap = null;
let leafletMarkersLayer = null;
let cesiumViewer = null;
let onStationSelectCallback = null;
let currentGeoJson = null;

const STATUS_COLORS = {
  'Safe': '#10b981',
  'Semi-Critical': '#f59e0b',
  'Critical': '#f97316',
  'Over-Exploited': '#ef4444'
};

export const mapController = {
  get leafletMap() { return leafletMap; },
  get cesiumViewer() { return cesiumViewer; },
  init(onSelect) {
    onStationSelectCallback = onSelect;
    this.initLeaflet();
  },

  initLeaflet() {
    if (leafletMap) return;

    // Centered on central India
    leafletMap = L.map('leafletMap', {
      center: [22.5, 79.5],
      zoom: 5,
      zoomControl: true,
      preferCanvas: true
    });

    // Dark high-contrast basemap (Esri World Dark Gray Canvas - free & no watermark/API key)
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
      attribution: '&copy; Esri, DeLorme, NAVTEQ, &copy; OpenStreetMap contributors',
      maxZoom: 19,
      maxNativeZoom: 16
    }).addTo(leafletMap);

    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}', {
      attribution: '',
      maxZoom: 19,
      maxNativeZoom: 16
    }).addTo(leafletMap);

    leafletMarkersLayer = L.layerGroup().addTo(leafletMap);
    window.leafletMap = leafletMap;
  },

  initCesium() {
    if (cesiumViewer || typeof Cesium === 'undefined') return;

    try {
      cesiumViewer = new Cesium.Viewer('cesiumGlobe', {
        terrainProvider: undefined,
        baseLayerPicker: false,
        geocoder: false,
        homeButton: false,
        infoBox: false,
        sceneModePicker: false,
        selectionIndicator: false,
        timeline: false,
        animation: false,
        navigationHelpButton: false,
        fullscreenButton: false,
        imageryProvider: new Cesium.UrlTemplateImageryProvider({
          url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
          maximumLevel: 16
        })
      });

      window.cesiumViewer = cesiumViewer;

      // Disable depth testing against terrain so points are never occluded by globe surface
      if (cesiumViewer.scene && cesiumViewer.scene.globe) {
        cesiumViewer.scene.globe.depthTestAgainstTerrain = false;
      }

      // Fly to India
      cesiumViewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(79.0, 21.0, 4000000),
        duration: 1.5
      });

      // High-precision tolerance picker: checks surrounding area so user never needs pixel-perfect aim
      const pickStationEntity = (position, tolerance = 14) => {
        if (!cesiumViewer || !cesiumViewer.scene) return null;

        // 1. DrillPick with bounding box first
        try {
          const list = cesiumViewer.scene.drillPick(position, 6, tolerance * 2, tolerance * 2);
          if (list && list.length > 0) {
            for (const item of list) {
              if (Cesium.defined(item) && item.id && item.id.properties) {
                return item.id;
              }
            }
          }
        } catch (_) {}

        // 2. Exact single pick
        const direct = cesiumViewer.scene.pick(position);
        if (Cesium.defined(direct) && direct.id && direct.id.properties) {
          return direct.id;
        }

        // 3. Radial neighborhood scan (tests points in circles around click)
        const rads = [4, 8, 12, 16];
        const angles = [0, 45, 90, 135, 180, 225, 270, 315];
        for (const r of rads) {
          for (const a of angles) {
            const rad = (a * Math.PI) / 180;
            const px = position.x + Math.round(r * Math.cos(rad));
            const py = position.y + Math.round(r * Math.sin(rad));
            const candidate = cesiumViewer.scene.pick(new Cesium.Cartesian2(px, py));
            if (Cesium.defined(candidate) && candidate.id && candidate.id.properties) {
              return candidate.id;
            }
          }
        }
        return null;
      };

      let hoveredEntity = null;
      let prevBaseSize = 11;
      let prevOutlineColor = Cesium.Color.WHITE;
      let prevOutlineWidth = 2;

      const handler = new Cesium.ScreenSpaceEventHandler(cesiumViewer.scene.canvas);

      // Mouse Move: Pointer cursor & dynamic hover enlargement on globe
      handler.setInputAction((movement) => {
        const entity = pickStationEntity(movement.endPosition, 10);
        if (entity && entity.point) {
          cesiumViewer.scene.canvas.style.cursor = 'pointer';
          if (hoveredEntity !== entity) {
            if (hoveredEntity && hoveredEntity.point) {
              hoveredEntity.point.pixelSize = prevBaseSize;
              hoveredEntity.point.outlineColor = prevOutlineColor;
              hoveredEntity.point.outlineWidth = prevOutlineWidth;
            }
            hoveredEntity = entity;
            prevBaseSize = entity.point.pixelSize.getValue(Cesium.JulianDate.now()) || 11;
            prevOutlineColor = entity.point.outlineColor.getValue(Cesium.JulianDate.now()) || Cesium.Color.WHITE;
            prevOutlineWidth = entity.point.outlineWidth.getValue(Cesium.JulianDate.now()) || 2;

            entity.point.pixelSize = prevBaseSize + 7; // Expands visibly on hover
            entity.point.outlineColor = Cesium.Color.fromCssColorString('#38bdf8');
            entity.point.outlineWidth = 3.5;
          }
        } else {
          cesiumViewer.scene.canvas.style.cursor = 'default';
          if (hoveredEntity && hoveredEntity.point) {
            hoveredEntity.point.pixelSize = prevBaseSize;
            hoveredEntity.point.outlineColor = prevOutlineColor;
            hoveredEntity.point.outlineWidth = prevOutlineWidth;
            hoveredEntity = null;
          }
        }
      }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

      // Left Click: Easily registers clicks even within generous radius
      handler.setInputAction((movement) => {
        const entity = pickStationEntity(movement.position, 16);
        if (entity && entity.properties) {
          const props = entity.properties.getValue(Cesium.JulianDate.now());
          if (props && props.station_code && onStationSelectCallback) {
            onStationSelectCallback(props.station_code);
          }
        }
      }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

      if (currentGeoJson) {
        this.renderCesiumFeatures(currentGeoJson);
      }
    } catch (e) {
      console.warn("Cesium initialization note:", e);
    }
  },

  switchView(mode) {
    const leafletElem = document.getElementById('leafletMap');
    const cesiumElem = document.getElementById('cesiumGlobe');

    if (mode === '3d') {
      leafletElem.style.display = 'none';
      cesiumElem.style.display = 'block';
      if (!cesiumViewer) {
        this.initCesium();
      } else {
        cesiumViewer.resize();
      }
    } else {
      cesiumElem.style.display = 'none';
      leafletElem.style.display = 'block';
      if (leafletMap) {
        leafletMap.invalidateSize();
      }
    }
  },

  renderGeoJSON(geojson) {
    currentGeoJson = geojson;
    this.renderLeafletFeatures(geojson);
    if (cesiumViewer) {
      this.renderCesiumFeatures(geojson);
    }
  },

  renderLeafletFeatures(geojson) {
    if (!leafletMarkersLayer) return;
    leafletMarkersLayer.clearLayers();

    const features = geojson.features || [];
    features.forEach((feat) => {
      const [lon, lat] = feat.geometry.coordinates;
      const props = feat.properties;
      const color = STATUS_COLORS[props.status] || '#10b981';
      const baseRadius = props.status === 'Over-Exploited' ? 8.5 : 6.5;

      const marker = L.circleMarker([lat, lon], {
        radius: baseRadius,
        fillColor: color,
        color: '#ffffff',
        weight: 1.5,
        opacity: 0.95,
        fillOpacity: 0.88,
        interactive: true,
        bubblingMouseEvents: false
      });

      // Hover feedback: Enlarge marker & bring to top for effortless targeting & clickability
      marker.on('mouseover', function () {
        this.setRadius(baseRadius + 3.5);
        this.setStyle({ weight: 2.5, color: '#38bdf8' });
        this.bringToFront();
      });

      marker.on('mouseout', function () {
        this.setRadius(baseRadius);
        this.setStyle({ weight: 1.5, color: '#ffffff' });
      });

      const popupContent = `
        <div style="font-family: var(--font-sans); min-width: 190px; color: #f8fafc; padding: 2px;">
          <div style="font-weight: 700; font-size: 0.95rem; margin-bottom: 2px; color: #fff;">${props.station_name}</div>
          <div style="font-size: 0.75rem; color: #94a3b8; margin-bottom: 8px;">${props.district}, ${props.state}</div>
          <div style="display: flex; justify-content: space-between; font-size: 0.8rem; margin-bottom: 4px;">
            <span style="color: #cbd5e1;">Current Depth:</span>
            <strong style="color: ${color}; font-family: monospace;">${props.latest_reading != null ? props.latest_reading + ' mbgl' : 'N/A'}</strong>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 0.8rem; margin-bottom: 4px;">
            <span style="color: #cbd5e1;">Status:</span>
            <strong style="color: ${color};">${props.status}</strong>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 0.8rem; margin-bottom: 10px;">
            <span style="color: #cbd5e1;">Trend Slope:</span>
            <strong style="color: #38bdf8; font-family: monospace;">${props.trend_slope_m_per_year != null ? (props.trend_slope_m_per_year > 0 ? '+' : '') + props.trend_slope_m_per_year + ' m/yr' : 'N/A'}</strong>
          </div>
          <button id="inspect-btn-${props.station_code}" 
                  style="width: 100%; padding: 7px; background: #0284c7; color: white; border: none; border-radius: 6px; font-weight: 600; cursor: pointer; font-size: 0.8rem; transition: background 0.2s;">
            Inspect Well in Sidebar →
          </button>
        </div>
      `;

      marker.bindPopup(popupContent);

      marker.on('popupopen', () => {
        const btn = document.getElementById(`inspect-btn-${props.station_code}`);
        if (btn && onStationSelectCallback) {
          btn.onclick = () => onStationSelectCallback(props.station_code);
        }
      });

      marker.on('click', () => {
        if (onStationSelectCallback) {
          onStationSelectCallback(props.station_code);
        }
      });

      leafletMarkersLayer.addLayer(marker);
    });
  },

  renderCesiumFeatures(geojson) {
    if (!cesiumViewer || typeof Cesium === 'undefined') return;

    cesiumViewer.entities.removeAll();
    const features = geojson.features || [];

    features.forEach((feat) => {
      const [lon, lat] = feat.geometry.coordinates;
      const props = feat.properties;
      const hexColor = STATUS_COLORS[props.status] || '#10b981';
      const cesiumColor = Cesium.Color.fromCssColorString(hexColor);
      const isOverExploited = props.status === 'Over-Exploited';

      cesiumViewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(lon, lat, 100),
        point: {
          pixelSize: isOverExploited ? 14 : 11,
          color: cesiumColor,
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 2.0,
          disableDepthTestDistance: Number.POSITIVE_INFINITY, // Guarantees point is never blocked by Earth surface and is always clickable
          scaleByDistance: new Cesium.NearFarScalar(1.0e3, 1.3, 8.0e6, 0.85)
        },
        properties: props,
      });
    });
  },

  flyToStation(lat, lon) {
    if (leafletMap) {
      leafletMap.flyTo([lat, lon], 12, { duration: 1.2 });
    }
    if (cesiumViewer && typeof Cesium !== 'undefined') {
      cesiumViewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(lon, lat, 25000),
        duration: 1.5
      });
    }
  }
};

