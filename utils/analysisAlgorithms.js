/**
 * Sleep Analysis Algorithms
 * Contains all the signal processing and analysis functions
 */

/**
 * Analyzes flow limitation from breath-by-breath flow data
 */
export const analyzeFlowLimitation = (flowData, samplingRate) => {
  const breaths = [];
  let inInspiration = false;
  let inspirationStart = 0;
  let currentBreath = null;

  for (let i = 1; i < flowData.length; i++) {
    if (flowData[i] > 0 && flowData[i-1] <= 0) {
      inspirationStart = i;
      inInspiration = true;
      currentBreath = {
        start: i,
        end: i,
        inspStart: inspirationStart,
        inspEnd: i,
        startTime: i / samplingRate
      };
      breaths.push(currentBreath);
    } else if (flowData[i] <= 0 && flowData[i-1] > 0) {
      if (inInspiration && currentBreath) {
        currentBreath.inspEnd = i;
        currentBreath.end = i;
        currentBreath.endTime = i / samplingRate;
      }
      inInspiration = false;
    }
  }

  const flScores = [];

  for (const breath of breaths) {
    const inspFlow = flowData.slice(breath.inspStart, breath.inspEnd);
    if (inspFlow.length < 10) continue;

    const maxFlow = Math.max(...inspFlow);
    if (maxFlow < 0.1) continue;

    const normalizedFlow = inspFlow.map(f => f / maxFlow);

    const topHalfStart = normalizedFlow.findIndex(f => f > 0.5);
    const topHalfEnd = normalizedFlow.length - [...normalizedFlow].reverse().findIndex(f => f > 0.5);

    if (topHalfStart >= 0 && topHalfEnd > topHalfStart) {
      const topHalf = normalizedFlow.slice(topHalfStart, topHalfEnd);
      const topHalfMean = topHalf.reduce((a, b) => a + b) / topHalf.length;
      const topHalfVariance = topHalf.reduce((sum, val) => {
        const diff = val - topHalfMean;
        return sum + diff * diff;
      }, 0) / topHalf.length;

      const flatness = Math.max(0, Math.min(100, (0.05 - topHalfVariance) / 0.05 * 100));
      flScores.push(flatness);
    }
  }

  return {
    flScore: flScores.length > 0 ? flScores.reduce((a, b) => a + b) / flScores.length : 0,
    breaths: breaths
  };
};

/**
 * Estimates arousal events from respiratory patterns
 */
export const estimateArousals = (breaths, flowData, samplingRate, totalDurationSeconds) => {
  if (breaths.length < 10) return 0;

  const breathMetrics = [];
  for (let i = 1; i < breaths.length; i++) {
    const breath = breaths[i];
    const prevBreath = breaths[i - 1];

    const breathDuration = breath.startTime - prevBreath.startTime;
    if (breathDuration <= 0 || breathDuration > 20) continue;

    const respiratoryRate = 60 / breathDuration;

    const inspFlow = flowData.slice(breath.inspStart, breath.inspEnd);
    const tidalVolume = inspFlow.reduce((sum, f) => sum + Math.abs(f), 0) / samplingRate;

    breathMetrics.push({
      time: breath.startTime,
      rate: respiratoryRate,
      volume: tidalVolume,
      breathIndex: i
    });
  }

  if (breathMetrics.length < 10) return 0;

  const baselineWindow = 120;
  const arousals = [];

  for (let i = 0; i < breathMetrics.length; i++) {
    const currentMetric = breathMetrics[i];

    const baselineStart = Math.max(0, i - Math.floor(baselineWindow / (60 / currentMetric.rate)));
    const baselineMetrics = breathMetrics.slice(baselineStart, i);

    if (baselineMetrics.length < 5) continue;

    const baselineRate = baselineMetrics.reduce((sum, m) => sum + m.rate, 0) / baselineMetrics.length;
    const baselineVolume = baselineMetrics.reduce((sum, m) => sum + m.volume, 0) / baselineMetrics.length;

    const rateIncrease = (currentMetric.rate - baselineRate) / baselineRate;
    const volumeIncrease = (currentMetric.volume - baselineVolume) / baselineVolume;

    if (rateIncrease > 0.20 || volumeIncrease > 0.30) {
      const recentArousal = arousals.length > 0 &&
        (currentMetric.time - arousals[arousals.length - 1].time) < 15;

      if (!recentArousal) {
        arousals.push({
          time: currentMetric.time,
          rateIncrease: rateIncrease,
          volumeIncrease: volumeIncrease
        });
      }
    }
  }

  const durationHours = totalDurationSeconds / 3600;
  return durationHours > 0 ? arousals.length / durationHours : 0;
};

/**
 * Calculates minute ventilation over time
 */
export const calculateMinuteVent = (flowData, samplingRate) => {
  const windowSize = Math.floor(60 * samplingRate);
  const stepSize = Math.floor(5 * samplingRate);
  const minuteVent = [];

  for (let i = 0; i < flowData.length - windowSize; i += stepSize) {
    const window = flowData.slice(i, i + windowSize);

    let tidalVolume = 0;
    let breathCount = 0;
    let inInhalation = false;

    for (let j = 1; j < window.length; j++) {
      if (window[j] > 0 && window[j-1] <= 0) {
        breathCount++;
        inInhalation = true;
      }
      if (inInhalation && window[j] > 0) {
        tidalVolume += Math.abs(window[j]) / samplingRate;
      }
      if (window[j] <= 0) {
        inInhalation = false;
      }
    }

    const mv = (tidalVolume * breathCount) / 60;
    minuteVent.push(mv);
  }

  return minuteVent;
};

/**
 * Calculates sample entropy for regularity assessment
 */
export const calculateSampleEntropy = (data, m = 2, r = null) => {
  const N = data.length;

  if (r === null) {
    const mean = data.reduce((a, b) => a + b) / N;
    const variance = data.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / N;
    r = 0.2 * Math.sqrt(variance);
  }

  const countMatches = (m) => {
    let count = 0;
    for (let i = 0; i < N - m; i++) {
      for (let j = i + 1; j < N - m; j++) {
        let match = true;
        for (let k = 0; k < m; k++) {
          if (Math.abs(data[i + k] - data[j + k]) > r) {
            match = false;
            break;
          }
        }
        if (match) count++;
      }
    }
    return count;
  };

  const B = countMatches(m);
  const A = countMatches(m + 1);

  if (B === 0 || A === 0) return 0;
  return -Math.log(A / B);
};

/**
 * Fast Fourier Transform implementation
 */
export const fft = (x) => {
  const N = x.length;
  if (N <= 1) return x;
  if (N % 2 !== 0) throw new Error('FFT size must be power of 2');

  const even = fft(x.filter((_, i) => i % 2 === 0));
  const odd = fft(x.filter((_, i) => i % 2 === 1));

  const result = new Array(N);
  for (let k = 0; k < N / 2; k++) {
    const angle = -2 * Math.PI * k / N;
    const t = {
      re: Math.cos(angle) * odd[k].re - Math.sin(angle) * odd[k].im,
      im: Math.cos(angle) * odd[k].im + Math.sin(angle) * odd[k].re
    };
    result[k] = { re: even[k].re + t.re, im: even[k].im + t.im };
    result[k + N/2] = { re: even[k].re - t.re, im: even[k].im - t.im };
  }
  return result;
};

/**
 * Analyzes ventilatory control stability for a full night
 */
export const analyzeNight = (minuteVent) => {
  const mean = minuteVent.reduce((a, b) => a + b) / minuteVent.length;
  const detrended = minuteVent.map(v => v - mean);

  const sampleEntropy = calculateSampleEntropy(minuteVent);
  const regularityScore = Math.max(0, Math.min(100, 100 - (sampleEntropy / 2.5) * 100));

  const n = Math.pow(2, Math.ceil(Math.log2(detrended.length)));
  const padded = [...detrended, ...new Array(n - detrended.length).fill(0)];
  const complex = padded.map(v => ({ re: v, im: 0 }));
  const spectrum = fft(complex);
  const power = spectrum.slice(0, n/2).map(c => Math.sqrt(c.re * c.re + c.im * c.im));

  const dt = 5;
  const freqs = power.map((_, i) => i / (n * dt));
  const totalPower = power.reduce((a, b) => a + b, 0);
  const pbPower = power.filter((p, i) => freqs[i] >= 0.01 && freqs[i] <= 0.03).reduce((a, b) => a + b, 0);
  const periodicityIndex = Math.min(100, (pbPower / totalPower) * 200);

  return { periodicityIndex, regularityScore };
};
