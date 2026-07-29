# Wobble Analysis Tool

A dependency-free, local-only browser tool for exploratory analysis of ResMed
`*_BRP.edf` flow files.

Current version: **v0.5 pre-release**. The filtering and derived metrics remain
experimental and should be validated against representative real-world data.

## Run

Open `index.html` in a modern Chromium-based browser. Click **Select data** and
choose either the entire DATALOG folder or individual EDF files. Selection only
queues the files; press **Process selected** to begin analysis. The tool ignores
non-EDF files. Drag-and-drop remains available. No install, build step, server,
or network connection is required.

## Filtering pipeline

1. Validate and calibrate the EDF flow channel.
2. Replace isolated spikes using robust, median-absolute-deviation thresholds.
3. Remove slow baseline drift, then apply a configurable low-pass smoother.
4. Reject 30-second windows with flatlines, clipping, excessive derivative noise,
   or insufficient valid data.
5. Detect breaths with adaptive hysteresis rather than raw zero crossings.
6. Use robust nightly summaries and overlapping Hann-windowed spectra.

The preprocessing implementation uses single-pass filters and prefix sums so its
work scales linearly with recording length. The interface reports completed
files, elapsed time, and overall percentage while a batch is running. Analysis
runs in a background Web Worker so the interface remains responsive during
large imports.

Nightly dates are selectable after processing. Opening a night rereads only its
retained local source file(s) and renders a fixed-size, downsampled ventilation
overview with aligned high loop gain (HLG) proxy and eAI activity lanes plus
session boundaries. High loop gain describes a breathing-control system that
tends to overcorrect disturbances, producing repeated overshoot-and-undershoot
oscillations. Raw full-night waveforms are not retained in
memory. The nightly results table is grouped into collapsible months, with the
newest month open by default. After sessions are consolidated using the selected
night-gap rule, isolated groups shorter than three hours are labeled **Nap** in
the table, detail title, monthly counts, and CSV export. This is a presentation
label and does not change scoring. Dragging across the overview creates a visible time selection with exact
clock times and duration; this selection triggers an on-demand higher-resolution
calibrated raw-flow view. The detail renderer uses per-bin minimum, maximum, and
mean values so breath shape survives downsampling without retaining the full raw
waveform. The HLG proxy is the geometric mean of localized regularity and
periodicity, so both organized 30–90-second oscillation and spectral
concentration must be present for a strong value. It uses robustly clipped
approximately 10-minute windows evaluated about once per minute. Quality
screening dims questionable stretches instead of deleting them; this local
display does not alter the nightly scores. At full-night scale, the eAI
strip groups triggers into roughly two-minute bins and scales each bar to the
night's activity distribution. At ranges of 30 minutes or less it switches to
exact trigger ticks; stronger rate or inspiratory-volume surges render hotter.
The raw-flow detail is recursively zoomable: drag across it to open that
subrange, click once to halve the window around that time, or use **Zoom in**
and **Zoom out**. The minimum window is five seconds. **Previous** and **Next**
move by exactly the current window width, clamp at the night's boundaries, and
load the adjacent detail automatically.

Results use separate, dynamically scaled charts for Sleep Disruption,
regularity, periodicity, and estimated arousals. Each chart shows nightly values
plus a trailing seven-calendar-day average. Sleep Disruption is a
dynamic-analysis composite:

`(((periodicity + regularity) / 2) + EAI) / 2`

EAI deliberately preserves the original WAT algorithm. It detects breaths from
raw-flow zero crossings, then compares respiratory-rate and inspiratory-volume
surges with an approximately two-minute mean baseline. It counts events when
rate rises by more than 20% or volume by more than 30%, with 15 seconds of event
separation. This path is intentionally isolated from the newer filtering and
adaptive breath detector. Its broad range is intended for within-person trend
specificity, not clinical event scoring. Regularity measures repeatability of
ventilation oscillations over 30–90-second periods using normalized
autocorrelation.

Artifact rejection remains part of the metric-quality pipeline. It excludes
30-second windows with flatlines, clipping, excessive derivative noise, or
insufficient usable variation from the newer filtered metrics. It does not
alter the raw-flow detail view or the original eAI path.

The application is experimental and is not a medical device.
