// Chart.js controllers for Groundwater Evaluation visualizations

let trendChartInstance = null;
let seasonalChartInstance = null;
let rechargeChartInstance = null;
let stateBarChartInstance = null;
let rainfallChartInstance = null;

export const charts = {
  renderHistoricalTrendChart(canvasId, timeSeries, trendSlope) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    if (trendChartInstance) {
      trendChartInstance.destroy();
    }

    const validPoints = timeSeries.filter(p => p.depth_mbgl !== null && p.depth_mbgl !== undefined);
    const labels = validPoints.map(p => p.quarter);
    const dataVals = validPoints.map(p => p.depth_mbgl);

    trendChartInstance = new Chart(canvas, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Depth to Water (mbgl)',
            data: dataVals,
            borderColor: '#06b6d4',
            backgroundColor: 'rgba(6, 182, 212, 0.12)',
            fill: true,
            tension: 0.25,
            pointRadius: 2,
            pointHoverRadius: 5,
            borderWidth: 2,
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
            ticks: { color: '#94a3b8', maxTicksLimit: 7, font: { size: 9 } }
          },
          y: {
            reverse: true, // Ground surface is at top (0 mbgl)
            title: { display: true, text: 'Depth (mbgl)', color: '#94a3b8', font: { size: 10 } },
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
            ticks: { color: '#94a3b8', font: { size: 10 } }
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => `Depth: ${ctx.parsed.y.toFixed(2)} mbgl`
            }
          }
        }
      }
    });
  },

  renderSeasonalChart(canvasId, seasonalAverages) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    if (seasonalChartInstance) {
      seasonalChartInstance.destroy();
    }

    const labels = ['Jan (Winter)', 'May (Pre-Monsoon)', 'Aug (Monsoon)', 'Nov (Post-Monsoon)'];
    const values = [
      seasonalAverages.Jan || 0,
      seasonalAverages.May || 0,
      seasonalAverages.Aug || 0,
      seasonalAverages.Nov || 0,
    ];

    seasonalChartInstance = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Avg Depth (mbgl)',
          data: values,
          backgroundColor: [
            'rgba(59, 130, 246, 0.65)',
            'rgba(239, 68, 68, 0.65)',
            'rgba(16, 185, 129, 0.65)',
            'rgba(6, 182, 212, 0.65)',
          ],
          borderColor: [
            '#3b82f6',
            '#ef4444',
            '#10b981',
            '#06b6d4',
          ],
          borderWidth: 1,
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            ticks: { color: '#94a3b8', font: { size: 9 } },
            grid: { display: false }
          },
          y: {
            reverse: true,
            ticks: { color: '#94a3b8', font: { size: 9 } },
            grid: { color: 'rgba(255, 255, 255, 0.05)' }
          }
        },
        plugins: {
          legend: { display: false }
        }
      }
    });
  },

  renderRechargeHistoryChart(canvasId, rechargeHistory) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    if (rechargeChartInstance) {
      rechargeChartInstance.destroy();
    }

    const validHistory = rechargeHistory.filter(h => h.delta_h !== null);
    const labels = validHistory.map(h => h.year);
    const deltas = validHistory.map(h => h.delta_h);

    rechargeChartInstance = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Monsoon Recharge Δh (m)',
          data: deltas,
          backgroundColor: deltas.map(v => v >= 0 ? 'rgba(16, 185, 129, 0.75)' : 'rgba(239, 68, 68, 0.75)'),
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            ticks: { color: '#94a3b8', maxTicksLimit: 7, font: { size: 9 } },
            grid: { display: false }
          },
          y: {
            title: { display: true, text: 'Rise in Water Table (m)', color: '#94a3b8', font: { size: 9 } },
            ticks: { color: '#94a3b8', font: { size: 9 } },
            grid: { color: 'rgba(255, 255, 255, 0.05)' }
          }
        },
        plugins: {
          legend: { display: false }
        }
      }
    });
  },

  // State-wise Comparison Chart (Horizontal Bar Chart for clarity & high readability)
  renderStateBarChart(canvasId, stateStats) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    if (stateBarChartInstance) {
      stateBarChartInstance.destroy();
    }

    // Sort states by average water table depth (highest depth at top)
    const sortedStates = [...stateStats].sort((a, b) => b.avg_depth_mbgl - a.avg_depth_mbgl);
    const labels = sortedStates.map(s => s.state);
    const depths = sortedStates.map(s => s.avg_depth_mbgl);
    const recharges = sortedStates.map(s => s.avg_recharge_m);

    stateBarChartInstance = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Avg Water Depth (mbgl)',
            data: depths,
            backgroundColor: 'rgba(245, 158, 11, 0.85)',
            borderColor: '#f59e0b',
            borderWidth: 1,
            borderRadius: 4,
            barPercentage: 0.7,
            categoryPercentage: 0.8,
          },
          {
            label: 'Avg Monsoon Recharge (m)',
            data: recharges,
            backgroundColor: 'rgba(16, 185, 129, 0.85)',
            borderColor: '#10b981',
            borderWidth: 1,
            borderRadius: 4,
            barPercentage: 0.7,
            categoryPercentage: 0.8,
          }
        ]
      },
      options: {
        indexAxis: 'y', // Horizontal bars: perfect for all 19 state names!
        responsive: true,
        maintainAspectRatio: false,
        layout: {
          padding: { left: 10, right: 20, top: 10, bottom: 10 }
        },
        scales: {
          x: {
            title: {
              display: true,
              text: 'Meters (mbgl / Recharge)',
              color: '#94a3b8',
              font: { size: 11, weight: '600' }
            },
            ticks: { color: '#94a3b8', font: { size: 10 } },
            grid: { color: 'rgba(255, 255, 255, 0.06)' }
          },
          y: {
            ticks: {
              color: '#f8fafc',
              font: { size: 11, weight: '600' },
              autoSkip: false
            },
            grid: { display: false }
          }
        },
        plugins: {
          legend: {
            position: 'top',
            labels: {
              color: '#f8fafc',
              font: { size: 12, weight: '600' },
              boxWidth: 14,
              padding: 16
            }
          },
          tooltip: {
            callbacks: {
              label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.x.toFixed(2)} m`
            }
          }
        }
      }
    });
  },

  // Real-time Open-Meteo 14-Day Rainfall Impact Chart
  renderRainfallImpactChart(canvasId, dailyRainfallSeries) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    if (rainfallChartInstance) {
      rainfallChartInstance.destroy();
    }

    const labels = dailyRainfallSeries.map(d => d.date.slice(5)); // 'MM-DD'
    const values = dailyRainfallSeries.map(d => d.precipitation_mm);
    const colors = dailyRainfallSeries.map(d => d.type === 'Observed' ? 'rgba(6, 182, 212, 0.85)' : 'rgba(16, 185, 129, 0.85)');

    rainfallChartInstance = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Precipitation (mm)',
          data: values,
          backgroundColor: colors,
          borderRadius: 4,
          borderWidth: 1,
          borderColor: dailyRainfallSeries.map(d => d.type === 'Observed' ? '#06b6d4' : '#10b981')
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            ticks: { color: '#94a3b8', font: { size: 10 } },
            grid: { display: false }
          },
          y: {
            title: { display: true, text: 'Rainfall (mm)', color: '#94a3b8', font: { size: 10 } },
            ticks: { color: '#94a3b8', font: { size: 10 } },
            grid: { color: 'rgba(255, 255, 255, 0.05)' }
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              afterLabel: (ctx) => {
                const item = dailyRainfallSeries[ctx.dataIndex];
                return `Status: ${item.type} | Max Temp: ${item.max_temp_c != null ? item.max_temp_c + '°C' : 'N/A'}`;
              }
            }
          }
        }
      }
    });
  }
};
