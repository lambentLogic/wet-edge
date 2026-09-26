# Performance notes

The sim should run in real time while a lot of the sheet is wet. It
doesn't yet. This page is the state of play and how to measure it, for
anyone (human or model) looking for speedups.

## Setup

- 1024 x 768 cells (1 cell = 0.2 mm), 600 steps per second at dt 0.4.
- Each frame runs, over the whole grid: blurH and blurV (a wet-edge mask),
  then markTiles and compactTiles, which list the active 16 x 16 tiles.
- Then each step runs two compute passes over the active tiles only
  (indirect dispatch): `velocity` (shallow water) and `transport` (water,
  up to 4 suspended pigments per cell, settling, absorption, wicking and
  the brush). All shaders are in `src/shaders.js`; dispatch is in
  `encodeSim` in `src/main.js`.
- Storage buffers (at the 10-per-stage limit):
  - A (w, gSum, dSum, s), 16 B, ping-pong
  - B (u, v, scratch, -), 16 B, ping-pong
  - G: 4 pigment ids + amounts, 32 B, ping-pong
  - D: deposits (ids, amounts, stain K/S, timestamps), 80 B, in place
  - aux (paper height, wet mask, fix time, wet start), 16 B
  - tiles, magnet field, pigments, magnets, params

## Where the time goes (M3 Pro, 18 GB)

With the whole sheet wet (`speed` probe): about 2.4 ms per step, i.e.
0.33x real time.

| Measurement | Time |
| --- | --- |
| velocity only | about 0.45 ms/step |
| transport only | about 2.0 ms/step (about 83% of the step) |
| transport with `mixing=0` | about 0.26 ms less (about 12%) |
| transport with flocculation, diffusion or Marangoni off | little change |
| writing back only the D fields that changed | about 2% |

Transport reads 5 cells of A and G (upwind candidates), B faces, D (80 B)
and aux, and writes A, G and D. That's roughly 500 B per cell per step,
about 165 GB/s at the current rate, so it looks memory-bound. This is an
estimate, not profiled.

## Constraints

- Results must not change. The behaviour was calibrated by eye by the
  painter, so a speedup that shifts it needs their say.
- For example, dt 0.8 at 300 steps/s is stable, but it shifts edge
  darkening, bleed, flocculation and dry-brush noticeably
  (`node tools/measure.mjs edge bleed floc drybrush --set dt=0.8 --set simSpeed=300`).
- Pigment conservation must hold (`conserve` probe = [1, 1]).

## Ideas not yet tried

- Settle and absorb every few steps (multi-rate), so D is touched less.
  This changes results slightly.
- Load neighbour A and G tiles into workgroup shared memory.
- Pack G smaller (ids as u8, amounts as f16), though conservation over
  thousands of steps worries me.
- Split transport into lighter passes, or cut register pressure: it's
  a big shader with small arrays, so occupancy may be the real limit.
- Skip tiles that are wet but static.

## Measuring

```
python3 tools/serve.py 8765 &          # no-cache dev server
npm install                            # puppeteer-core (uses installed Chrome)
node tools/measure.mjs speed speedPartial
node tools/measure.mjs                 # all probes: check nothing changed
```

To see whether results changed, compare all the probes before and after.
Some probes depend on which probes ran before them, so run the same set,
in the same order, both times.
