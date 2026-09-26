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
  - G: 4 pigment ids (packed bytes) + amounts, 20 B, ping-pong
  - D: deposits (ids, amounts, stain K/S, timestamps), 80 B, in place
  - aux (paper height, wet mask, fix time, wet start), 16 B
  - tiles, magnet field, pigments, magnets, params

## Where the time goes (M3 Pro, 18 GB)

With the whole sheet wet (`speed` probe), on an idle GPU: 0.68x real
time (about 2.4 ms per step). Part of the sheet wet (`speedPartial`):
3.55x. (Earlier figures of 0.33x were taken while a painting tab and a
local LLM shared the GPU.)

| Measurement | Time |
| --- | --- |
| velocity only | about 0.45 ms/step |
| transport only | about 2.0 ms/step (about 83% of the step) |
| transport with `mixing=0` | about 0.26 ms less (about 12%) |
| transport with flocculation, diffusion or Marangoni off | little change |
| writing back only the D fields that changed | about 2% |

Transport reads 5 cells of A and G (upwind candidates), B faces, D (80 B)
and aux, and writes A, G and D. A naive traffic estimate is roughly 500 B
per cell per step, but neighbouring reads can hit caches. The diagnostic
variants below show that transport logic dominates; the traffic estimate
does not measure physical memory bandwidth.

## Constraints

- Results must not change. The behaviour was calibrated by eye by the
  painter, so a speedup that shifts it needs their say.
- For example, dt 0.8 at 300 steps/s is stable, but it shifts edge
  darkening, bleed, flocculation and dry-brush noticeably
  (`node tools/measure.mjs edge bleed floc drybrush --set dt=0.8 --set simSpeed=300`).
- Pigment conservation must hold (`conserve` probe = [1, 1]).

## Tried

- 8 x 8 workgroups for velocity and transport (four per tile; suggested
  by Sol, 2026-09-26). The result was bit-identical but not faster: over
  three runs each, the whole sheet ran at 0.37-0.41x real time versus
  0.38-0.39x, and part of the sheet at 1.24-1.37x versus 1.41-1.68x. Reverted.
  Rerun on an idle GPU (2026-09-26), three runs each: 16 x 16 at 0.68x
  whole sheet and 3.53-3.55x partial; 8 x 8 at 0.67x and 3.56-3.57x.
  Identical state hashes. No difference either way.

- G's four pigment ids packed as bytes into one u32, amounts kept f32
  (32 B down to 20 B a cell; Sol's second suggestion, 2026-09-26). Bit
  identical (A, D and aux hashes unchanged). Alternating runs: 0.67-0.68x
  vs 0.63-0.67x whole sheet, partial within noise. Kept (a few percent,
  smaller saves). G traffic clearly isn't the main cost.

- Diagnostic transport variants (Sol's suggestion, 2026-09-26):
  simplified kernels that retain representative reads and writes while
  removing parts of the logic. Whole sheet wet, idle
  GPU (`PRE_JS="window.__transportVariant=N" node tools/measure.mjs speed`):

  | variant | speed |
  | --- | --- |
  | full transport | 0.68-0.70x |
  | 1: reads and writes only, no logic | 11x |
  | 2: no mixing/drift | 0.98x |
  | 3: no settling | 0.81x |
  | `--set mixing=0` + 3 | 1.21x |
  | 4 (+ no neighbour candidates) + `mixing=0` | 1.20x |
  | `--set flocculation=0` | 0.81x |

  The reads-and-writes variant runs much faster, so logic dominates the
  measured workload. It changes the data written and does not isolate an
  exact percentage for memory traffic. Mixing and flocculation drift are
  about 30% of it; settling about 15%; gathering neighbours' candidates
  almost nothing. Most of the cost
  (1.2x vs 11x) is in what every cell runs regardless: the candidate
  list and its sort, the deposit-slot loops, binding, absorption. They
  index small private arrays (cid/camt/taken, the Dep fields) with loop
  counters, which on GPUs can push them out of registers into local
  memory. A full fixed-index rewrite remains an experiment.
- Fixed-index `candIndex` and `addCand` switches (Sol, 2026-09-26):
  `speed` fell from 0.67x to 0.59x, and A/D state hashes changed; reverted.
  This partial rewrite gave no evidence of a register-spill win.
- Replacing the eight `taken` flags with a `u32` bit mask and skipping
  mixing when all five nearby cells had no suspended pigment both kept
  state hashes identical, but `speed` stayed at 0.67x; reverted.
- Caching the flocculation noise per cell (bit-identical): no measurable
  change. Kept, harmless.
- Looking up each pigment's amount in the neighbouring cell once per face
  in mixPigments (Sol's suggestion; amtOf results in a vec4 table,
  accumulation order kept): bit-identical, but 0.61-0.64x against
  0.64-0.66x in alternating runs. Reverted.

So far every bit-identical restructuring of transport (workgroup size, G
packing, candidate bit mask, early return, noise caching, amtOf table) has
been within a few percent, and the fixed-index attempt was slower. The
shader compiler seems to handle the obvious cases already. What remains
would change results, which is the painter's call: settling and
absorption every few steps (multi-rate), a larger timestep with
recalibration, or cheaper mixing or flocculation.

## Ideas not yet tried

- Settle and absorb every few steps (multi-rate), so D is touched less.
  This changes results slightly.
- Load neighbour A and G tiles into workgroup shared memory.
- f16 amounts: conservation over thousands of steps worries me.
- Split transport into lighter passes, or cut register pressure: it's
  a big shader with small arrays, so occupancy may be the real limit.
- Skip tiles that are wet but static.

## Measuring

`node tools/measure.mjs stateHash` paints a fixed scene and returns the
SHA-256 of every state buffer. A change that shouldn't alter results must
leave these identical. Speed varies from run to run, so compare several
runs, on an idle machine: anything else using the GPU (a painting tab,
say) skews timings, though never the hashes or probe results.

```
python3 tools/serve.py 8765 &          # no-cache dev server
npm install                            # puppeteer-core (uses installed Chrome)
node tools/measure.mjs speed speedPartial
node tools/measure.mjs                 # all probes: check nothing changed
```

To see whether results changed, compare all the probes before and after.
Some probes depend on which probes ran before them, so run the same set,
in the same order, both times.
