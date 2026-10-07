// A controlled test of the dry-brush texture: three rows of the same 22 blades (same seed, same geometry,
// same pigment and pressure), differing only in how fast each is painted (framesPerSeg 2, 5, 12).
// If the broken texture changes with speed, the physics is in the skim; if not, it's the paper.
const S=window.__sim,h=S.headless,V=S.values,M=window.__minds;
window.__paintLog=[];
const log=t=>{window.__paintLog.push(t);console.log('[paint]',t);};
const pts=(f,n=24)=>Array.from({length:n+1},(_,i)=>f(i/n));
const load=(mix,p,r,w,b='round')=>{S.tool('paint');h.setBrushPreset(b);h.setBrush(mix);V.brushPigment=p;V.brushRadius=r;V.dipLoad=w;};
const blade=(x,y,hgt,dx,bow,p,fps)=>S.path(pts(t=>[x+dx*t+bow*Math.sin(Math.PI*t),y-hgt*t,p*Math.min(1,4*t)*(1-0.6*t)],12),fps);

window.__paintDone=(async()=>{
  h.setPaper('coldPress',21);h.setTone('natural');S.clear();
  const dry=async(p)=>{S.act('dry',true);try{await S.skipTo('dry',{points:p});}finally{S.act('dry',false);}};
  load([['Transparent Yellow Oxide',2],['Raw Umber',1]],0.25,4,0.15,'round');
  for(const [row,fps] of [[220,2],[420,5],[620,12]]){
    log(`row at y=${row}: framesPerSeg ${fps}`);
    let seed=99;const rnd=()=>{seed=(seed*1664525+1013904223)%4294967296;return seed/4294967296;};
    for(let i=0;i<22;i++){
      const x=140+i*32+rnd()*6, hgt=90+rnd()*30, dx=(rnd()-0.5)*30, bow=(rnd()-0.5)*14;
      await blade(x,row,hgt,dx,bow,0.5,fps);
    }
    await dry([[500,row-40]]);
  }
  await S.look('speed-test');
  log('done');
})();
