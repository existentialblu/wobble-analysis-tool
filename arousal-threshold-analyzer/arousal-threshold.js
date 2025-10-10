// Arousal Threshold Analyzer
// Analyzes flow limitation nadirs and arousal patterns

class ArousalThresholdAnalyzer {
    constructor() {
        this.arousals = [];
    }

    // Parse EDF file (simplified version)
    async parseEDF(arrayBuffer) {
        const dataView = new DataView(arrayBuffer);
        let offset = 0;

        // Read header (256 bytes)
        offset += 8; // version
        offset += 80; // patient ID
        offset += 80; // recording ID

        const startDate = this.readString(dataView, offset, 8); offset += 8;
        const startTime = this.readString(dataView, offset, 8); offset += 8;
        const headerBytes = parseInt(this.readString(dataView, offset, 8)); offset += 8;
        offset += 44; // reserved
        const numRecords = parseInt(this.readString(dataView, offset, 8)); offset += 8;
        const recordDuration = parseFloat(this.readString(dataView, offset, 8)); offset += 8;
        const numSignals = parseInt(this.readString(dataView, offset, 4)); offset += 4;

        // Read signal labels
        const signalLabels = [];
        for (let i = 0; i < numSignals; i++) {
            signalLabels.push(this.readString(dataView, offset, 16).trim());
            offset += 16;
        }

        // Find flow signal
        const flowIndex = signalLabels.findIndex(label =>
            label.toLowerCase().includes('flow')
        );

        if (flowIndex === -1) {
            throw new Error('Flow signal not found in EDF file');
        }

        // Skip transducer types and dimensions
        offset += numSignals * 80; // transducer
        offset += numSignals * 8; // dimensions

        // Read physical min/max
        const physicalMin = [];
        const physicalMax = [];
        for (let i = 0; i < numSignals; i++) {
            physicalMin.push(parseFloat(this.readString(dataView, offset, 8)));
            offset += 8;
        }
        for (let i = 0; i < numSignals; i++) {
            physicalMax.push(parseFloat(this.readString(dataView, offset, 8)));
            offset += 8;
        }

        // Read digital min/max
        const digitalMin = [];
        const digitalMax = [];
        for (let i = 0; i < numSignals; i++) {
            digitalMin.push(parseInt(this.readString(dataView, offset, 8)));
            offset += 8;
        }
        for (let i = 0; i < numSignals; i++) {
            digitalMax.push(parseInt(this.readString(dataView, offset, 8)));
            offset += 8;
        }

        // Skip prefiltering
        offset += numSignals * 80;

        // Read samples per record
        const samplesPerRecord = [];
        for (let i = 0; i < numSignals; i++) {
            samplesPerRecord.push(parseInt(this.readString(dataView, offset, 8)));
            offset += 8;
        }

        // Skip reserved
        offset += numSignals * 32;

        // Extract flow signal
        const flowData = this.extractSignal(
            dataView,
            headerBytes,
            numRecords,
            numSignals,
            flowIndex,
            samplesPerRecord,
            physicalMin[flowIndex],
            physicalMax[flowIndex],
            digitalMin[flowIndex],
            digitalMax[flowIndex]
        );

        const samplingRate = samplesPerRecord[flowIndex] / recordDuration;

        return {
            flowData,
            samplingRate,
            durationMinutes: (numRecords * recordDuration) / 60
        };
    }

    extractSignal(dataView, headerBytes, numRecords, numSignals, signalIndex,
                  samplesPerRecord, physMin, physMax, digMin, digMax) {
        const totalSamples = numRecords * samplesPerRecord[signalIndex];
        const signal = new Float32Array(totalSamples);

        const scale = (physMax - physMin) / (digMax - digMin);
        const offset = physMin - digMin * scale;

        let sampleIndex = 0;
        let dataOffset = headerBytes;

        for (let record = 0; record < numRecords; record++) {
            let recordOffset = dataOffset;

            // Skip to our signal
            for (let i = 0; i < signalIndex; i++) {
                recordOffset += samplesPerRecord[i] * 2;
            }

            // Read samples
            for (let i = 0; i < samplesPerRecord[signalIndex]; i++) {
                const digitalValue = dataView.getInt16(recordOffset, true);
                signal[sampleIndex++] = digitalValue * scale + offset;
                recordOffset += 2;
            }

            // Move to next record
            for (let i = 0; i < numSignals; i++) {
                dataOffset += samplesPerRecord[i] * 2;
            }
        }

        return signal;
    }

    readString(dataView, offset, length) {
        let str = '';
        for (let i = 0; i < length; i++) {
            const char = dataView.getUint8(offset + i);
            if (char === 0) break;
            str += String.fromCharCode(char);
        }
        return str.trim();
    }

    // Detect breaths from flow data
    detectBreaths(flowData, samplingRate) {
        const breaths = [];
        let inInspiration = false;
        let inspirationStart = 0;

        for (let i = 1; i < flowData.length; i++) {
            if (flowData[i] > 0 && flowData[i-1] <= 0) {
                // Start of inspiration
                inspirationStart = i;
                inInspiration = true;
            } else if (flowData[i] <= 0 && flowData[i-1] > 0 && inInspiration) {
                // End of inspiration
                const inspirationEnd = i;

                // Extract inspiration flow
                const inspFlow = flowData.slice(inspirationStart, inspirationEnd);
                const peakFlow = Math.max(...inspFlow);

                breaths.push({
                    startIndex: inspirationStart,
                    endIndex: inspirationEnd,
                    startTime: inspirationStart / samplingRate,
                    peakFlow: peakFlow,
                    duration: (inspirationEnd - inspirationStart) / samplingRate
                });

                inInspiration = false;
            }
        }

        return breaths;
    }

    // Analyze arousal thresholds
    analyzeArousals(flowData, samplingRate) {
        const breaths = this.detectBreaths(flowData, samplingRate);

        if (breaths.length < 10) {
            return [];
        }

        const arousals = [];
        const baselineWindowSeconds = 300; // 5 minutes

        for (let i = 10; i < breaths.length - 1; i++) {
            const currentBreath = breaths[i];
            const nextBreath = breaths[i + 1];

            // Get 5-minute baseline from immediately preceding breaths
            const baselineEndTime = currentBreath.startTime;
            const baselineStartTime = baselineEndTime - baselineWindowSeconds;

            const baselineBreaths = breaths.filter(b =>
                b.startTime >= baselineStartTime && b.startTime < baselineEndTime
            );

            if (baselineBreaths.length < 10) continue;

            const baselineFlow = baselineBreaths.reduce((sum, b) => sum + b.peakFlow, 0) / baselineBreaths.length;

            // Check if next breath is a recovery breath (>30% increase from current)
            const flowIncrease = (nextBreath.peakFlow - currentBreath.peakFlow) / currentBreath.peakFlow;

            if (flowIncrease > 0.3 && nextBreath.peakFlow > baselineFlow * 1.2) {
                // Recovery breath detected - find nadir in preceding 3 breaths
                const nadirStartIndex = Math.max(0, i - 3);
                const nadirCandidates = breaths.slice(nadirStartIndex, i + 1);

                if (nadirCandidates.length === 0) continue;

                const nadirBreath = nadirCandidates.reduce((min, b) =>
                    b.peakFlow < min.peakFlow ? b : min
                );

                // Calculate percentage of baseline flow remaining at nadir
                const flowRemaining = (nadirBreath.peakFlow / baselineFlow) * 100;
                const timeToRecovery = nextBreath.startTime - nadirBreath.startTime;
                const recoverySize = ((nextBreath.peakFlow - baselineFlow) / baselineFlow) * 100;

                // Only count if recovery timing makes sense
                if (timeToRecovery < 60 && timeToRecovery > 1) {
                    arousals.push({
                        time: nextBreath.startTime,
                        nadirDepth: flowRemaining, // Now it's "% of baseline remaining"
                        timeToRecovery: timeToRecovery,
                        recoverySize: recoverySize,
                        baselineFlow: baselineFlow,
                        nadirFlow: nadirBreath.peakFlow,
                        recoveryFlow: nextBreath.peakFlow
                    });

                    // Skip ahead to avoid detecting same event multiple times
                    i += 10;
                }
            }
        }

        return arousals;
    }

    calculateStats(arousals) {
        if (arousals.length === 0) {
            return {
                total: 0,
                meanNadir: 0,
                medianNadir: 0,
                meanRecoveryTime: 0,
                meanRecoverySize: 0
            };
        }

        const nadirDepths = arousals.map(a => a.nadirDepth).sort((a, b) => a - b);
        const recoveryTimes = arousals.map(a => a.timeToRecovery);
        const recoverySizes = arousals.map(a => a.recoverySize);

        return {
            total: arousals.length,
            meanNadir: nadirDepths.reduce((a, b) => a + b) / nadirDepths.length,
            medianNadir: nadirDepths[Math.floor(nadirDepths.length / 2)],
            meanRecoveryTime: recoveryTimes.reduce((a, b) => a + b) / recoveryTimes.length,
            meanRecoverySize: recoverySizes.reduce((a, b) => a + b) / recoverySizes.length
        };
    }
}

// UI Controller
const analyzer = new ArousalThresholdAnalyzer();
let currentArousals = [];
let longitudinalData = [];

const fileInput = document.getElementById('fileInput');
const folderInput = document.getElementById('folderInput');
const processBtn = document.getElementById('processBtn');
const processFolderBtn = document.getElementById('processFolderBtn');
const resetBtn = document.getElementById('resetBtn');
const downloadBtn = document.getElementById('downloadBtn');
const downloadLongitudinalBtn = document.getElementById('downloadLongitudinalBtn');
const toggleLongitudinalTable = document.getElementById('toggleLongitudinalTable');
const minDurationSlider = document.getElementById('minDuration');
const minDurationValue = document.getElementById('minDurationValue');
const status = document.getElementById('status');
const singleResults = document.getElementById('singleResults');
const longitudinalResults = document.getElementById('longitudinalResults');
const longitudinalTableContainer = document.getElementById('longitudinalTableContainer');

fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        processBtn.disabled = false;
        updateStatus('File selected. Click "Process File" to analyze.', 'info');
    }
});

processBtn.addEventListener('click', async () => {
    const file = fileInput.files[0];
    if (!file) return;

    updateStatus('Processing file...', 'info');
    processBtn.disabled = true;

    try {
        const buffer = await file.arrayBuffer();
        const { flowData, samplingRate, durationMinutes } = await analyzer.parseEDF(buffer);

        updateStatus(`Analyzing ${durationMinutes.toFixed(1)} minutes of data...`, 'info');

        currentArousals = analyzer.analyzeArousals(flowData, samplingRate);
        const stats = analyzer.calculateStats(currentArousals);

        // Display results
        displayResults(stats, currentArousals);

        updateStatus('Analysis complete!', 'success');
        singleResults.style.display = 'block';

    } catch (error) {
        updateStatus(`Error: ${error.message}`, 'error');
        console.error(error);
        processBtn.disabled = false;
    }
});

resetBtn.addEventListener('click', () => {
    fileInput.value = '';
    folderInput.value = '';
    processBtn.disabled = true;
    processFolderBtn.disabled = true;
    singleResults.style.display = 'none';
    longitudinalResults.style.display = 'none';
    currentArousals = [];
    longitudinalData = [];
    updateStatus('', '');
});

downloadBtn.addEventListener('click', () => {
    if (currentArousals.length === 0) return;

    let csv = 'Time (s),Nadir Depth (%),Time to Recovery (s),Recovery Size (%),Baseline Flow,Nadir Flow,Recovery Flow\n';

    currentArousals.forEach(a => {
        csv += `${a.time.toFixed(1)},${a.nadirDepth.toFixed(1)},${a.timeToRecovery.toFixed(1)},${a.recoverySize.toFixed(1)},${a.baselineFlow.toFixed(2)},${a.nadirFlow.toFixed(2)},${a.recoveryFlow.toFixed(2)}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'arousal-thresholds.csv';
    a.click();
    URL.revokeObjectURL(url);
});

function displayResults(stats, arousals) {
    document.getElementById('totalArousals').textContent = stats.total;
    document.getElementById('meanNadir').textContent = stats.meanNadir.toFixed(1);
    document.getElementById('medianNadir').textContent = stats.medianNadir.toFixed(1);
    document.getElementById('meanRecoveryTime').textContent = stats.meanRecoveryTime.toFixed(1);

    const tbody = document.getElementById('arousalTableBody');
    tbody.innerHTML = '';

    arousals.forEach(a => {
        const row = tbody.insertRow();
        row.insertCell(0).textContent = formatTime(a.time);
        row.insertCell(1).textContent = a.nadirDepth.toFixed(1);
        row.insertCell(2).textContent = a.timeToRecovery.toFixed(1);
        row.insertCell(3).textContent = a.recoverySize.toFixed(1);
    });
}

function formatTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return `${hours}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function updateStatus(message, type) {
    status.textContent = message;
    status.className = type;
}
