// Second imagined study: an uneven wash behind a small pear.
const S=window.__sim,h=S.headless,V=S.values,M=window.__minds;
window.__paintLog=[];
const log=t=>{window.__paintLog.push(t);console.log('[paint]',t);};
const pts=(f,n=24)=>Array.from({length:n+1},(_,i)=>f(i/n));
const oval=(x,y,rx,ry)=>pts(t=>[x+rx*Math.cos(t*2*Math.PI),y+ry*Math.sin(t*2*Math.PI)],60);
const knots=[[469,257],[498,269],[520,337],[551,386],[571,453],[553,505],[514,529],[464,534],[419,515],[393,475],[396,430],[423,375],[441,326],[444,279]];
const pear=knots.flatMap((b,i)=>{const a=knots[(i+knots.length-1)%knots.length],c=knots[(i+1)%knots.length],d=knots[(i+2)%knots.length];return pts(t=>[0,1].map(k=>0.5*((2*b[k])+(-a[k]+c[k])*t+(2*a[k]-5*b[k]+4*c[k]-d[k])*t*t+(-a[k]+3*b[k]-3*c[k]+d[k])*t*t*t)),6).slice(0,-1);});
const load=(mix,p,r,w)=>{S.tool('paint');h.setBrushPreset('round');h.setBrush(mix);V.brushPigment=p;V.brushRadius=r;V.dipLoad=w;};
window.__paintDone=(async()=>{
  h.setPaper('coldPress',38);h.setTone('natural');S.clear();
  const dry=async()=>{S.act('dry',true);try{await S.skipTo('dry');}finally{S.act('dry',false);}};
  log('broad pale strokes into a larger uneven damp patch');
  const patch=pts(t=>{const a=t*2*Math.PI;return[456+(290+23*Math.sin(3*a))*Math.cos(a),322+(191+28*Math.cos(5*a))*Math.sin(a)];},90);
  await S.dampen(M.maskOf(patch),0.85,0.016,35);
  load([['Transparent Yellow Oxide',4],['Quinacridone Rose',1]],0.04,57,0.1);h.setBrushPreset('mop');V.brushRadius=57;V.dipLoad=0.1;
  for(const [x,y,len] of [[259,220,333],[230,278,388],[260,338,320],[292,391,244]]){
    V.brushPigment=y<300?0.045:0.025;
    await S.path(pts(t=>[x+len*t,y+13*Math.sin(t*4),0.12+0.8*Math.sin(Math.PI*t)],18),2);
  }
  await dry();await S.look('loose-background');
  log('a narrow blue-violet cast shadow');
  await S.dampen(M.maskOf(oval(576,540,172,43)),0.7,0.009,20);
  load([['French Ultramarine',2],['Quinacridone Rose',1],['Raw Umber',0.6]],0.09,17,0.09);
  await S.path(pts(t=>[452+245*t,540+6*Math.sin(t*3),0.1+0.65*Math.sin(Math.PI*t)],24),2);
  await dry();
  log('pale gold pear, green turning into its shadow');
  h.setBrushPreset('round');h.setBrush([['Bismuth Vanadate Yellow',3],['Transparent Yellow Oxide',1]]);V.brushRadius=22;V.brushPigment=0.18;V.dipLoad=0.6;
  await S.wash(pear,{kind:'variegated',into:[['Transparent Yellow Oxide',3],['Perylene Green',1]],direction:'across',paper:'moist'});
  await S.skipTo('satin',{points:[[507,431]]});
  load([['Transparent Yellow Oxide',2],['Perylene Green',1],['Raw Umber',1]],0.14,18,0.06);
  for(let k=0;k<3;k++)await S.path(pts(t=>[500+12*k+22*Math.sin(t*Math.PI),330+175*t,0.1+0.6*Math.sin(t*Math.PI)],20),2);
  await S.path(pts(t=>[429+113*t,510+8*Math.sin(t*Math.PI),0.1+0.5*Math.sin(t*Math.PI)],18),2);
  await dry();await S.look('pear-form');
  log('a bent stem and sparse russet flecks');
  load('Raw Umber',0.5,4,0.2);
  await S.path([[467,269,0.85],[462,249,0.65],[473,226,0.3]],4);
  load([['Raw Umber',2],['Transparent Red Oxide',1]],0.12,1.5,0.08);
  let seed=67;const rnd=()=>((seed=seed*16807%2147483647)/2147483647);
  for(let i=0;i<22;i++){const x=421+rnd()*113,y=414+rnd()*86;await S.path([[x,y,0.3],[x+1.5,y-1,0.1]],1);}
  await dry();await S.look('finished');
  await S.note('Sol pear: second imagined study. Background made with four tapered mop strokes into a wider irregular dampened patch, lower brush wetness, warmer and stronger upper left. Pale yellow pear with green shadow dropped in at satin, bent umber stem, sparse russet flecks. Dryer between completed layers; no physics changes.');
  log('done');
})();
