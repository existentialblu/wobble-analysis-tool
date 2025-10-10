// Longitudinal analysis functionality

// Event listeners
minDurationSlider.addEventListener('input', (e) => {
    minDurationValue.textContent = e.target.value;
});

folderInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        processFolderBtn.disabled = false;
        updateStatus(`${e.target.files.length} files selected.`, 'info');
    }
});

processFolderBtn.addEventListener('click', async () => {
    const files = Array.from(folderInput.files);
    const minDuration = parseInt(minDurationSlider.value);

    // Filter for BRP.edf files
    const brpFiles = files.filter(f => f.name.includes('BRP.edf'));

    if (brpFiles.length === 0) {
        updateStatus('No BRP.edf files found in selection.', 'error');
        return;
    }

    updateStatus(`Processing ${brpFiles.length} BRP files...`, 'info');
    processFolderBtn.disabled = true;

    longitudinalData = [];
    let processed = 0;
    let skipped = 0;

    for (const file of brpFiles) {
        try {
            const buffer = await file.arrayBuffer();
            const { flowData, samplingRate, durationMinutes } = await analyzer.parseEDF(buffer);

            if (durationMinutes < minDuration) {
                skipped++;
                continue;
            }

            const arousals = analyzer.analyzeArousals(flowData, samplingRate);
            const stats = analyzer.calculateStats(arousals);

            // Extract date from filename (format: YYYYMMDD_HHMMSS_BRP.edf)
            const dateMatch = file.name.match(/(\d{8})/);
            const date = dateMatch ? parseDateFromFilename(dateMatch[1]) : new Date();

            longitudinalData.push({
                date: date,
                filename: file.name,
                durationMinutes: durationMinutes,
                arousals: arousals,
                stats: stats
            });

            processed++;
            updateStatus(`Processed ${processed}/${brpFiles.length} files...`, 'info');

        } catch (error) {
            console.error(`Error processing ${file.name}:`, error);
            skipped++;
        }
    }

    if (longitudinalData.length === 0) {
        updateStatus('No valid files processed.', 'error');
        processFolderBtn.disabled = false;
        return;
    }

    // Sort by date
    longitudinalData.sort((a, b) => a.date - b.date);

    // Display results
    displayLongitudinalResults();

    updateStatus(`Analysis complete! Processed ${processed} files, skipped ${skipped}.`, 'success');
    longitudinalResults.style.display = 'block';
    processFolderBtn.disabled = false;
});

toggleLongitudinalTable.addEventListener('click', () => {
    const isVisible = longitudinalTableContainer.style.display !== 'none';
    longitudinalTableContainer.style.display = isVisible ? 'none' : 'block';
    toggleLongitudinalTable.textContent = isVisible ? '▼ Show Detailed Results' : '▲ Hide Detailed Results';
});

function parseDateFromFilename(dateStr) {
    const year = parseInt(dateStr.substring(0, 4));
    const month = parseInt(dateStr.substring(4, 6)) - 1;
    const day = parseInt(dateStr.substring(6, 8));
    return new Date(year, month, day);
}

function calculateRollingAverage(data, windowSize) {
    const result = [];
    for (let i = 0; i < data.length; i++) {
        const start = Math.max(0, i - Math.floor(windowSize / 2));
        const end = Math.min(data.length, i + Math.ceil(windowSize / 2));
        const window = data.slice(start, end);
        const avg = window.reduce((sum, val) => sum + val, 0) / window.length;
        result.push(avg);
    }
    return result;
}

function displayLongitudinalResults() {
    // Prepare data for charts
    const dates = longitudinalData.map(d => d.date.toLocaleDateString());
    const meanFlowRemaining = longitudinalData.map(d => d.stats.meanNadir);
    const medianFlowRemaining = longitudinalData.map(d => d.stats.medianNadir);
    const meanNadirToArousal = longitudinalData.map(d => d.stats.meanRecoveryTime);

    // Calculate 7-day rolling averages
    const windowSize = 7;
    const meanFlowRolling = calculateRollingAverage(meanFlowRemaining, windowSize);
    const medianFlowRolling = calculateRollingAverage(medianFlowRemaining, windowSize);
    const nadirToArousalRolling = calculateRollingAverage(meanNadirToArousal, windowSize);

    // Clear previous charts
    const chartsContainer = document.getElementById('longitudinalCharts');
    chartsContainer.innerHTML = `
        <div style="height: 400px; margin-bottom: 30px;">
            <canvas id="flowRemainingChart"></canvas>
        </div>
        <div style="height: 400px; margin-bottom: 30px;">
            <canvas id="nadirToArousalChart"></canvas>
        </div>
    `;

    // Flow Remaining Chart
    new Chart(document.getElementById('flowRemainingChart'), {
        type: 'line',
        data: {
            labels: dates,
            datasets: [
                {
                    label: 'Mean Flow Remaining (7-day avg)',
                    data: meanFlowRolling,
                    borderColor: '#4a9eff',
                    backgroundColor: 'rgba(74, 158, 255, 0.1)',
                    borderWidth: 3,
                    pointRadius: 0,
                    tension: 0.4
                },
                {
                    label: 'Median Flow Remaining (7-day avg)',
                    data: medianFlowRolling,
                    borderColor: '#51cf66',
                    backgroundColor: 'rgba(81, 207, 102, 0.1)',
                    borderWidth: 3,
                    pointRadius: 0,
                    tension: 0.4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: 'Flow Remaining at Arousal Over Time',
                    font: { size: 16 },
                    color: '#e0e0e0'
                },
                legend: {
                    labels: { color: '#e0e0e0' }
                }
            },
            scales: {
                y: {
                    title: {
                        display: true,
                        text: 'Flow Remaining (%)',
                        color: '#e0e0e0'
                    },
                    ticks: { color: '#e0e0e0' },
                    grid: { color: 'rgba(255, 255, 255, 0.1)' }
                },
                x: {
                    ticks: {
                        color: '#e0e0e0',
                        maxRotation: 45,
                        minRotation: 45
                    },
                    grid: { color: 'rgba(255, 255, 255, 0.1)' }
                }
            }
        }
    });

    // Nadir-to-Arousal Time Chart
    new Chart(document.getElementById('nadirToArousalChart'), {
        type: 'line',
        data: {
            labels: dates,
            datasets: [
                {
                    label: 'Mean Nadir-to-Arousal Time (7-day avg)',
                    data: nadirToArousalRolling,
                    borderColor: '#a78bfa',
                    backgroundColor: 'rgba(167, 139, 250, 0.1)',
                    borderWidth: 3,
                    pointRadius: 0,
                    tension: 0.4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: 'Nadir-to-Arousal Time Over Time',
                    font: { size: 16 },
                    color: '#e0e0e0'
                },
                legend: {
                    labels: { color: '#e0e0e0' }
                }
            },
            scales: {
                y: {
                    title: {
                        display: true,
                        text: 'Time (seconds)',
                        color: '#e0e0e0'
                    },
                    ticks: { color: '#e0e0e0' },
                    grid: { color: 'rgba(255, 255, 255, 0.1)' }
                },
                x: {
                    ticks: {
                        color: '#e0e0e0',
                        maxRotation: 45,
                        minRotation: 45
                    },
                    grid: { color: 'rgba(255, 255, 255, 0.1)' }
                }
            }
        }
    });

    // Populate table
    const tbody = document.getElementById('longitudinalTableBody');
    tbody.innerHTML = '';

    longitudinalData.forEach(d => {
        const row = tbody.insertRow();
        row.insertCell(0).textContent = d.date.toLocaleDateString();
        row.insertCell(1).textContent = (d.durationMinutes / 60).toFixed(1);
        row.insertCell(2).textContent = d.stats.total;
        row.insertCell(3).textContent = d.stats.meanNadir.toFixed(1);
        row.insertCell(4).textContent = d.stats.medianNadir.toFixed(1);
        row.insertCell(5).textContent = d.stats.meanRecoveryTime.toFixed(1);
    });
}

downloadLongitudinalBtn.addEventListener('click', () => {
    if (longitudinalData.length === 0) return;

    let csv = 'Date,Duration (h),Total Arousals,Mean Flow Remaining (%),Median Flow Remaining (%),Mean Nadir-to-Arousal (s)\n';

    longitudinalData.forEach(d => {
        csv += `${d.date.toLocaleDateString()},${(d.durationMinutes / 60).toFixed(1)},${d.stats.total},${d.stats.meanNadir.toFixed(1)},${d.stats.medianNadir.toFixed(1)},${d.stats.meanRecoveryTime.toFixed(1)}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'longitudinal-arousal-thresholds.csv';
    a.click();
    URL.revokeObjectURL(url);
});
