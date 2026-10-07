// Paper relief check (Claude): the same swatch before and after dropping the
// paper's broad ~24 mm swell. Left, a granulating ultramarine flat wash; right,
// a graded quinacridone rose wash; below, two rows of dry-brush blades, the
// same at both heights, so any difference between rows is the paper.
const S=window.__sim,h=S.headless,V=S.values;
window.__paintLog=[];const log=t=>{window.__paintLog.push(t);console.log('[paint]',t);};
const pts=(f,n=24)=>Array.from({length:n+1},(_,i)=>f(i/n));
const rect=(x0,y0,x1,y1)=>[[x0,y0],[x1,y0],[x1,y1],[x0,y1]];
window.__paintDone=(async()=>{
  h.setPaper('coldPress',21);h.setTone('natural');S.clear();
  const dry=async()=>{S.act('dry',true);try{await S.skipTo('dry');}finally{S.act('dry',false);}};
  h.setBrushPreset('mop');V.brushRadius=40;V.dipLoad=1;S.tool('wash');
  log('granulating flat wash');
  V.brushPigment=0.35;h.setBrush([['French Ultramarine',1]]);
  await S.wash(rect(40,40,490,370),{kind:'flat',paper:'moist'});
  log('graded wash');
  V.brushPigment=0.5;h.setBrush([['Quinacridone Rose',1]]);
  await S.wash(rect(534,40,984,370),{kind:'graded',direction:'down',paper:'moist'});
  await dry();
  log('dry-brush rows');
  S.tool('paint');h.setBrushPreset('round');h.setBrush([['Raw Umber',1]]);V.brushPigment=0.25;V.brushRadius=4;V.dipLoad=0.15;
  for(const y of [560,730]){
    let seed=99;const rnd=()=>{seed=(seed*1664525+1013904223)%4294967296;return seed/4294967296;};
    for(let i=0;i<28;i++){const x=60+i*33+rnd()*6,hgt=110+rnd()*30,dx=(rnd()-0.5)*30,bow=(rnd()-0.5)*14;
      await S.path(pts(t=>[x+dx*t+bow*Math.sin(Math.PI*t),y-hgt*t,0.5*Math.min(1,4*t)*(1-0.6*t)],12),3);}
  }
  await dry();
  const a=await S.readPigment('Raw Umber');let r=[];
  for(const y of [560,730]){let v=0;for(let yy=y-150;yy<y+5;yy++)for(let x=40;x<1000;x++)v+=a[yy*1024+x];r.push(v.toFixed(1));}
  log(`dry-brush ink, upper row ${r[0]}, lower row ${r[1]}`);
})();
