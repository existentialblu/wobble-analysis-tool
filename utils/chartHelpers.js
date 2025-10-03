/**
 * Chart data processing utilities
 */

/**
 * Calculates moving average for smoothing chart data
 */
export const movingAverage = (data, key, windowSize = 7) => {
  return data.map((point, idx) => {
    const start = Math.max(0, idx - Math.floor(windowSize / 2));
    const end = Math.min(data.length, idx + Math.ceil(windowSize / 2));
    const window = data.slice(start, end);
    const avg = window.reduce((sum, p) => sum + p[key], 0) / window.length;
    return { ...point, [`${key}Smooth`]: parseFloat(avg.toFixed(1)) };
  });
};

/**
 * Calculates dynamic Y-axis range with padding
 */
export const calculateYRange = (values, padding = 5, min = 0, max = 100) => {
  if (values.length === 0) return { min, max };
  const dataMin = Math.min(...values);
  const dataMax = Math.max(...values);
  return {
    min: Math.max(min, dataMin - padding),
    max: Math.min(max, dataMax + padding)
  };
};

/**
 * Prepares chart data from results
 */
export const prepareChartData = (results) => {
  return results.map(r => ({
    date: r.date.toLocaleDateString('en-US'),
    dateObj: r.date, // Keep original date object for comparisons
    flScore: parseFloat(r.flScore.toFixed(1)),
    periodicityIndex: parseFloat(r.periodicityIndex.toFixed(1)),
    regularityScore: parseFloat(r.regularityScore.toFixed(1)),
    eai: parseFloat(r.eai.toFixed(1)),
    composite: parseFloat((((r.flScore + r.periodicityIndex + r.regularityScore) / 3 + r.eai) / 2).toFixed(1))
  }));
};

/**
 * Applies moving average smoothing to all metrics
 */
export const smoothAllMetrics = (chartData) => {
  let smoothed = chartData;
  const metrics = ['flScore', 'regularityScore', 'periodicityIndex', 'eai', 'composite'];

  for (const metric of metrics) {
    smoothed = movingAverage(smoothed, metric);
  }

  return smoothed;
};
