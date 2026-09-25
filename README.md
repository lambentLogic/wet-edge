# Hyperreal Watercolor

A physically honest watercolor simulation (after Curtis et al. 1997) where every law of the medium is a knob — including the illegal values.

See [docs/SPEC.md](docs/SPEC.md).

## Running

Needs a WebGPU browser (Chrome/Edge/Safari 26+). Serve the folder and open it:

```
python3 -m http.server 8765
# http://127.0.0.1:8765/
```

Keys: `1` paint · `2` water · `3` lift · hold `D` to blow-dry · space pause · `C` clear.

## Layout

- `src/shaders.js` — WGSL: shallow-water velocity, upwind transport, pigment settling, capillary paper, Kubelka-Munk render
- `src/params.js` — the knob table; the WGSL `Params` struct is generated from it
- `src/paper.js` — procedural paper height field (noise + fibers)
- `src/pigments.js` — K/S values after Curtis et al.
- `window.__sim` — debug hooks (`stats()`, `read()`, `stroke()`, `clear()`, `values`)
