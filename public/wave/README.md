# WAVE 0.1

**Wobble Amplitude & Variability Evaluation** — a separate tool for examining ventilation-wave envelopes, packets, and their changes across nights.

## Start

Open **index.html** in Chrome or Edge. Everything runs locally in this single file: no installation, build, server, account, or internet connection is needed. The source folder is optional. Try **Synthetic demo** to explore the interface without importing recordings.

1. Select your DATALOG folder, select EDF files, or drop files/folders into the import area.
2. Watch the import status: a spinner appears during selection and folder listing, then a running file count during checking. **Ready to process** confirms the queue is prepared. Review the analysis settings and click **Process**. Import queues files; processing starts explicitly.
3. Explore the longitudinal charts, month groups, and **Wubscape**. Filter dates, ventilation source, and nights/naps. Click a period for detail.
4. Select packets or zoom the time range to inspect the ventilation envelope, pressure, leak, and available raw airflow. Previous/next moves through windows of the same length.
5. Use **Compare** for date ranges or reproducible random samples. Run optional controls for the selected period or filtered periods.

PLD supplies device minute ventilation. Paired BRP supplies airflow detail and an independent envelope comparison; BRP-only imports can use flow-derived ventilation. These sources are labeled and analyzed separately. Keep matching PLD and BRP files together for full detail.

## Longitudinal interpretation

The five trend charts cover absolute and relative envelope amplitude, strong-wave fraction, packet duration, and long packets. Quiet-to-active contrast has been removed from these charts and the range comparison table.

Faint markers show individual periods; smooth curves highlight the trend. Choose 7, 14 (default), or 28 days of centered Gaussian smoothing. Dates near the center receive more weight, with a standard deviation of one quarter of the chosen window. This display-only setting uses the filtered periods, keeps sources separate, and breaks across gaps longer than 10 days. Curves stay within neighboring smoothed values. Hover for the original period value and its smoothed value; click to open the period. Wubscape displays within-period strength, with excluded or missing data distinguished from usable quiet data.

Nearby sessions are grouped using the selected gap, with a maximum 18-hour span and separate ventilation sources. Groups shorter than three recorded hours receive a Nap label. Group amplitudes are usable-time-weighted session medians. This grouping can differ from the original analysis grouped by DATALOG folder date.

Pressure-derived labels indicate fixed, variable, or unknown support; they do not establish the machine's configured therapy mode. Add your own labels and notes for mode changes, illness, or other context. The packaged demo is entirely synthetic.

## Analysis

Defaults reproduce the prior WAVE analysis: a third-order Butterworth 20–120-second bandpass, forward/backward filtering, Hilbert amplitude divided by square root of two, and centered envelope smoothing. Nominal 120-second smoothing uses 61 two-second samples (122 seconds). The local baseline is 302 seconds.

Five-minute session edges and leak/invalid-data buffers are excluded. Strong packets use a default 0.6 L/min threshold, minimum 120-second duration, and at most 30-second internal gaps; packets touching invalid boundaries are excluded. Relative thresholds and alternative band, clipping, RMS, leak, and pressure-stability checks are available in the detail view. Changing core settings requires reprocessing.

Optional controls compare measured modulation with phase-randomized and IAAFT surrogate signals, using one seeded random 90-minute block per period or all eligible blocks. IAAFT also preserves the amplitude distribution and reports spectral mismatch. Small surrogate counts give coarse p values. Benjamini–Hochberg q values adjust across the current run's blocks for each metric, method, and ventilation source. Multiple blocks within a night are not independent nights. Control runs can be computationally expensive and can be canceled.

These are exploratory waveform measurements. Recording time is not scored sleep, and envelope structure alone does not establish a second physiological oscillator or its cause.

## Save and privacy

Export period, packet, and control tables as CSV. **Save results** downloads a summary JSON with settings and annotations. Restoring it brings back the longitudinal summaries and notes. Original EDF files must be selected and processed again for full detail or new control calculations. Previous controls remain in the saved JSON but are not repopulated into the controls panel on restore; new runs start fresh.

No recordings, personal results, or identifying notes are shipped with this tool. There are no network requests, external libraries, analytics, or automatic browser storage. Processing occurs in a local worker; data stay in memory until cleared or the page closes. Explicitly exported files contain your summaries and notes, so treat them as your own health data.

## Reference and validation

Workflow reference: [current WAT v0.5 pre-release](https://github.com/existentialblu/wobble-analysis-tool/tree/fcd24e08e06ee0f0d42e648185f03bda64e2bce6), main commit `fcd24e08e06ee0f0d42e648185f03bda64e2bce6`, August 8, 2026. Earlier WAT implementations were not used. WAVE is a separate implementation with the current WAT's portable workflow as its reference.

Compared with the prior Python/SciPy analysis across **147 sessions**, usable duration, strong-wave fractions, and packet counts agreed to floating-point precision. The maximum envelope-amplitude summary difference was approximately **1.3 × 10⁻¹² L/min**. Ten numerical, worker-protocol, and assembled-HTML DOM checks passed. DOM tests use mocked canvas drawing; live browser rendering was not tested. Aggregate results are in VALIDATION.json. Personal validation recordings and arrays are deliberately excluded.

## Source

WAVE source is maintained in `tools/wave/` in the WAT repository. Run `npm run build:wave` at the repository root to regenerate this standalone page. See the repository README for site build and publication instructions.

MIT license; see LICENSE.
