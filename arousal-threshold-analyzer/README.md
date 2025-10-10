# Arousal Threshold Analyzer

A standalone web tool for analyzing arousal thresholds from ResMed BRP.edf files.

## What It Does

This tool analyzes flow limitation patterns and identifies the "arousal threshold" - the point at which your body wakes you up in response to flow limitation. It works by:

1. Extracting flow rate signals from BRP files
2. Detecting individual breaths and calculating peak flows
3. Identifying recovery breaths (sudden increases in flow after limitation)
4. Finding the nadir (lowest point) in the 3 breaths preceding each recovery
5. Calculating what percentage of baseline flow remained at the nadir

## Key Metrics

- **Flow Remaining (%)**: Percentage of baseline airflow still getting through at the nadir. Higher values mean you're arousing at milder flow limitation (higher arousal threshold).
- **Nadir-to-Arousal Time (s)**: Time from the lowest flow point to the recovery breath.
- **Recovery Breath Size (%)**: How much the recovery breath exceeds baseline.

## How to Use

### Single File Analysis
1. Open `index.html` in a web browser
2. Select a single BRP.edf file
3. Click "Analyze Single File"
4. View stats and individual arousal events
5. Download CSV of results

### Longitudinal Analysis
1. Select multiple BRP.edf files from a folder
2. Adjust minimum duration filter (default 30 minutes)
3. Click "Analyze Multiple Files"
4. View 7-day rolling average charts
5. Expand detailed table for nightly statistics
6. Download longitudinal CSV

## Technical Details

- **Baseline calculation**: 5-minute rolling average of peak flows from immediately preceding breaths
- **Recovery breath detection**: >30% increase from current breath, and >120% of baseline
- **Nadir search window**: 3 breaths preceding the recovery breath
- **Arousal validation**: Recovery must occur 1-60 seconds after nadir

## Interpretation

**High flow remaining (70-90%)**: Arousing at mild flow limitation. May indicate:
- Effective PAP therapy preventing deep obstruction
- Low arousal threshold (arousing "too easily")
- High loop gain

**Low flow remaining (10-50%)**: Arousing at severe flow limitation. May indicate:
- Inadequate PAP therapy
- High arousal threshold (tolerating more obstruction)
- Airway instability

## Running Locally

Simply open `index.html` in a modern web browser. No build process or server required (though you may need a local HTTP server due to CORS restrictions on file:// URLs).

Using Python:
```bash
python -m http.server 8001
```

Then navigate to `http://localhost:8001/arousal-threshold-analyzer/`
