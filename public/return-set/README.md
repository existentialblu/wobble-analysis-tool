# Return Set

**ResMed PAP recordings only.** Other manufacturers and summary-only OSCAR exports are unsupported.

[Open Return Set](https://wobble-analysis-tool.xyz/return-set/) · [All WAT tools](https://wobble-analysis-tool.xyz/)

A browser-local fractal gallery: one portrait per night of breathing, plus a pooled portrait of all loaded nights. Open a ResMed night folder, explore by dragging/zooming, and save the current view as a PNG. Choose Dusk, Tide, Ember or Ice using the colour swatches; PNG export uses the selected palette. Hide controls with the eye button; Escape restores them.

## Run and test

Buildless static HTML/ES modules in `public/return-set/`; no dependencies or external scripts. A browser worker decodes EDF and fits the models. WebGL, with a progressive CPU fallback, renders the fractals. The root Vite build copies this directory unchanged into `dist/return-set/`.

From the repository root: `npm run test:return-set`.

Source files are served directly from `public/return-set/`. Tests live in `tools/return-set/tests/`. Run `npm run dev` and open `/return-set/` to develop locally.

## Inputs

Open a complete DATALOG folder for a large collection, add individual night folders over successive imports, or select BRP / PLD EDF files or ZIPs. Relevant files are selected automatically. Each recording date becomes a gallery item; re-importing that date replaces it. Recording dates use noon-to-noon grouping, preserving EDF wall-clock fields.

Continuous EDF, EDF+C, EDF+D with timekeeping annotations, EDF.GZ, stored ZIP and deflated ZIP are supported. Signal calibration and individual sampling rates are honoured. Patient identification header fields are not used. BDF, ZIP64, encrypted ZIPs and proprietary PAP databases are unsupported. Summary-only OSCAR exports do not provide the waveforms required here.

## Large collections and navigation

The browser keeps one night's decoded waveforms at a time, then retains only small regression sufficient-statistic matrices and portrait metadata. The pooled fit combines these matrices with equal weight per night. Its cost grows linearly with the number of nights, without re-reading the waveforms. Raw sample rows are released after each night. Normalisation, quality exclusions, selected windows and model definition match the initial version; regression checks agree within floating-point precision.

Only seven thumbnails are generated for the current page, one per animation frame. Use previous/next pages, the month filter, or the date field (jumps to the nearest loaded night). Left/right arrows on the fractal move between nights and bring the selected night's page into view. **All nights** stays pinned beneath the gallery. Colour changes redraw the current page only.

**Stop import** keeps completed nights. Progress reports the recording count and a rough time estimate after the first three nights. Regular EDF folders are preferred for large batches. Up to 20,000 EDF files can be queued per import; archive expansion is limited to 500 MB and ZIP64 is unsupported. Compressed imports need extra expansion memory, so avoid one giant archive for hundreds of nights.

Development benchmark: 600 synthetic eight-hour nights with paired 25 Hz BRP + PLD data (1.76 GB of virtual input) processed in 20.9 s on the development machine; PLD-only EDF imports took about 6.6 s. These timings exclude physical disk latency and browser rendering. About 1.3 MB of JSON represents the 600 nights’ retained regression statistics; runtime object and temporary decoding memory are larger.

Run `node tools/return-set/benchmark.mjs 600` for a reproducible synthetic eight-hour, 25 Hz BRP + PLD stress test. It reuses synthetic file buffers and excludes physical disk latency; timing is hardware dependent. Tests separately import 600 eight-hour PLD EDF recordings and exercise a 600-item gallery with a mocked DOM. These are synthetic checks, not a timing guarantee for real recordings or browsers.

## Portrait method

High-resolution flow is integrated across complete inspiratory phases and divided by the subsequent breath cycle, with positive-flow integration as a local fallback. Device minute ventilation is used when flow is unavailable. Ventilation is smoothed over eight seconds. Missing intervals are retained. Complete, unflagged, non-overlapping eight-minute windows are selected across each night; leak/extreme-flow flags exclude affected sections.

For each night, ventilation is standardised with the first two thirds of its selected samples. Sampling at a fixed five-second step, fit the ridge-regularised delayed cubic map:

`x[n+1] = b + A*x[n] + B*x[n-1] + C*x[n]^3 + D*x[n-1]^3`

Rows never cross window boundaries. The first two thirds of rows train validation fits; the last third provides one-step prediction checks against linear and persistence baselines. All rows are refitted for the portrait. The pooled portrait fits all nights' locally normalised rows together, weighting each night equally regardless of sample count. It does not average coefficients or blend images.

The real fitted map is extended to complex numbers. Each pixel varies the initial state `z[0]`, with `z[-1]=0`, while retaining the fitted bias and coefficients. The renderer iterates 320 times and colours boundedness and escape behaviour. Thumbnails use 160 iterations. This extension is a chosen mathematical construction, not a measurement of physiological fractality.

These experimental portraits are not validated phenotypes or respiratory-controller estimates. Geometry depends on model choice and extrapolation beyond observed data. Each recording includes the effects of its PAP device. Cross-night changes may reflect therapy, signal source or other state changes.

## Verification and privacy

Tests cover EDF formats, calibration, discontinuity, archive integrity, breath integration, synthetic signals, pooling weights, nonoverlapping selection, previews, and the actual app/worker interaction with a mocked DOM. The real GLES shader is also compiled and rendered off-screen during development. Full browser layout QA and real-device-file validation remain outstanding.

No signal upload endpoint, analytics, external fonts or external scripts. Data lives in browser/worker memory and is cleared on reload. Only the chosen PNG is downloaded.

## Share a portrait

Save PNG exports only the current fractal canvas: no interface, recording date, filenames or EDF patient header. You can share that image without sharing the source EDF recordings. The geometry is experimental and has no established diagnostic meaning.
