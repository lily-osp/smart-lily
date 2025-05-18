// Visualization.js - Charts and Graphs for the Dashboard

// Cache for chart objects
const chartCache = new Map();

// Topic Chart Colors
const CHART_COLORS = [
  'rgb(54, 162, 235)',
  'rgb(255, 99, 132)',
  'rgb(75, 192, 192)',
  'rgb(255, 159, 64)',
  'rgb(153, 102, 255)',
  'rgb(255, 205, 86)',
  'rgb(201, 203, 207)'
];

// Initialize topic history chart 
function initTopicHistoryChart(canvasId, topic) {
  const ctx = document.getElementById(canvasId).getContext('2d');
  
  const chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        label: topic,
        backgroundColor: CHART_COLORS[0],
        borderColor: CHART_COLORS[0],
        data: [],
        fill: false,
        tension: 0.2
      }]
    },
    options: {
      responsive: true,
      scales: {
        x: {
          display: true,
          title: {
            display: true,
            text: 'Time'
          }
        },
        y: {
          display: true,
          title: {
            display: true,
            text: 'Value'
          }
        }
      },
      plugins: {
        title: {
          display: true,
          text: `Topic: ${topic}`
        },
        tooltip: {
          mode: 'index',
          intersect: false,
        }
      }
    }
  });
  
  chartCache.set(canvasId, chart);
  return chart;
}

// Initialize multi-topic comparison chart
function initComparisonChart(canvasId, topics) {
  const ctx = document.getElementById(canvasId).getContext('2d');
  
  const datasets = topics.map((topic, index) => {
    return {
      label: topic,
      backgroundColor: CHART_COLORS[index % CHART_COLORS.length],
      borderColor: CHART_COLORS[index % CHART_COLORS.length],
      data: [],
      fill: false
    };
  });
  
  const chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: datasets
    },
    options: {
      responsive: true,
      scales: {
        x: {
          display: true,
          title: {
            display: true,
            text: 'Time'
          }
        },
        y: {
          display: true,
          title: {
            display: true,
            text: 'Value'
          }
        }
      },
      plugins: {
        title: {
          display: true,
          text: 'Topic Comparison'
        },
        tooltip: {
          mode: 'index',
          intersect: false,
        }
      }
    }
  });
  
  chartCache.set(canvasId, chart);
  return chart;
}

// Initialize a gauge chart for real-time monitoring
function initGaugeChart(canvasId, topic, min = 0, max = 100) {
  const ctx = document.getElementById(canvasId).getContext('2d');
  
  const chart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Value', 'Remaining'],
      datasets: [{
        label: topic,
        data: [0, max],
        backgroundColor: [
          CHART_COLORS[0],
          'rgb(240, 240, 240)'
        ],
        borderWidth: 0
      }]
    },
    options: {
      circumference: 180,
      rotation: 270,
      responsive: true,
      plugins: {
        title: {
          display: true,
          text: topic
        },
        tooltip: {
          enabled: false
        }
      },
      cutout: '75%'
    }
  });
  
  // Store min/max with the chart for updates
  chart.min = min;
  chart.max = max;
  
  // Add center text plugin
  Chart.register({
    id: 'gaugeText',
    beforeDraw: function(chart) {
      if (chart.config.type !== 'doughnut') return;
      
      const width = chart.width;
      const height = chart.height;
      const ctx = chart.ctx;
      
      ctx.restore();
      
      // Value text
      const value = chart.data.datasets[0].data[0];
      const fontSize = (height / 114).toFixed(2);
      ctx.font = fontSize + "em sans-serif";
      ctx.textBaseline = "middle";
      
      const text = value.toFixed(1);
      const textX = Math.round((width - ctx.measureText(text).width) / 2);
      const textY = height * 0.68;
      
      ctx.fillStyle = "#333";
      ctx.fillText(text, textX, textY);
      ctx.save();
    }
  });
  
  chartCache.set(canvasId, chart);
  return chart;
}

// Update a topic history chart with new data
function updateTopicHistoryChart(canvasId, newData) {
  const chart = chartCache.get(canvasId);
  
  if (!chart) {
    console.error(`Chart ${canvasId} not found!`);
    return;
  }
  
  // Add new label (timestamp)
  const timeStr = new Date(newData.timestamp).toLocaleTimeString();
  chart.data.labels.push(timeStr);
  
  // Add new data point
  let value = newData.value;
  
  // Try to parse numeric values
  if (typeof value === 'string') {
    const parsedValue = parseFloat(value);
    if (!isNaN(parsedValue)) {
      value = parsedValue;
    }
  }
  
  chart.data.datasets[0].data.push(value);
  
  // Keep only the last 50 points for performance
  if (chart.data.labels.length > 50) {
    chart.data.labels.shift();
    chart.data.datasets[0].data.shift();
  }
  
  chart.update();
}

// Update gauge chart with new value
function updateGaugeChart(canvasId, value) {
  const chart = chartCache.get(canvasId);
  
  if (!chart) {
    console.error(`Gauge ${canvasId} not found!`);
    return;
  }
  
  // Parse the value if it's a string
  let numValue = value;
  if (typeof value === 'string') {
    numValue = parseFloat(value);
    if (isNaN(numValue)) {
      console.error('Cannot update gauge with non-numeric value:', value);
      return;
    }
  }
  
  // Clamp value between min and max
  numValue = Math.max(chart.min, Math.min(chart.max, numValue));
  
  // Update chart data
  chart.data.datasets[0].data = [numValue, chart.max - numValue];
  chart.update();
}

// Load topic history data from API
async function loadTopicHistory(topic, startTime, endTime) {
  try {
    // Build query string
    let url = `/api/history/${encodeURIComponent(topic)}`;
    const params = new URLSearchParams();
    
    if (startTime) {
      params.append('startTime', startTime.toISOString());
    }
    
    if (endTime) {
      params.append('endTime', endTime.toISOString());
    }
    
    const queryString = params.toString();
    if (queryString) {
      url += `?${queryString}`;
    }
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error loading topic history:', error);
    return [];
  }
}

// Populate a chart with historical data
async function populateChartWithHistory(canvasId, topic, startTime, endTime) {
  const history = await loadTopicHistory(topic, startTime, endTime);
  const chart = chartCache.get(canvasId);
  
  if (!chart || !history || history.length === 0) {
    return;
  }
  
  // Reset chart data
  chart.data.labels = [];
  chart.data.datasets[0].data = [];
  
  // Add historical data points
  history.forEach(point => {
    const timeStr = new Date(point.timestamp).toLocaleTimeString();
    chart.data.labels.push(timeStr);
    
    let value = point.payload;
    try {
      // Try to parse the payload as JSON
      const parsedPayload = JSON.parse(point.payload);
      if (typeof parsedPayload === 'object' && parsedPayload !== null) {
        // If it's an object, use the 'value' property if available
        value = parsedPayload.value !== undefined ? parsedPayload.value : parsedPayload;
      } else {
        value = parsedPayload;
      }
    } catch (e) {
      // If not JSON, try parsing as a number
      const parsedValue = parseFloat(point.payload);
      if (!isNaN(parsedValue)) {
        value = parsedValue;
      } else {
        value = point.payload;
      }
    }
    
    // Only add numeric values to the chart
    if (typeof value === 'number') {
      chart.data.datasets[0].data.push(value);
    }
  });
  
  chart.update();
}

// Export the functions
window.SmartLilyCharts = {
  initTopicHistoryChart,
  initComparisonChart,
  initGaugeChart,
  updateTopicHistoryChart,
  updateGaugeChart,
  loadTopicHistory,
  populateChartWithHistory
}; 