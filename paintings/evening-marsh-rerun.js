// Same marsh after the edge packing and ultramarine calibration changes.
// Keep composition, loads, pigments and paper seed; dry after shine is gone.
const S = window.__sim, h = S.headless, V = S.values, M = window.__minds;
window.__paintLog = [];
const log = text => { window.__paintLog.push(text); console.log('[paint]', text); };
let seed = 93;
const rnd = () => (seed = seed * 16807 % 2147483647) / 2147483647;
const rect = (top, bottom) => [[-10, top], [1034, top], [1034, bottom], [-10, bottom]];
// Only compress idle time: strokes still use sim.path as before. The probe
// runner advances the same fixed dt steps without depending on display fps.
const settle = async points => {
  const started = performance.now();
  let simulated = 0;
  h.begin();
  try {
    for (;;) {
      let wet = 0, film = 0;
      for (const [x,y] of points) {
        const s = await S.sense(x,y,10);
        film = Math.max(film,s.water); wet = Math.max(wet,s.water,s.damp*0.3);
      }
      if (wet < 0.003) { await h.wait(2); return (performance.now()-started)/1000; }
      if (simulated >= 600) throw new Error('Drying timed out before glazing.');
      await h.wait(5,{dry:film<0.003}); simulated += 5;
    }
  } finally { h.end(); }
};
const dry = async area => {
  // Pick points inside the shape; a polygon's vertex average can be outside
  // it (especially a thin hill silhouette). Avoid the expensive full grid.
  const top=Math.max(10,Math.min(...area.map(p=>p[1])));
  const bottom=Math.min(758,Math.max(...area.map(p=>p[1])));
  const points=[0.3,0.75].map(t=>{
    const y=top+(bottom-top)*t;
    const spans=M.spans(area,y).sort((a,b)=>(b[1]-b[0])-(a[1]-a[0]));
    if(!spans.length) throw new Error('No interior drying sample.');
    return [Math.max(10,Math.min(1014,(spans[0][0]+spans[0][1])/2)),y];
  });
  log('waiting for dry paint at interior samples');
  const elapsed = await settle(points);
  log(`drying: ${elapsed.toFixed(1)} seconds`);
};
const mix = (names, strength, radius = 45) => {
  h.setBrushPreset('mop'); h.setBrush(names);
  V.brushPigment = strength; V.brushRadius = radius; V.dipLoad = 1;
};
window.__paintDone = (async () => {
  h.setPaper('coldPress', 93); h.setTone('natural'); S.clear();
  log('sky: cool blue into a muted peach glow');
  mix([['French Ultramarine', 3], ['Quinacridone Rose', 1]], 0.16, 60);
  await S.wash(rect(-10, 435), {kind: 'variegated',
    into: [['Transparent Yellow Oxide', 2], ['Quinacridone Rose', 1]], direction: 'down', dampen: true});
  S.tool('paint'); V.brushRadius = 18; V.brushPigment = 0.14;
  h.setBrush([['French Ultramarine', 2], ['Transparent Red Oxide', 1]]);
  for (const [x,y,len] of [[70,115,310],[460,170,410],[120,240,270]])
    await S.path(Array.from({length: 9}, (_,i) => [x+len*i/8,y+6*Math.sin(i/8*4),0.15+0.65*Math.sin(i/8*Math.PI)]),2);
  await dry(rect(0,435)); await S.look('dry-sky');

  log('distant violet hills: a transparent glaze');
  const hills = [[-10,410],[80,378],[170,387],[285,330],[365,346],[490,400],
    [580,375],[700,355],[820,395],[920,371],[1034,400],[1034,438],[-10,438]];
  mix([['French Ultramarine', 3], ['Quinacridone Rose', 1], ['Raw Umber', 1]],0.16,32);
  await S.wash(hills,{kind:'graded',fadeTo:0.45});
  await dry(hills);

  log('water: pale at the horizon, cooler toward the viewer');
  mix([['French Ultramarine', 3], ['Transparent Red Oxide', 1]],0.09,60);
  await S.wash(rect(439,778),{kind:'graded',fadeTo:2.5,dampen:true});
  S.tool('paint'); h.setBrushPreset('round'); V.brushRadius=16; V.brushPigment=0.16;
  h.setBrush([['French Ultramarine', 3], ['Quinacridone Rose', 1], ['Raw Umber', 1]]);
  for (let x=80;x<950;x+=65) {
    const len=25+40*rnd();
    await S.path([[x,446,0.7],[x+8*rnd(),446+len,0.1]],2);
  }
  await dry(rect(440,768)); await S.look('hills-and-water');

  log('low island, warm earth and green blended in patches');
  const island = [[-10,467],[85,452],[180,444],[270,450],[360,468],[475,481],
    [395,494],[275,492],[145,483],[-10,491]];
  mix([['Perylene Green', 1], ['Raw Umber', 2]],0.32,23);
  await S.wash(island,{kind:'variegated',into:[['Transparent Red Oxide',1],['Raw Umber',2]],direction:'patches'});
  await dry(island);
  log('broken horizontal ripples with a blotted brush');
  h.setBrushPreset('round'); h.setBrush([['French Ultramarine',2],['Raw Umber',1]]);
  S.tool('paint'); V.dipLoad=0.3; V.brushRadius=3; V.brushPigment=0.22;
  for(let i=0;i<18;i++) {
    const y=490+180*rnd(),x=120+760*rnd(),len=25+90*rnd();
    await S.path([[x,y,0.25],[x+len*.5,y+1,0.6],[x+len,y,0.08]],2);
  }

  log('foreground reed beds and tapered stems');
  mix([['Raw Umber',2],['Transparent Red Oxide',1],['Perylene Green',1]],0.35,30);
  const bank=[[-10,645],[65,636],[145,660],[210,684],[270,727],[340,778],[-10,778]];
  await S.wash(bank,{kind:'variegated',into:[['Raw Umber',2],['Transparent Yellow Oxide',1]],direction:'patches'});
  await dry(bank);
  h.setBrushPreset('rigger'); S.tool('paint'); V.dipLoad=0.7; V.brushRadius=2.8;
  h.setBrush([['Raw Umber',2],['Perylene Green',1]]); V.brushPigment=0.65;
  for(let i=0;i<26;i++) {
    const x=15+220*rnd(), y=700+60*rnd(),len=90+160*rnd(),lean=15+45*rnd();
    await S.path(Array.from({length:9},(_,k)=>{const t=k/8;return[x+lean*t*t,y-len*t,0.85-0.8*t];}),2);
    if(i%3===0) {
      V.brushRadius=5;
      await S.path([[x+lean*.8,y-len*.89,0.35],[x+lean,y-len+8,0.8],[x+lean+1,y-len-11,0.15]],2);
      V.brushRadius=2.8;
    }
    await S.path([[x+lean*.1,y-len*.3,0.7],[x+35,y-len*.55,0.5],[x+62,y-len*.6,0.05]],2);
  }
  await settle([[120,640],[140,720],[800,650]]); await S.look('finished');
  log('done');
})();
