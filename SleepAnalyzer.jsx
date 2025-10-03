import React, { useState } from 'react';
import { parseEDF } from './utils/edfParser.js';
import {
  analyzeFlowLimitation,
  estimateArousals,
  calculateMinuteVent,
  analyzeNight
} from './utils/analysisAlgorithms.js';
import { prepareChartData, smoothAllMetrics, calculateYRange } from './utils/chartHelpers.js';
import FileUploadSection from './components/FileUploadSection.jsx';
import ComparisonDatesSection from './components/ComparisonDatesSection.jsx';
import ResultsTable from './components/ResultsTable.jsx';
import MetricChart from './components/MetricChart.jsx';
import MetricsGuide from './components/MetricsGuide.jsx';

const SleepAnalyzer = () => {
  const [files, setFiles] = useState([]);
  const [results, setResults] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [error, setError] = useState(null);
  const [minDurationMinutes, setMinDurationMinutes] = useState(30);
  const [comparisonDates, setComparisonDates] = useState([{ date: '', label: '' }]);

  const handleFileUpload = async (event) => {
    const uploadedFiles = Array.from(event.target.files);
    const validFiles = uploadedFiles.filter(f => f.name.endsWith('BRP.edf'));

    if (validFiles.length === 0) {
      setError(`No valid BRP.edf files found`);
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
    setComparisonDates([{ date: '', label: '' }]);
  };

  const generateReport = () => {
    // Calculate period statistics if comparison dates exist
    let periodSections = '';

    const validComparisonDates = comparisonDates.filter(cd => cd.date);
    if (validComparisonDates.length > 0) {
      // Sort comparison dates
      const sortedDates = [...validComparisonDates].sort((a, b) => new Date(a.date) - new Date(b.date));

      // Create periods based on comparison dates
      const periods = [];

      // Period before first comparison date
      const beforeFirst = results.filter(r => r.date < new Date(sortedDates[0].date));
      if (beforeFirst.length > 0) {
        periods.push({
          name: `Period 1`,
          label: `Before ${sortedDates[0].label || sortedDates[0].date}`,
          results: beforeFirst
        });
      }

      // Periods between comparison dates
      for (let i = 0; i < sortedDates.length - 1; i++) {
        const periodResults = results.filter(r =>
          r.date >= new Date(sortedDates[i].date) && r.date < new Date(sortedDates[i + 1].date)
        );
        if (periodResults.length > 0) {
          periods.push({
            name: `Period ${periods.length + 1}`,
            label: `After ${sortedDates[i].label || sortedDates[i].date}`,
            results: periodResults
          });
        }
      }

      // Period after last comparison date
      const afterLast = results.filter(r => r.date >= new Date(sortedDates[sortedDates.length - 1].date));
      if (afterLast.length > 0) {
        periods.push({
          name: `Period ${periods.length + 1}`,
          label: `After ${sortedDates[sortedDates.length - 1].label || sortedDates[sortedDates.length - 1].date}`,
          results: afterLast
        });
      }

      // Generate period statistics
      periodSections = periods.map((period, idx) => {
        const totalDuration = period.results.reduce((sum, n) => sum + n.durationMinutes, 0);
        const flWeighted = period.results.reduce((sum, n) => sum + (n.flScore * n.durationMinutes), 0) / totalDuration;
        const piWeighted = period.results.reduce((sum, n) => sum + (n.periodicityIndex * n.durationMinutes), 0) / totalDuration;
        const rsWeighted = period.results.reduce((sum, n) => sum + (n.regularityScore * n.durationMinutes), 0) / totalDuration;
        const eaiWeighted = period.results.reduce((sum, n) => sum + (n.eai * n.durationMinutes), 0) / totalDuration;

        const fl = period.results.map(n => n.flScore).sort((a, b) => a - b);
        const pi = period.results.map(n => n.periodicityIndex).sort((a, b) => a - b);
        const rs = period.results.map(n => n.regularityScore).sort((a, b) => a - b);
        const eai = period.results.map(n => n.eai).sort((a, b) => a - b);

        return `
${period.name.toUpperCase()}${period.label ? ' (' + period.label + ')' : ''}
  Sessions: ${period.results.length}
  Total Duration: ${(totalDuration / 60).toFixed(1)} hours

  Flow Limitation:
    Mean (weighted): ${flWeighted.toFixed(1)}
    Median: ${fl[Math.floor(fl.length / 2)].toFixed(1)}

  Regularity Score:
    Mean (weighted): ${rsWeighted.toFixed(1)}
    Median: ${rs[Math.floor(rs.length / 2)].toFixed(1)}

  Periodicity Index:
    Mean (weighted): ${piWeighted.toFixed(1)}
    Median: ${pi[Math.floor(pi.length / 2)].toFixed(1)}

  Estimated Arousal Index:
    Mean (weighted): ${eaiWeighted.toFixed(1)}
    Median: ${eai[Math.floor(eai.length / 2)].toFixed(1)}
`;
      }).join('\n────────────────────────────────────────\n');
    }

    const reportContent = `
WAT - WOBBLE ANALYSIS TOOL
Breathing Profile Report
Generated: ${new Date().toLocaleDateString()}
────────────────────────────────────────

ANALYSIS SUMMARY
${results.length} nights analyzed
${validComparisonDates.length > 0 ? `${validComparisonDates.length} comparison date(s) set` : 'No comparison dates set'}

${periodSections ? '────────────────────────────────────────\n\nPERIOD BREAKDOWN\n' + periodSections + '\n────────────────────────────────────────\n' : ''}
OVERALL STATISTICS
  Flow Limitation: ${(chartData.reduce((sum, d) => sum + d.flScore, 0) / chartData.length).toFixed(1)} (mean)
  Regularity Score: ${(chartData.reduce((sum, d) => sum + d.regularityScore, 0) / chartData.length).toFixed(1)} (mean)
  Periodicity Index: ${(chartData.reduce((sum, d) => sum + d.periodicityIndex, 0) / chartData.length).toFixed(1)} (mean)
  Estimated Arousal Index: ${(chartData.reduce((sum, d) => sum + d.eai, 0) / chartData.length).toFixed(1)} (mean)

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

Estimated Arousal Index
  Experimental metric estimating respiratory-related arousals
  per hour. Not validated against polysomnography.

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
  };

  // Prepare and smooth chart data
  const chartData = prepareChartData(results);
  const smoothedData = smoothAllMetrics(chartData);

  // Calculate Y-axis ranges
  const flRange = calculateYRange(chartData.map(d => d.flScore));
  const rsRange = calculateYRange(chartData.map(d => d.regularityScore));
  const piRange = calculateYRange(chartData.map(d => d.periodicityIndex));
  const eaiRange = calculateYRange(chartData.map(d => d.eai), 2, 0, 1000);
  const compositeRange = calculateYRange(chartData.map(d => d.composite));

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

        <FileUploadSection
          onFileUpload={handleFileUpload}
          files={files}
          processing={processing}
          progress={progress}
          error={error}
          onReset={handleReset}
          hasResults={results.length > 0}
          minDurationMinutes={minDurationMinutes}
          setMinDurationMinutes={setMinDurationMinutes}
        />

        {results.length > 0 && (
          <>
            <ResultsTable results={results} />

            <ComparisonDatesSection
              comparisonDates={comparisonDates}
              onAdd={addComparisonDate}
              onRemove={removeComparisonDate}
              onUpdate={updateComparisonDate}
            />

            <MetricChart
              data={smoothedData}
              dataKey="composite"
              smoothDataKey="compositeSmooth"
              title="Sleep Disruption Score"
              description="Combined metric: averages the three 0-100 scores with EAI. Lower is better."
              color="#f472b6"
              yMin={compositeRange.min}
              yMax={compositeRange.max}
              comparisonDates={comparisonDates}
            />

            <MetricChart
              data={smoothedData}
              dataKey="flScore"
              smoothDataKey="flScoreSmooth"
              title="Flow Limitation"
              color="#fb923c"
              yMin={flRange.min}
              yMax={flRange.max}
              comparisonDates={comparisonDates}
            />

            <MetricChart
              data={smoothedData}
              dataKey="regularityScore"
              smoothDataKey="regularityScoreSmooth"
              title="Regularity Score"
              color="#34d399"
              yMin={rsRange.min}
              yMax={rsRange.max}
              comparisonDates={comparisonDates}
            />

            <MetricChart
              data={smoothedData}
              dataKey="periodicityIndex"
              smoothDataKey="periodicityIndexSmooth"
              title="Periodicity Index"
              color="#60a5fa"
              yMin={piRange.min}
              yMax={piRange.max}
              comparisonDates={comparisonDates}
            />

            <MetricChart
              data={smoothedData}
              dataKey="eai"
              smoothDataKey="eaiSmooth"
              title="Estimated Arousal Index (EAI)"
              description="⚠️ Experimental metric based on respiratory patterns only. Not validated against polysomnography. Use for trend tracking, not diagnosis."
              color="#a78bfa"
              yMin={eaiRange.min}
              yMax={eaiRange.max}
              comparisonDates={comparisonDates}
            />

            <div className="bg-white/10 backdrop-blur-lg rounded-lg p-6 border border-white/20 text-center">
              <button
                onClick={generateReport}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg transition-colors"
              >
                📥 Download Report
              </button>
              <p className="text-blue-200 text-sm mt-2">
                Download summary with overall statistics
              </p>
            </div>

            <MetricsGuide />
          </>
        )}
      </div>
    </div>
  );
};

export default SleepAnalyzer;
