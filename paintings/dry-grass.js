// A dry-grass study: a row of blades in a dry brush (Wetness 0.15) on cold press, varied in speed and pressure
// from blade to blade so the texture can be checked against the stroke that made it. Blades use a seeded
// random sequence, so the run repeats exactly.
const S=window.__sim,h=S.headless,V=S.values,M=window.__minds;
window.__paintLog=[];
const log=t=>{window.__paintLog.push(t);console.log('[paint]',t);};
const pts=(f,n=24)=>Array.from({length:n+1},(_,i)=>f(i/n));
const load=(mix,p,r,w,b='round')=>{S.tool('paint');h.setBrushPreset(b);h.setBrush(mix);V.brushPigment=p;V.brushRadius=r;V.dipLoad=w;};
let seed=21;const rnd=()=>{seed=(seed*1664525+1013904223)%4294967296;return seed/4294967296;};

// one blade: from base (x,y) up to height h, leaning dx, bowed by bow; pressure p; framesPerSeg sets its speed
const blade=(x,y,hgt,dx,bow,p,fps)=>S.path(pts(t=>[
  x+dx*t+bow*Math.sin(Math.PI*t), y-hgt*t,
  p*Math.min(1,4*t)*(1-0.6*t)
],12),fps);

window.__paintDone=(async()=>{
  h.setPaper('coldPress',21);h.setTone('natural');S.clear();
  const dry=async(p)=>{S.act('dry',true);try{await S.skipTo('dry',{points:p});}finally{S.act('dry',false);}};

  log('a first layer of blades in yellow oxide and umber, dry brush, at mixed speeds and pressures');
  load([['Transparent Yellow Oxide',2],['Raw Umber',1]],0.25,4,0.15,'round');
  for(let i=0;i<60;i++){
    const x=190+rnd()*640, y=640+rnd()*10;
    const hgt=70+rnd()*110, dx=(rnd()-0.5)*44, bow=(rnd()-0.5)*22;
    const p=0.3+rnd()*0.55;
    const fps=[2,3,5,8][Math.floor(rnd()*4)];
    await blade(x,y,hgt,dx,bow,p,fps);
  }
  await dry([[500,560]]);
  await S.look('first-layer');

  log('a second layer of darker blades in umber over the dried ones, a little thicker');
  load([['Raw Umber',2],['Perylene Green',1]],0.4,4,0.2,'round');
  for(let i=0;i<22;i++){
    const x=230+rnd()*580, y=645+rnd()*8;
    const hgt=60+rnd()*90, dx=(rnd()-0.5)*36, bow=(rnd()-0.5)*16;
    const p=0.5+rnd()*0.35;
    const fps=[3,5][Math.floor(rnd()*2)];
    await blade(x,y,hgt,dx,bow,p,fps);
  }
  await dry([[500,560]]);
  await S.look('finished');
  log('done');
})();
