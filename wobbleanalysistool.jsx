import React, { useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Brush, ReferenceLine } from 'recharts';
import { Upload } from 'lucide-react';

const SleepAnalyzerBatch = () => {
  const [files, setFiles] = useState([]);
  const [results, setResults] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [error, setError] = useState(null);
  const [therapyModeDate, setTherapyModeDate] = useState('');
  const [showResultsTable, setShowResultsTable] = useState(false);
  const [minDurationMinutes, setMinDurationMinutes] = useState(30);
  const [comparisonDates, setComparisonDates] = useState([{ date: '', label: '' }]);

  const parseEDF = async (buffer) => {
    const view = new DataView(buffer);
    const decoder = new TextDecoder('ascii');

    let offset = 0;
    const header = {
      version: decoder.decode(new Uint8Array(buffer, offset, 8)).trim(),
      patientId: decoder.decode(new Uint8Array(buffer, offset + 8, 80)).trim(),
      recordingId: decoder.decode(new Uint8Array(buffer, offset + 88, 80)).trim(),
      startDate: decoder.decode(new Uint8Array(buffer, offset + 168, 8)).trim(),
      startTime: decoder.decode(new Uint8Array(buffer, offset + 176, 8)).trim(),
      headerBytes: parseInt(decoder.decode(new Uint8Array(buffer, offset + 184, 8)).trim()),
      reserved: decoder.decode(new Uint8Array(buffer, offset + 192, 44)).trim(),
      numDataRecords: parseInt(decoder.decode(new Uint8Array(buffer, offset + 236, 8)).trim()),
      recordDuration: parseFloat(decoder.decode(new Uint8Array(buffer, offset + 244, 8)).trim()),
      numSignals: parseInt(decoder.decode(new Uint8Array(buffer, offset + 252, 4)).trim())
    };

    const totalDurationMinutes = (header.numDataRecords * header.recordDuration) / 60;

    const dateParts = header.startDate.split('.');
    let year = parseInt(dateParts[2]);
    if (year < 100) {
      year += (year < 85) ? 2000 : 1900;
    }
    const recordingDate = new Date(year, parseInt(dateParts[1]) - 1, parseInt(dateParts[0]));

    offset = 256;
    const signals = [];

    for (let i = 0; i < header.numSignals; i++) {
      const label = decoder.decode(new Uint8Array(buffer, offset + i * 16, 16)).trim();
      signals.push({ label });
    }

    offset += header.numSignals * 16;

    for (let i = 0; i < header.numSignals; i++) {
      signals[i].transducer = decoder.decode(new Uint8Array(buffer, offset + i * 80, 80)).trim();
    }
    offset += header.numSignals * 80;

    for (let i = 0; i < header.numSignals; i++) {
      signals[i].physicalDimension = decoder.decode(new Uint8Array(buffer, offset + i * 8, 8)).trim();
    }
    offset += header.numSignals * 8;

    for (let i = 0; i < header.numSignals; i++) {
      signals[i].physicalMin = parseFloat(decoder.decode(new Uint8Array(buffer, offset + i * 8, 8)).trim());
    }
    offset += header.numSignals * 8;

    for (let i = 0; i < header.numSignals; i++) {
      signals[i].physicalMax = parseFloat(decoder.decode(new Uint8Array(buffer, offset + i * 8, 8)).trim());
    }
    offset += header.numSignals * 8;

    for (let i = 0; i < header.numSignals; i++) {
      signals[i].digitalMin = parseInt(decoder.decode(new Uint8Array(buffer, offset + i * 8, 8)).trim());
    }
    offset += header.numSignals * 8;

    for (let i = 0; i < header.numSignals; i++) {
      signals[i].digitalMax = parseInt(decoder.decode(new Uint8Array(buffer, offset + i * 8, 8)).trim());
    }
    offset += header.numSignals * 8;

    for (let i = 0; i < header.numSignals; i++) {
      signals[i].prefiltering = decoder.decode(new Uint8Array(buffer, offset + i * 80, 80)).trim();
    }
    offset += header.numSignals * 80;

    for (let i = 0; i < header.numSignals; i++) {
      signals[i].numSamples = parseInt(decoder.decode(new Uint8Array(buffer, offset + i * 8, 8)).trim());
    }
    offset += header.numSignals * 8;

    for (let i = 0; i < header.numSignals; i++) {
      signals[i].reserved = decoder.decode(new Uint8Array(buffer, offset + i * 32, 32)).trim();
    }

    const flowSignalIdx = signals.findIndex(s =>
      s.label.toLowerCase().includes('flow') ||
      s.label.toLowerCase().includes('flw')
    );

    if (flowSignalIdx === -1) {
      throw new Error('No flow signal found');
    }

    const flowSignal = signals[flowSignalIdx];
    const samplesPerRecord = flowSignal.numSamples;
    const samplingRate = samplesPerRecord / header.recordDuration;

    offset = header.headerBytes;
    const flowData = [];

    for (let record = 0; record < header.numDataRecords; record++) {
      let recordOffset = offset;

      for (let sig = 0; sig < flowSignalIdx; sig++) {
        recordOffset += signals[sig].numSamples * 2;
      }

      for (let sample = 0; sample < samplesPerRecord; sample++) {
        const digitalValue = view.getInt16(recordOffset + sample * 2, true);
        const physicalValue = (digitalValue - flowSignal.digitalMin) *
          (flowSignal.physicalMax - flowSignal.physicalMin) /
          (flowSignal.digitalMax - flowSignal.digitalMin) +
          flowSignal.physicalMin;
        flowData.push(physicalValue);
      }

      offset += signals.reduce((sum, sig) => sum + sig.numSamples * 2, 0);
    }

    return { flowData, samplingRate, recordingDate, durationMinutes: totalDurationMinutes };
  };

  const analyzeFlowLimitation = (flowData, samplingRate) => {
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

  const estimateArousals = (breaths, flowData, samplingRate, totalDurationSeconds) => {
    if (breaths.length < 10) return 0;

    // Calculate breath-by-breath respiratory rate and tidal volume
    const breathMetrics = [];
    for (let i = 1; i < breaths.length; i++) {
      const breath = breaths[i];
      const prevBreath = breaths[i - 1];

      const breathDuration = breath.startTime - prevBreath.startTime;
      if (breathDuration <= 0 || breathDuration > 20) continue; // Filter artifacts

      const respiratoryRate = 60 / breathDuration; // breaths per minute

      // Estimate tidal volume from flow integral during inspiration
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

    // Calculate rolling baseline (2-minute windows)
    const baselineWindow = 120; // seconds
    const arousals = [];

    for (let i = 0; i < breathMetrics.length; i++) {
      const currentMetric = breathMetrics[i];

      // Get baseline from preceding 2 minutes
      const baselineStart = Math.max(0, i - Math.floor(baselineWindow / (60 / currentMetric.rate)));
      const baselineMetrics = breathMetrics.slice(baselineStart, i);

      if (baselineMetrics.length < 5) continue;

      const baselineRate = baselineMetrics.reduce((sum, m) => sum + m.rate, 0) / baselineMetrics.length;
      const baselineVolume = baselineMetrics.reduce((sum, m) => sum + m.volume, 0) / baselineMetrics.length;

      // Detect arousal: >20% increase in rate OR >30% increase in volume
      const rateIncrease = (currentMetric.rate - baselineRate) / baselineRate;
      const volumeIncrease = (currentMetric.volume - baselineVolume) / baselineVolume;

      if (rateIncrease > 0.20 || volumeIncrease > 0.30) {
        // Check if this is part of an existing arousal (within 15 seconds)
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

    // Calculate arousal index (events per hour)
    const durationHours = totalDurationSeconds / 3600;
    return durationHours > 0 ? arousals.length / durationHours : 0;
  };

  const calculateMinuteVent = (flowData, samplingRate) => {
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

  const calculateSampleEntropy = (data, m = 2, r = null) => {
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

  const fft = (x) => {
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

  const analyzeNight = (minuteVent) => {
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

  const handleFileUpload = async (event, minSize = 2 * 1024 * 1024) => {
    const uploadedFiles = Array.from(event.target.files);
    const validFiles = uploadedFiles.filter(f => f.name.endsWith('BRP.edf') && f.size > minSize);

    if (validFiles.length === 0) {
      const sizeText = minSize === 500 * 1024 ? '500KB' : '1MB';
      setError(`No valid BRP.edf files over ${sizeText} found`);
      return;
    }

    setFiles(prev => [...prev, ...validFiles]);
    setProcessing(true);
    setError(null);
    setProgress({ current: 0, total: validFiles.length });

    const nightResults = [];
    let skippedCount = 0;

    for (let i = 0; i < validFiles.length; i++) {
      try {
        const file = validFiles[i];
        const buffer = await file.arrayBuffer();
        const { flowData, samplingRate, recordingDate, durationMinutes } = await parseEDF(buffer);

        // Filter by duration
        if (durationMinutes < minDurationMinutes) {
          skippedCount++;
          setProgress({ current: i + 1, total: validFiles.length });
          continue;
        }

        const { flScore, breaths } = analyzeFlowLimitation(flowData, samplingRate);
        const eai = estimateArousals(breaths, flowData, samplingRate, durationMinutes * 60);
        const minuteVent = calculateMinuteVent(flowData, samplingRate);
        const { periodicityIndex, regularityScore } = analyzeNight(minuteVent);

        const newResult = {
          date: recordingDate,
          filename: file.name,
          flScore,
          periodicityIndex,
          regularityScore,
          eai,
          durationMinutes
        };

        nightResults.push(newResult);

        // Add result immediately and re-sort
        setResults(prev => {
          const updated = [...prev, newResult];
          updated.sort((a, b) => a.date - b.date);
          return updated;
        });

        setProgress({ current: i + 1, total: validFiles.length });
      } catch (err) {
        console.error(`Error processing ${validFiles[i].name}:`, err);
      }
    }

    if (skippedCount > 0) {
      setError(`Processed ${nightResults.length} sessions, skipped ${skippedCount} sessions under ${minDurationMinutes} minutes`);
    }

    setProcessing(false);
  };

  const addComparisonDate = () => {
    setComparisonDates([...comparisonDates, { date: '', label: '' }]);
  };

  const removeComparisonDate = (index) => {
    if (comparisonDates.length > 1) {
      setComparisonDates(comparisonDates.filter((_, i) => i !== index));
    }
  };

  const updateComparisonDate = (index, field, value) => {
    const updated = [...comparisonDates];
    if (field === 'label' && value.length > 50) {
      value = value.substring(0, 50);
    }
    updated[index][field] = value;
    setComparisonDates(updated);
  };

  const handleReset = () => {
    setFiles([]);
    setResults([]);
    setProcessing(false);
    setProgress({ current: 0, total: 0 });
    setError(null);
    setTherapyModeDate('');
    setShowResultsTable(false);
    setComparisonDates([{ date: '', label: '' }]);
  };

  const getSummaryStats = () => {
    if (results.length === 0 || !therapyModeDate) return null;

    const cutoffDate = new Date(therapyModeDate);
    const period1 = results.filter(r => r.date < cutoffDate);
    const period2 = results.filter(r => r.date >= cutoffDate);

    const calcStats = (nights) => {
      if (nights.length === 0) return null;

      // Calculate duration-weighted means
      const totalDuration = nights.reduce((sum, n) => sum + n.durationMinutes, 0);
      const flWeighted = nights.reduce((sum, n) => sum + (n.flScore * n.durationMinutes), 0) / totalDuration;
      const piWeighted = nights.reduce((sum, n) => sum + (n.periodicityIndex * n.durationMinutes), 0) / totalDuration;
      const rsWeighted = nights.reduce((sum, n) => sum + (n.regularityScore * n.durationMinutes), 0) / totalDuration;

      // Calculate medians (not weighted - medians don't weight well)
      const fl = nights.map(n => n.flScore).sort((a, b) => a - b);
      const pi = nights.map(n => n.periodicityIndex).sort((a, b) => a - b);
      const rs = nights.map(n => n.regularityScore).sort((a, b) => a - b);

      return {
        count: nights.length,
        totalHours: (totalDuration / 60).toFixed(1),
        flMean: flWeighted.toFixed(1),
        piMean: piWeighted.toFixed(1),
        rsMean: rsWeighted.toFixed(1),
        flMedian: fl[Math.floor(fl.length / 2)].toFixed(1),
        piMedian: pi[Math.floor(pi.length / 2)].toFixed(1),
        rsMedian: rs[Math.floor(rs.length / 2)].toFixed(1)
      };
    };

    return { period1: calcStats(period1), period2: calcStats(period2) };
  };

  const chartData = results.map(r => ({
    date: r.date.toLocaleDateString(),
    flScore: parseFloat(r.flScore.toFixed(1)),
    periodicityIndex: parseFloat(r.periodicityIndex.toFixed(1)),
    regularityScore: parseFloat(r.regularityScore.toFixed(1)),
    eai: parseFloat(r.eai.toFixed(1)),
    composite: parseFloat((((r.flScore + r.periodicityIndex + r.regularityScore) / 3 + r.eai) / 2).toFixed(1))
  }));

  const movingAverage = (data, key, windowSize = 7) => {
    return data.map((point, idx) => {
      const start = Math.max(0, idx - Math.floor(windowSize / 2));
      const end = Math.min(data.length, idx + Math.ceil(windowSize / 2));
      const window = data.slice(start, end);
      const avg = window.reduce((sum, p) => sum + p[key], 0) / window.length;
      return { ...point, [`${key}Smooth`]: parseFloat(avg.toFixed(1)) };
    });
  };

  let smoothedData = chartData;
  if (chartData.length > 0) {
    smoothedData = movingAverage(chartData, 'flScore');
    smoothedData = movingAverage(smoothedData, 'regularityScore');
    smoothedData = movingAverage(smoothedData, 'periodicityIndex');
    smoothedData = movingAverage(smoothedData, 'eai');
    smoothedData = movingAverage(smoothedData, 'composite');
  }

  const flValues = chartData.map(d => d.flScore);
  const rsValues = chartData.map(d => d.regularityScore);
  const piValues = chartData.map(d => d.periodicityIndex);
  const eaiValues = chartData.map(d => d.eai);
  const compositeValues = chartData.map(d => d.composite);
  const flMin = flValues.length > 0 ? Math.max(0, Math.min(...flValues) - 5) : 0;
  const flMax = flValues.length > 0 ? Math.min(100, Math.max(...flValues) + 5) : 100;
  const rsMin = rsValues.length > 0 ? Math.max(0, Math.min(...rsValues) - 5) : 0;
  const rsMax = rsValues.length > 0 ? Math.min(100, Math.max(...rsValues) + 5) : 100;
  const piMin = piValues.length > 0 ? Math.max(0, Math.min(...piValues) - 5) : 0;
  const piMax = piValues.length > 0 ? Math.min(100, Math.max(...piValues) + 5) : 100;
  const eaiMin = eaiValues.length > 0 ? Math.max(0, Math.min(...eaiValues) - 2) : 0;
  const eaiMax = eaiValues.length > 0 ? Math.max(...eaiValues) + 2 : 20;
  const compositeMin = compositeValues.length > 0 ? Math.max(0, Math.min(...compositeValues) - 5) : 0;
  const compositeMax = compositeValues.length > 0 ? Math.max(...compositeValues) + 5 : 100;

  const stats = getSummaryStats();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">
            Wobble Analysis Tool (WAT) v0.22
          </h1>
          <p className="text-blue-100 text-lg">
            Track flow limitation and ventilatory control stability
          </p>
          <p className="text-white text-sm mt-2">
            🔒 All processing happens locally - your data never leaves your computer
          </p>
          <p className="text-orange-300 text-sm mt-2 font-semibold">
            ⚠️ ResMed devices only - other manufacturers use different file formats
          </p>
        </div>

        <div className="bg-yellow-500/10 border border-yellow-500/50 rounded-lg p-4 mb-6">
          <p className="text-yellow-100 text-sm">
            <strong>⚠️ Experimental Tool - Not Medical Advice:</strong> WAT is a research and analysis tool created by the sleep apnea community.
            It is not FDA approved, not a medical device, and not a substitute for professional medical advice, diagnosis, or treatment.
            Always consult with qualified healthcare providers regarding your sleep therapy.
            This tool is provided as-is for educational and research purposes.
          </p>
        </div>

        <div className="bg-white/10 backdrop-blur-lg rounded-lg p-6 mb-6 border border-white/20">
          <h3 className="text-xl font-bold text-white mb-4 text-center">Processing Settings</h3>

          <div className="mb-6 max-w-md mx-auto">
            <label className="block text-white text-sm font-semibold mb-2">
              Minimum Session Duration (minutes)
            </label>
            <input
              type="number"
              value={minDurationMinutes}
              onChange={(e) => setMinDurationMinutes(Math.max(1, parseInt(e.target.value) || 1))}
              className="bg-slate-800 text-white border border-blue-400 rounded px-4 py-2 w-full"
              min="1"
            />
            <p className="text-blue-200 text-xs mt-2">
              Sessions shorter than this will be skipped during processing
            </p>
          </div>

          <h3 className="text-xl font-bold text-white mb-4 text-center">Select Processing Mode</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-blue-300 rounded-lg cursor-pointer hover:bg-white/5">
              <div className="flex flex-col items-center justify-center text-center">
                <Upload className="w-10 h-10 text-blue-200 mb-2" />
                <p className="text-sm text-white font-semibold mb-1">
                  Batch Process
                </p>
                <p className="text-xs text-blue-200">Select folder or multiple files</p>
              </div>
              <input
                type="file"
                className="hidden"
                accept=".edf"
                multiple
                webkitdirectory=""
                directory=""
                onChange={(e) => handleFileUpload(e, 1 * 1024 * 1024)}
              />
            </label>

            <label className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-green-300 rounded-lg cursor-pointer hover:bg-white/5">
              <div className="flex flex-col items-center justify-center text-center">
                <Upload className="w-10 h-10 text-green-200 mb-2" />
                <p className="text-sm text-white font-semibold mb-1">
                  Individual Files
                </p>
                <p className="text-xs text-green-200">Select one or more files</p>
              </div>
              <input
                type="file"
                className="hidden"
                accept=".edf"
                multiple
                onChange={(e) => handleFileUpload(e, 500 * 1024)}
              />
            </label>
          </div>

          {results.length > 0 && (
            <div className="mt-6 text-center">
              <button
                onClick={handleReset}
                className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-6 rounded-lg transition-colors"
              >
                🗑️ Clear All Data & Reset
              </button>
              <p className="text-red-200 text-xs mt-2">This will remove all processed sessions and start fresh</p>
            </div>
          )}

          {files.length > 0 && <p className="text-white text-sm mt-4">Found {files.length} valid files</p>}

          {processing && (
            <div className="mt-4">
              <div className="flex justify-between text-white text-sm mb-2">
                <span>Processing...</span>
                <span>{progress.current} / {progress.total}</span>
              </div>
              <div className="w-full bg-blue-950 rounded-full h-2">
                <div className="bg-blue-400 h-2 rounded-full" style={{ width: `${(progress.current / progress.total) * 100}%` }}></div>
              </div>
            </div>
          )}

          {error && (
            <div className="bg-red-500/20 border border-red-500 rounded p-4 mt-4">
              <p className="text-red-200">Error: {error}</p>
            </div>
          )}
        </div>

        {results.length > 0 && (
          <>
            <div className="bg-white/10 backdrop-blur-lg rounded-lg p-6 mb-6 border border-white/20">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-white">Individual Session Results</h3>
                <button
                  onClick={() => setShowResultsTable(!showResultsTable)}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold py-2 px-4 rounded transition-colors"
                >
                  {showResultsTable ? '▲ Hide Table' : '▼ Show Table'}
                </button>
              </div>

              {showResultsTable && (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-white">
                      <thead className="border-b border-white/20">
                        <tr>
                          <th className="text-left py-3 px-4">Date</th>
                          <th className="text-left py-3 px-4">Filename</th>
                          <th className="text-center py-3 px-4">Duration</th>
                          <th className="text-center py-3 px-4">Flow Limitation</th>
                          <th className="text-center py-3 px-4">Regularity</th>
                          <th className="text-center py-3 px-4">Periodicity</th>
                          <th className="text-center py-3 px-4">EAI</th>
                        </tr>
                      </thead>
                      <tbody>
                        {results.map((result, idx) => (
                          <tr key={idx} className="border-b border-white/10 hover:bg-white/5">
                            <td className="py-3 px-4">{result.date.toLocaleDateString()}</td>
                            <td className="py-3 px-4 text-xs text-blue-200">{result.filename}</td>
                            <td className="py-3 px-4 text-center text-sm">
                              {result.durationMinutes >= 60
                                ? `${(result.durationMinutes / 60).toFixed(1)}h`
                                : `${Math.round(result.durationMinutes)}m`
                              }
                            </td>
                            <td className="py-3 px-4 text-center font-semibold text-orange-300">{result.flScore.toFixed(1)}</td>
                            <td className="py-3 px-4 text-center font-semibold text-green-300">{result.regularityScore.toFixed(1)}</td>
                            <td className="py-3 px-4 text-center font-semibold text-blue-300">{result.periodicityIndex.toFixed(1)}</td>
                            <td className="py-3 px-4 text-center font-semibold text-purple-300">{result.eai.toFixed(1)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-blue-200 text-xs mt-4">
                    Total sessions analyzed: {results.length} | You can continue adding more files to expand your dataset
                  </p>
                </>
              )}

              {!showResultsTable && (
                <p className="text-blue-200 text-sm">
                  {results.length} sessions analyzed | Click "Show Table" to view individual results
                </p>
              )}
            </div>

            <div className="bg-white/10 backdrop-blur-lg rounded-lg p-6 mb-6 border border-white/20">
              <h3 className="text-xl font-bold text-white mb-4">Comparison Dates</h3>
              <p className="text-white text-sm mb-4">Mark therapy changes, equipment adjustments, or other significant events</p>

              {comparisonDates.map((cd, idx) => (
                <div key={idx} className="mb-4 p-4 bg-white/5 rounded border border-white/10">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-2">
                    <div>
                      <label className="block text-white text-sm font-semibold mb-2">Date</label>
                      <input
                        type="date"
                        value={cd.date}
                        onChange={(e) => updateComparisonDate(idx, 'date', e.target.value)}
                        className="bg-slate-800 text-white border border-blue-400 rounded px-4 py-2 w-full"
                      />
                    </div>
                    <div>
                      <label className="block text-white text-sm font-semibold mb-2">
                        Label (optional, max 50 chars)
                      </label>
                      <input
                        type="text"
                        value={cd.label}
                        onChange={(e) => updateComparisonDate(idx, 'label', e.target.value)}
                        placeholder="e.g., Switched to ASV"
                        maxLength={50}
                        className="bg-slate-800 text-white border border-blue-400 rounded px-4 py-2 w-full"
                      />
                    </div>
                  </div>
                  {comparisonDates.length > 1 && (
                    <button
                      onClick={() => removeComparisonDate(idx)}
                      className="bg-red-500 hover:bg-red-600 text-white text-sm py-1 px-3 rounded"
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}

              <button
                onClick={addComparisonDate}
                className="bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-4 rounded transition-colors"
              >
                + Add Another Comparison Date
              </button>
            </div>

            {comparisonDates.some(cd => cd.date) && comparisonDates.length === 1 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div className="bg-white/10 backdrop-blur-lg rounded-lg p-6 border border-white/20">
                  <h3 className="text-xl font-bold text-red-400 mb-4">Period 1</h3>
                  <div className="space-y-2 text-white text-sm">
                    {(() => {
                      const cutoffDate = new Date(comparisonDates[0].date);
                      const period1 = results.filter(r => r.date < cutoffDate);
                      if (period1.length === 0) return <p>No data in this period</p>;

                      const totalDuration = period1.reduce((sum, n) => sum + n.durationMinutes, 0);
                      const flWeighted = period1.reduce((sum, n) => sum + (n.flScore * n.durationMinutes), 0) / totalDuration;
                      const piWeighted = period1.reduce((sum, n) => sum + (n.periodicityIndex * n.durationMinutes), 0) / totalDuration;
                      const rsWeighted = period1.reduce((sum, n) => sum + (n.regularityScore * n.durationMinutes), 0) / totalDuration;

                      const fl = period1.map(n => n.flScore).sort((a, b) => a - b);
                      const pi = period1.map(n => n.periodicityIndex).sort((a, b) => a - b);
                      const rs = period1.map(n => n.regularityScore).sort((a, b) => a - b);

                      return (
                        <>
                          <p><span className="font-semibold">Sessions:</span> {period1.length} ({(totalDuration / 60).toFixed(1)}h total)</p>
                          <p><span className="font-semibold">FL:</span> {flWeighted.toFixed(1)} (weighted) / {fl[Math.floor(fl.length / 2)].toFixed(1)} (median)</p>
                          <p><span className="font-semibold">Regularity:</span> {rsWeighted.toFixed(1)} (weighted) / {rs[Math.floor(rs.length / 2)].toFixed(1)} (median)</p>
                          <p><span className="font-semibold">Periodicity:</span> {piWeighted.toFixed(1)} (weighted) / {pi[Math.floor(pi.length / 2)].toFixed(1)} (median)</p>
                        </>
                      );
                    })()}
                  </div>
                </div>

                <div className="bg-white/10 backdrop-blur-lg rounded-lg p-6 border border-white/20">
                  <h3 className="text-xl font-bold text-green-400 mb-4">Period 2</h3>
                  <div className="space-y-2 text-white text-sm">
                    {(() => {
                      const cutoffDate = new Date(comparisonDates[0].date);
                      const period2 = results.filter(r => r.date >= cutoffDate);
                      if (period2.length === 0) return <p>No data in this period</p>;

                      const totalDuration = period2.reduce((sum, n) => sum + n.durationMinutes, 0);
                      const flWeighted = period2.reduce((sum, n) => sum + (n.flScore * n.durationMinutes), 0) / totalDuration;
                      const piWeighted = period2.reduce((sum, n) => sum + (n.periodicityIndex * n.durationMinutes), 0) / totalDuration;
                      const rsWeighted = period2.reduce((sum, n) => sum + (n.regularityScore * n.durationMinutes), 0) / totalDuration;

                      const fl = period2.map(n => n.flScore).sort((a, b) => a - b);
                      const pi = period2.map(n => n.periodicityIndex).sort((a, b) => a - b);
                      const rs = period2.map(n => n.regularityScore).sort((a, b) => a - b);

                      return (
                        <>
                          <p><span className="font-semibold">Sessions:</span> {period2.length} ({(totalDuration / 60).toFixed(1)}h total)</p>
                          <p><span className="font-semibold">FL:</span> {flWeighted.toFixed(1)} (weighted) / {fl[Math.floor(fl.length / 2)].toFixed(1)} (median)</p>
                          <p><span className="font-semibold">Regularity:</span> {rsWeighted.toFixed(1)} (weighted) / {rs[Math.floor(rs.length / 2)].toFixed(1)} (median)</p>
                          <p><span className="font-semibold">Periodicity:</span> {piWeighted.toFixed(1)} (weighted) / {pi[Math.floor(pi.length / 2)].toFixed(1)} (median)</p>
                        </>
                      );
                    })()}
                  </div>
                </div>
              </div>
            )}

            <div className="bg-white/10 backdrop-blur-lg rounded-lg p-6 mb-6 border border-white/20">
              <h3 className="text-xl font-bold text-white mb-4">Sleep Disruption Score</h3>
              <p className="text-blue-100 text-xs mb-3">
                Combined metric: averages the three 0-100 scores with EAI. Lower is better.
              </p>
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={smoothedData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff20" />
                  <XAxis dataKey="date" stroke="#93c5fd" angle={-45} textAnchor="end" height={100} />
                  <YAxis domain={[compositeMin, compositeMax]} stroke="#93c5fd" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#ffffff',
                      border: '2px solid #f472b6',
                      borderRadius: '8px',
                      color: '#1e293b'
                    }}
                    labelStyle={{ color: '#1e293b', fontWeight: 'bold' }}
                    itemStyle={{ color: '#1e293b' }}
                  />
                  <Legend />
                  {comparisonDates.filter(cd => cd.date).map((cd, idx) => (
                    <ReferenceLine
                      key={idx}
                      x={new Date(cd.date).toLocaleDateString()}
                      stroke={['#ef4444', '#8b5cf6', '#10b981', '#f59e0b', '#06b6d4'][idx % 5]}
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      label={{
                        value: cd.label || `Change ${idx + 1}`,
                        position: 'top',
                        fill: '#ffffff',
                        fontSize: 12
                      }}
                    />
                  ))}
                  <Line type="monotone" dataKey="composite" stroke="#f472b622" strokeWidth={1} dot={false} name="Raw" />
                  <Line type="monotone" dataKey="compositeSmooth" stroke="#f472b6" strokeWidth={3} dot={false} name="Smoothed" />
                  <Brush dataKey="date" height={30} stroke="#f472b6" fill="#1e293b" />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-white/10 backdrop-blur-lg rounded-lg p-6 mb-6 border border-white/20">
              <h3 className="text-xl font-bold text-white mb-4">Flow Limitation</h3>
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={smoothedData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff20" />
                  <XAxis dataKey="date" stroke="#93c5fd" angle={-45} textAnchor="end" height={100} />
                  <YAxis domain={[flMin, flMax]} stroke="#93c5fd" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#ffffff',
                      border: '2px solid #fb923c',
                      borderRadius: '8px',
                      color: '#1e293b'
                    }}
                    labelStyle={{ color: '#1e293b', fontWeight: 'bold' }}
                    itemStyle={{ color: '#1e293b' }}
                  />
                  <Legend />
                  {comparisonDates.filter(cd => cd.date).map((cd, idx) => (
                    <ReferenceLine
                      key={idx}
                      x={new Date(cd.date).toLocaleDateString()}
                      stroke={['#ef4444', '#8b5cf6', '#10b981', '#f59e0b', '#06b6d4'][idx % 5]}
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      label={{
                        value: cd.label || `Change ${idx + 1}`,
                        position: 'top',
                        fill: '#ffffff',
                        fontSize: 12
                      }}
                    />
                  ))}
                  <Line type="monotone" dataKey="flScore" stroke="#fb923c22" strokeWidth={1} dot={false} name="Raw" />
                  <Line type="monotone" dataKey="flScoreSmooth" stroke="#fb923c" strokeWidth={3} dot={false} name="Smoothed" />
                  <Brush dataKey="date" height={30} stroke="#fb923c" fill="#1e293b" />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-white/10 backdrop-blur-lg rounded-lg p-6 mb-6 border border-white/20">
              <h3 className="text-xl font-bold text-white mb-4">Regularity Score</h3>
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={smoothedData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff20" />
                  <XAxis dataKey="date" stroke="#93c5fd" angle={-45} textAnchor="end" height={100} />
                  <YAxis domain={[rsMin, rsMax]} stroke="#93c5fd" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#ffffff',
                      border: '2px solid #34d399',
                      borderRadius: '8px',
                      color: '#1e293b'
                    }}
                    labelStyle={{ color: '#1e293b', fontWeight: 'bold' }}
                    itemStyle={{ color: '#1e293b' }}
                  />
                  <Legend />
                  {comparisonDates.filter(cd => cd.date).map((cd, idx) => (
                    <ReferenceLine
                      key={idx}
                      x={new Date(cd.date).toLocaleDateString()}
                      stroke={['#ef4444', '#8b5cf6', '#10b981', '#f59e0b', '#06b6d4'][idx % 5]}
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      label={{
                        value: cd.label || `Change ${idx + 1}`,
                        position: 'top',
                        fill: '#ffffff',
                        fontSize: 12
                      }}
                    />
                  ))}
                  <Line type="monotone" dataKey="regularityScore" stroke="#34d39922" strokeWidth={1} dot={false} name="Raw" />
                  <Line type="monotone" dataKey="regularityScoreSmooth" stroke="#34d399" strokeWidth={3} dot={false} name="Smoothed" />
                  <Brush dataKey="date" height={30} stroke="#34d399" fill="#1e293b" />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-white/10 backdrop-blur-lg rounded-lg p-6 mb-6 border border-white/20">
              <h3 className="text-xl font-bold text-white mb-4">Periodicity Index</h3>
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={smoothedData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff20" />
                  <XAxis dataKey="date" stroke="#93c5fd" angle={-45} textAnchor="end" height={100} />
                  <YAxis domain={[piMin, piMax]} stroke="#93c5fd" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#ffffff',
                      border: '2px solid #60a5fa',
                      borderRadius: '8px',
                      color: '#1e293b'
                    }}
                    labelStyle={{ color: '#1e293b', fontWeight: 'bold' }}
                    itemStyle={{ color: '#1e293b' }}
                  />
                  <Legend />
                  {comparisonDates.filter(cd => cd.date).map((cd, idx) => (
                    <ReferenceLine
                      key={idx}
                      x={new Date(cd.date).toLocaleDateString()}
                      stroke={['#ef4444', '#8b5cf6', '#10b981', '#f59e0b', '#06b6d4'][idx % 5]}
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      label={{
                        value: cd.label || `Change ${idx + 1}`,
                        position: 'top',
                        fill: '#ffffff',
                        fontSize: 12
                      }}
                    />
                  ))}
                  <Line type="monotone" dataKey="periodicityIndex" stroke="#60a5fa22" strokeWidth={1} dot={false} name="Raw" />
                  <Line type="monotone" dataKey="periodicityIndexSmooth" stroke="#60a5fa" strokeWidth={3} dot={false} name="Smoothed" />
                  <Brush dataKey="date" height={30} stroke="#60a5fa" fill="#1e293b" />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-white/10 backdrop-blur-lg rounded-lg p-6 mb-6 border border-white/20">
              <h3 className="text-xl font-bold text-white mb-4">Estimated Arousal Index (EAI)</h3>
              <p className="text-yellow-100 text-xs mb-3">
                ⚠️ Experimental metric based on respiratory patterns only. Not validated against polysomnography. Use for trend tracking, not diagnosis.
              </p>
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={smoothedData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff20" />
                  <XAxis dataKey="date" stroke="#93c5fd" angle={-45} textAnchor="end" height={100} />
                  <YAxis domain={[eaiMin, eaiMax]} stroke="#93c5fd" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#ffffff',
                      border: '2px solid #a78bfa',
                      borderRadius: '8px',
                      color: '#1e293b'
                    }}
                    labelStyle={{ color: '#1e293b', fontWeight: 'bold' }}
                    itemStyle={{ color: '#1e293b' }}
                  />
                  <Legend />
                  {comparisonDates.filter(cd => cd.date).map((cd, idx) => (
                    <ReferenceLine
                      key={idx}
                      x={new Date(cd.date).toLocaleDateString()}
                      stroke={['#ef4444', '#8b5cf6', '#10b981', '#f59e0b', '#06b6d4'][idx % 5]}
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      label={{
                        value: cd.label || `Change ${idx + 1}`,
                        position: 'top',
                        fill: '#ffffff',
                        fontSize: 12
                      }}
                    />
                  ))}
                  <Line type="monotone" dataKey="eai" stroke="#a78bfa22" strokeWidth={1} dot={false} name="Raw" />
                  <Line type="monotone" dataKey="eaiSmooth" stroke="#a78bfa" strokeWidth={3} dot={false} name="Smoothed" />
                  <Brush dataKey="date" height={30} stroke="#a78bfa" fill="#1e293b" />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-white/10 backdrop-blur-lg rounded-lg p-6 border border-white/20 text-center">
              <button
                onClick={() => {
                  const hasStats = stats && stats.period1 && stats.period2;
                  const reportContent = `
WAT - WOBBLE ANALYSIS TOOL
Breathing Profile Report
Generated: ${new Date().toLocaleDateString()}
────────────────────────────────────────

ANALYSIS SUMMARY
${results.length} nights analyzed
${therapyModeDate ? `Transition date: ${therapyModeDate}` : 'No transition date set'}

${hasStats ? `
PERIOD 1 (Before Transition)
  Nights: ${stats.period1.count}
  Flow Limitation: ${stats.period1.flMean} (mean) / ${stats.period1.flMedian} (median)
  Regularity Score: ${stats.period1.rsMean} (mean) / ${stats.period1.rsMedian} (median)
  Periodicity Index: ${stats.period1.piMean} (mean) / ${stats.period1.piMedian} (median)

PERIOD 2 (After Transition)
  Nights: ${stats.period2.count}
  Flow Limitation: ${stats.period2.flMean} (mean) / ${stats.period2.flMedian} (median)
  Regularity Score: ${stats.period2.rsMean} (mean) / ${stats.period2.rsMedian} (median)
  Periodicity Index: ${stats.period2.piMean} (mean) / ${stats.period2.piMedian} (median)

CHANGES
  Flow Limitation: ${((parseFloat(stats.period2.flMean) - parseFloat(stats.period1.flMean)) / parseFloat(stats.period1.flMean) * 100).toFixed(1)}%
  Regularity Score: ${((parseFloat(stats.period2.rsMean) - parseFloat(stats.period1.rsMean)) / parseFloat(stats.period1.rsMean) * 100).toFixed(1)}%
  Periodicity Index: ${((parseFloat(stats.period2.piMean) - parseFloat(stats.period1.piMean)) / parseFloat(stats.period1.piMean) * 100).toFixed(1)}%
` : `
OVERALL STATISTICS
  Flow Limitation: ${(chartData.reduce((sum, d) => sum + d.flScore, 0) / chartData.length).toFixed(1)} (mean)
  Regularity Score: ${(chartData.reduce((sum, d) => sum + d.regularityScore, 0) / chartData.length).toFixed(1)} (mean)
  Periodicity Index: ${(chartData.reduce((sum, d) => sum + d.periodicityIndex, 0) / chartData.length).toFixed(1)} (mean)

  Set a transition date to see period-by-period comparison.
`}

────────────────────────────────────────

METRIC DEFINITIONS

Flow Limitation Score (0-100)
  Measures mechanical upper airway obstruction by analyzing
  inspiratory flow shape. Higher = more flattened flow patterns.

Regularity Score (0-100)
  Measures ventilatory control stability using Sample Entropy.
  Higher = more predictable/repetitive breathing patterns,
  suggesting unstable ventilatory control (high loop gain/wobble).

Periodicity Index (0-100)
  Measures oscillatory content in periodic breathing frequency
  range (0.01-0.03 Hz). Higher = more periodic breathing.

────────────────────────────────────────

DISCLAIMER
This is an experimental research tool created by the sleep apnea
community. Not FDA approved. Not medical advice. Consult qualified
healthcare providers regarding sleep therapy decisions.

Generated by Wobble Analysis Tool (WAT)
                  `;
                  const blob = new Blob([reportContent], { type: 'text/plain' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `WAT_Report_${new Date().toISOString().split('T')[0]}.txt`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(url);
                }}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg transition-colors"
              >
                📥 Download Report
              </button>
              <p className="text-blue-200 text-sm mt-2">
                {stats && stats.period1 && stats.period2 ? 'Download summary as text file' : 'Download summary with overall statistics'}
              </p>
            </div>

            <div className="bg-white/10 backdrop-blur-lg rounded-lg p-6 border border-white/20 mt-6">
              <h3 className="text-2xl font-bold text-white mb-4 text-center">Understanding Your Metrics</h3>

              <div className="space-y-4 text-white">
                <div className="border-l-4 border-orange-400 pl-4">
                  <h4 className="text-lg font-bold text-orange-400 mb-2">Flow Limitation Score (0-100)</h4>
                  <p className="text-sm leading-relaxed">
                    Measures mechanical upper airway obstruction by analyzing inspiratory flow shape.
                    Higher scores indicate more flattened flow patterns, suggesting increased resistance
                    in the upper airway during breathing.
                  </p>
                </div>

                <div className="border-l-4 border-green-400 pl-4">
                  <h4 className="text-lg font-bold text-green-400 mb-2">Regularity Score (0-100)</h4>
                  <p className="text-sm leading-relaxed">
                    Measures ventilatory control stability using Sample Entropy. Higher scores indicate
                    more predictable and repetitive breathing patterns, which paradoxically suggests
                    unstable ventilatory control (high loop gain/wobble). Lower scores suggest more
                    variable, naturally irregular breathing.
                  </p>
                </div>

                <div className="border-l-4 border-blue-400 pl-4">
                  <h4 className="text-lg font-bold text-blue-400 mb-2">Periodicity Index (0-100)</h4>
                  <p className="text-sm leading-relaxed">
                    Measures oscillatory content in the periodic breathing frequency range (0.01-0.03 Hz,
                    or roughly 30-100 second cycles). Higher values indicate more periodic breathing
                    patterns, which can be associated with central sleep apnea or unstable ventilatory control.
                  </p>
                </div>

                <div className="border-l-4 border-purple-400 pl-4">
                  <h4 className="text-lg font-bold text-purple-400 mb-2">Estimated Arousal Index (EAI)</h4>
                  <p className="text-sm leading-relaxed">
                    Estimates respiratory-related arousals per hour based on sudden increases in breathing
                    rate or tidal volume. This is experimental and not validated against polysomnography.
                    Unlike true arousal scoring which requires EEG, this metric only detects respiratory
                    pattern changes. Use for tracking trends over time, not for diagnostic purposes.
                  </p>
                </div>

                <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 mt-6">
                  <p className="text-sm text-blue-100 leading-relaxed">
                    <strong>⚠️ Important Note:</strong> These are <strong>arbitrary scales</strong> developed
                    through community research and will be refined over time with input from a broader range
                    of users and clinical data. The thresholds and interpretations are subject to change as
                    we learn more about what these patterns mean for different individuals. Use these metrics
                    as relative indicators of change over time rather than absolute diagnostic values.
                  </p>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default SleepAnalyzerBatch;
