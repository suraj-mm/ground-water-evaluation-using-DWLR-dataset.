# CGWB HydroEval: Mathematical & Hydrogeological Calculation Guide

This document details the governing equations, scientific methodologies, hydrogeological norms, and parameters used to compute all analytical features in the **CGWB HydroEval** platform.

---

## 1. 22-Year Long-Term Depletion Rate ($\beta$)

### Purpose
Quantifies the multi-decadal groundwater storage trend across 92 monitoring quarters (2000–2022) to distinguish persistent secular depletion from cyclical seasonal fluctuations.

### Mathematical Formulation
The rate of depletion is derived via **Ordinary Least Squares (OLS) Linear Regression** between the decimal observation timeline $t_i$ and the measured water table depth $h_i$ (in meters below ground level, $\text{mbgl}$):

$$\beta = \frac{\sum_{i=1}^{N} (t_i - \bar{t})(h_i - \bar{h})}{\sum_{i=1}^{N} (t_i - \bar{t})^2}$$

where:
- $N$: Number of valid, quality-controlled quarterly observations ($N \le 92$). Minimum threshold for computation is set to $N \ge 6$.
- $t_i$: Decimal calendar year for each CGWB standard monitoring quarter:
  - $\text{Jan (Winter / Rabi)}: \text{Year} + 0.000$
  - $\text{May (Pre-Monsoon / Summer)}: \text{Year} + 0.333$
  - $\text{Aug (Monsoon)}: \text{Year} + 0.583$
  - $\text{Nov (Post-Monsoon)}: \text{Year} + 0.833$
- $h_i$: Water table depth in meters below ground level ($\text{mbgl}$).
- $\bar{t}, \bar{h}$: Sample means of the timeline and depth observations, respectively.

### Interpretation
- **$\beta > 0$**: The water table is deepening (groundwater depletion / storage loss).
- **$\beta < 0$**: The water table is shallowing (groundwater recovery / positive accretion).
- **$\beta \approx 0$**: Long-term hydrogeological equilibrium.

---

## 2. Annual Monsoon Recharge ($\Delta h$) via Water Level Fluctuation (WLF)

### Purpose
Measures the net seasonal vertical rise of the unconfined water table attributable to the South-West and North-East monsoon precipitation.

### Mathematical Formulation
For each annual hydrological cycle $y \in [2000, 2022]$:

$$\Delta h_y = h_{\text{May}, y} - h_{\text{Nov}, y}$$

where:
- $h_{\text{May}, y}$: Pre-monsoon water level depth ($\text{mbgl}$) observed in May of year $y$.
- $h_{\text{Nov}, y}$: Post-monsoon water level depth ($\text{mbgl}$) observed in November of year $y$.
- $\Delta h_y$: Net seasonal rise in water table elevation (in meters). Positive value indicates replenishment.

The long-term mean annual recharge rise is:

$$\overline{\Delta h} = \frac{1}{K} \sum_{y=1}^{K} \Delta h_y \quad (\text{for all years with concurrent May and Nov records})$$

---

## 3. Aquifer Risk Categorization Matrix

### Purpose
Classifies each of the 2,759 quality-controlled monitoring stations into operational vulnerability tiers combining contemporary water table depth ($h_{\text{latest}}$) and long-term depletion velocity ($\beta$).

### Classification Criteria

| Category | Mathematical Condition | Hydrogeological Significance |
| :--- | :--- | :--- |
| **Over-Exploited** | $(h > 20.0\text{ m} \land \beta > 0.15\text{ m/yr}) \lor (h > 35.0\text{ m}) \lor (\beta > 0.35\text{ m/yr})$ | Critical overdraft; extraction significantly exceeds replenishment. Deep wells at risk of desaturation. |
| **Critical** | $(h > 12.0\text{ m} \land \beta > 0.08\text{ m/yr}) \lor (h > 22.0\text{ m}) \lor (\beta > 0.20\text{ m/yr})$ | Significant groundwater stress; extraction closely approaches sustainable recharge limits. |
| **Semi-Critical** | $(h > 7.0\text{ m} \land \beta > 0.03\text{ m/yr}) \lor (h > 15.0\text{ m}) \lor (\beta > 0.10\text{ m/yr})$ | Cautious zone; moderate water table depth with noticeable declining trend. |
| **Safe** | *All other stations* | Sustainable extraction; stable or shallow water levels ($< 7\text{ mbgl}$). |

---

## 4. Dynamic Catchment Recharge Calculation

### Purpose
Computes the volumetric dynamic replenishable groundwater resource within a catchment or assessment unit.

### Mathematical Formulation

$$V_{\text{ham}} = 100 \times A \times \Delta h \times S_y$$

$$V_{\text{MCM}} = \frac{V_{\text{ham}}}{100} = A \times \Delta h \times S_y$$

$$D_{\text{recharge}} = \Delta h \times S_y \times 1000\text{ mm}$$

where:
- $A$: Surface assessment area in square kilometers ($\text{km}^2$).
- $\Delta h$: Water table fluctuation rise in meters ($\text{m}$).
- $S_y$: Specific Yield of the aquifer (dimensionless ratio, typically $0.01$ to $0.25$).
- $100$: Unit conversion factor ($1\text{ km}^2 \times 1\text{ m} = 10^6\text{ m}^3 = 100\text{ hectare-meters (ham)}$).
- $V_{\text{ham}}$: Recharge volume in hectare-meters ($\text{ham}$).
- $V_{\text{MCM}}$: Recharge volume in Million Cubic Meters ($\text{MCM}$).
- $D_{\text{recharge}}$: Equivalent spatial water column recharge depth in millimeters ($\text{mm}$).

---

## 5. Rainfall Infiltration Physics & Infiltration Factors (RIF)

### Purpose
Calculates the fraction of surface rainfall that percolates through the vadose zone to reach the saturated phreatic aquifer.

### Mathematical Formulation

$$R_{\text{infil}} = P \times \text{RIF}$$

$$\Delta h_{\text{infil}} = \frac{R_{\text{infil}}}{1000 \times S_y} = \frac{P \times \text{RIF}}{1000 \times S_y}$$

where:
- $P$: Total incident rainfall in millimeters ($\text{mm}$).
- $\text{RIF}$: Rainfall Infiltration Factor (dimensionless empirical percolation coefficient).
- $S_y$: Specific Yield of the underlying geological formation.
- $\Delta h_{\text{infil}}$: Resulting water table elevation rise in meters ($\text{m}$).

### Lithology Infiltration Factors ($RIF$ Table)

| Aquifer Hydrogeology | Infiltration Factor ($RIF$) | Typical Specific Yield ($S_y$) |
| :--- | :---: | :---: |
| **Alluvial Sand & Gravel** | $0.22$ ($22\%$) | $0.06 - 0.16$ |
| **Semi-Consolidated Sandstone** | $0.16$ ($16\%$) | $0.03 - 0.08$ |
| **Karstified Limestone** | $0.15$ ($15\%$) | $0.02 - 0.05$ |
| **Deccan Basalt (Vesicular / Fractured Trap)** | $0.12$ ($12\%$) | $0.015 - 0.035$ |
| **Fissured / Crystalline Hard Rock (Granite / Gneiss)** | $0.10$ ($10\%$) | $0.010 - 0.030$ |
| **Dense Quartzite / Schist** | $0.08$ ($8\%$) | $0.005 - 0.015$ |

---

## 6. Multi-Horizon Groundwater Level Prediction Engine ($\Delta h$)

### Purpose
Forecasts expected water table change ($\Delta h$) over six strategic planning horizons: **1 Week, 1 Month, 2 Months, 3 Months, 4 Months, and 6 Months**.

### Mathematical Formulation
The model couples atmospheric precipitation forecasts, climatological normals, hydrogeological infiltration, and seasonal irrigation extraction draft:

$$\Delta h_{\text{net}} = R_{\text{gross}} - D_{\text{draft}}$$

#### Component 1: Gross Infiltration Recharge ($R_{\text{gross}}$)

$$R_{\text{gross}} = \left( \frac{\text{RIF} \times P_{\text{horizon}}}{1000 \times S_y} \right) \times \eta_{\text{season}}$$

where:
- $P_{\text{horizon}}$:
  - **For 1-Week:** Real-time live cumulative 7-day precipitation forecast fetched from Open-Meteo API ($0.1^\circ$ resolution) for the well's coordinates $(\text{lat}, \text{lon})$.
  - **For 1 to 6 Months:** Climatological precipitation normals ($\bar{P}_m$) integrated over the forecast calendar months.
- $\eta_{\text{season}}$: Monthly seasonal recharge efficiency coefficient:
  - Peak Monsoon (July–August): $\eta = 1.45 - 1.50$ (saturated vadose zone, rapid preferential flow).
  - Post-Monsoon (September–October): $\eta = 1.05 - 1.30$.
  - Pre-Monsoon / Summer (March–May): $\eta = 0.50 - 0.65$ (dry soil moisture deficit, high surface evaporation).

#### Component 2: Baseline Extraction & Baseflow Draft ($D_{\text{draft}}$)

$$D_{\text{draft}} = \beta_{\text{base}} \times \left( \frac{t_{\text{days}}}{365.25} \right) \times \psi_{\text{draft}}$$

where:
- $\beta_{\text{base}}$: Baseline annual depletion trend of the well in meters/year ($\text{m/yr}$):
  $$\beta_{\text{base}} = \max(0.015, |\beta|)$$
- $t_{\text{days}}$: Horizon duration in days ($7, 30, 60, 90, 120, 180$).
- $\psi_{\text{draft}}$: Seasonal agricultural draft factor:
  - Rabi / Summer Season (January–May): $\psi = 1.30 - 1.50$ (heavy agricultural tube-well pumping).
  - Monsoon Season (July–August): $\psi = 0.40$ (minimal pumping due to surface water availability).

---

## 7. Water Quality (pH) Evaluation & Suitability

### Purpose
Evaluates groundwater hydrochemistry to provide actionable advisories for potable consumption and crop irrigation.

### Classification Thresholds

#### A. Potable / Drinking Water Suitability (WHO & BIS IS 10500:2012)
- **Drinkable (Safe):** $6.5 \le \text{pH} \le 8.5$
  - Compliant with Indian Standard IS 10500:2012 acceptable limit. Safe for direct human and livestock consumption.
- **Marginal (Caution):** $5.5 \le \text{pH} < 6.5 \quad \lor \quad 8.5 < \text{pH} \le 9.5$
  - Permissible in the absence of alternate sources. Recommended to filter or buffer before drinking.
- **Unsuitable (Hazardous):** $\text{pH} < 5.5 \quad \lor \quad \text{pH} > 9.5$
  - Corrosive acidity ($\text{pH} < 5.5$) or heavy caustic alkalinity ($\text{pH} > 9.5$). Unfit for potable consumption.

#### B. Agricultural / Irrigation Suitability (FAO Guidelines)
- **Suitable:** $6.0 \le \text{pH} \le 8.5$
  - Optimal soil nutrient bioavailability for major crops (paddy, wheat, pulses, sugarcane, vegetables).
- **Moderate:** $5.5 \le \text{pH} < 6.0 \quad \lor \quad 8.5 < \text{pH} \le 9.0$
  - Risk of micronutrient imbalance (aluminum/manganese toxicity under acid pH; zinc/iron deficiency under high pH). Soil amendments recommended (gypsum for alkaline water, agricultural lime for acidic water).
- **Unsuitable:** $\text{pH} < 5.5 \quad \lor \quad \text{pH} > 9.0$
  - Severe risk of soil degradation, sodicity hazards, and crop yield suppression.
