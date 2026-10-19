// Pines in mist (Claude, Opus 5.5), imagined. A test of body (2a73c21) and the reworked wash:
// three rows of pines dropped into one wet sky, each row in a thicker paint than the last, so
// the consistency ladder does the aerial perspective: thin paint from a wet brush melts into soft
// far shapes, milkier paint holds with soft edges, thick paint from a dry brush holds its shape.
// Crowns as tiers of short drooping strokes (the journal: they read as conifers; dabs read as
// lollipops). Darks as near-black: perylene green, violet and umber near full strength.
const S = window.__sim, h = S.headless, V = S.values;
window.__paintLog = [];
const log = m => { window.__paintLog.push(m); console.log('[paint]', m); };
let seed = 23; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

// A pine: a spire of tiers, each tier a pair of short strokes drooping out from the trunk, wider
// toward the foot; the tip a single fine stroke. (x, foot y, height, half-width at the foot)
// (pass 1's even, symmetric tiers read as fishbones: now each branch's length, droop and angle
// varies, some are missing, and sides don't mirror)
async function pine(x, foot, ht, hw, fps = 2, ragged = 1) {
  const tiers = Math.max(5, Math.round(ht / 14));
  const r0 = V.brushRadius;
  h.lift(); await S.path([[x, foot - ht, 0.2], [x, foot - ht * 0.7, 0.6]], fps);   // the tip
  for (let k = 1; k <= tiers; k++) {
    const t = k / tiers, y = foot - ht * (1 - t) + (rnd() - 0.5) * 6 * ragged;
    for (const side of [-1, 1]) {
      if (rnd() < 0.18 * ragged && k > 1) continue;   // a gap where a branch is missing
      const w = hw * Math.pow(t, 0.85) * (1 - 0.6 * ragged * rnd() + 0.3 * ragged * rnd());
      const droop = (4 + 10 * t) * (0.5 + ragged * rnd()), lift = (rnd() - 0.6) * 6 * ragged;
      const xo = x + (rnd() - 0.5) * 3 * ragged;
      h.lift(); await S.path([[xo + side * 1.5, y - 2, 0.9], [xo + side * w * 0.5, y + droop * 0.3 + lift, 0.7], [xo + side * w * (0.8 + 0.2 * rnd()), y + droop, 0.1]], fps);
      if (rnd() < 0.35 * ragged) { h.lift(); await S.path([[xo + side * w * 0.4, y + droop * 0.2, 0.6], [xo + side * w * 0.65, y + droop * 0.9 + 4, 0.1]], fps); }   // a hanging twig
    }
  }
  V.brushRadius = Math.max(1.2, r0 * 0.35);
  h.lift(); await S.path([[x, foot - ht * 0.5, 0.6], [x, foot + 4, 0.8]], fps);   // the trunk, glimpsed
  V.brushRadius = r0;
}

window.__paintDone = (async () => {
  h.setPaper('coldPress', 41); h.setTone('natural'); S.clear();

  log('the sky: a warm glow low down, blue-grey above, laid wet over the whole sheet');
  S.tool('wash'); h.setBrushPreset('mop'); V.brushRadius = 50; V.brushPigment = 0.22; V.dipLoad = 0.8;
  // (pass 1's ultramarine with raw umber granulated into a loud speckle: a smoother blue-grey)
  h.setBrush([['Phthalo Blue (GS)', 0.5], ['Perylene Violet', 0.6], ['Transparent Yellow Oxide', 0.3]]);
  await S.wash(null, { kind: 'variegated', into: [['Transparent Yellow Oxide', 2], ['Quinacridone Rose', 0.6]], direction: 'down', paper: 'wet', dampen: true });

  // (pass 1 laid them at once into the shine, thin: they dissolved entirely. At satin, as milk)
  // Paint thicker than the paper is wet, throughout (passes 2-4 dropped a wetter brush into a drying
  // sky: blooms, which is what real paint does too). Soft but recognisable far shapes are creamy paint
  // into a shining wash: body keeps the shape, the wet sky softens its edges.
  // (pass 5 dropped it into the shining sky: in that much water even creamy paint kept moving and
  // dissolved. Wetter paint into satin bloomed (passes 3-4). Creamy paint as the shine goes off:)
  log('far pines, as the shine goes off (satin): creamy paint, to hold softly');
  const band = [60, 200, 340, 480, 620, 760, 900].map(x => [x, 440]);
  await S.skipTo('satin', { points: band });
  S.tool('paint'); h.setBrushPreset('round'); V.brushRadius = 5; V.brushPigment = 0.45; V.dipLoad = 0.3;
  h.setBrush([['French Ultramarine', 2], ['Perylene Violet', 1], ['Raw Umber', 0.5]]);
  // (passes 2-3: ~25 trees painted left to right took as long as the sky took to dry, so the left
  // ones bloomed and the right ones held crisp. Fewer, quicker strokes, in a scattered order, so any
  // drying during the row is spread across it)
  const far = []; for (let x = 50; x < 1000; x += 60 + rnd() * 40) far.push([x, 470 + rnd() * 12, 70 + rnd() * 60, 14 + rnd() * 6]);
  for (let k = far.length - 1; k > 0; k--) { const j = Math.floor(rnd() * (k + 1)); [far[k], far[j]] = [far[j], far[k]]; }
  for (const [x, foot, ht, hw] of far) await pine(x, foot, ht, hw, 1, 0.6);

  // (pass 1's at satin and Wetness 0.4 melted into columns: later and thicker, a spire with soft edges)
  log('middle pines, still wet: thicker paint, a firmer spire with soft edges');
  V.brushRadius = 6; V.brushPigment = 0.65; V.dipLoad = 0.2;
  h.setBrush([['Perylene Green', 1.5], ['French Ultramarine', 1], ['Perylene Violet', 0.6]]);
  for (const x of [610, 175, 880, 330, 720, 120, 660]) await pine(x + rnd() * 20, 540 + rnd() * 15, 140 + rnd() * 60, 22 + rnd() * 6, 1, 0.8);

  log('near pines, once it has gone moist: thick dark paint from a dry brush, to hold its shape');
  await S.skipTo('moist', { points: band });
  V.brushRadius = 8; V.brushPigment = 0.95; V.dipLoad = 0.1;
  h.setBrush([['Perylene Green', 2], ['Perylene Violet', 2], ['Raw Umber', 0.5]]);
  for (const [x, foot, ht, hw] of [[60, 700, 420, 46], [215, 690, 330, 38], [900, 705, 460, 50], [800, 690, 300, 34]]) await pine(x, foot, ht, hw);

  log('dry, then the ground: a soft dark strip across the foot');
  S.act('dry', true); try { await S.skipTo('dry'); } finally { S.act('dry', false); }
  S.tool('wash'); h.setBrushPreset('mop'); V.brushRadius = 40; V.brushPigment = 0.55; V.dipLoad = 0.5;
  h.setBrush([['Perylene Green', 1.5], ['Raw Umber', 1.5], ['Perylene Violet', 0.5]]);
  await S.wash([[-8, 690], [300, 676], [620, 688], [1032, 672], [1032, 776], [-8, 776]], { kind: 'flat', paper: 'moist', dampen: true });
  S.act('dry', true); try { await S.skipTo('dry'); } finally { S.act('dry', false); }
  await S.look('final');
  log('done');
})();
