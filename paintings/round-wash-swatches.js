// Swatches: how to lay a single round orange form without a hard rim, and how the
// colour turns out. A flat moist wash, B variegated moist, C strokes into a dampened
// disc, D strokes on dry paper.
const S=window.__sim,h=S.headless,V=S.values,M=window.__minds;
const pts=(f,n=60)=>Array.from({length:n+1},(_,i)=>f(i/n));
const disc=(x,y,r)=>pts(t=>[x+r*Math.cos(t*2*Math.PI),y+r*Math.sin(t*2*Math.PI)],60);
const ORANGE=[['Transparent Yellow Oxide',3],['Pyrrole Scarlet',2],['Bismuth Vanadate Yellow',1]];
const DEEP=[['Transparent Red Oxide',2],['Pyrrole Scarlet',1.5]];
const load=(mix,p,r,w,b='round')=>{S.tool('paint');h.setBrushPreset(b);h.setBrush(mix);V.brushPigment=p;V.brushRadius=r;V.dipLoad=w;};
window.__paintDone=(async()=>{
  h.setPaper('coldPress',17);h.setTone('natural');S.clear();
  const dry=async()=>{S.act('dry',true);try{await S.skipTo('dry');}finally{S.act('dry',false);}};
  const X=[190,420,650,880],Y=380,R=92;
  // A: flat moist wash
  h.setBrushPreset('mop');h.setBrush(ORANGE);V.brushRadius=70;V.brushPigment=0.3;V.dipLoad=0.35;
  await S.wash(disc(X[0],Y,R),{kind:'flat',paper:'moist'});
  // B: variegated moist into the deep orange, across
  h.setBrush(ORANGE);V.dipLoad=0.35;
  await S.wash(disc(X[1],Y,R),{kind:'variegated',into:DEEP,direction:'across',paper:'moist'});
  // C: strokes into a dampened disc, deep dropped in on the right while satin
  await S.dampen(M.maskOf(disc(X[2],Y,R)),0.8,0.018);
  load(ORANGE,0.3,40,0.3,'mop');
  for(let k=-3;k<=3;k++){
    const yy=Y+k*26, dx=Math.sqrt(Math.max(0,R*R-(yy-Y)*(yy-Y)));
    await S.path(pts(t=>[X[2]-dx+10+2*(dx-10)*t,yy+8*Math.sin(Math.PI*t),0.2+0.6*Math.sin(Math.PI*t)],14),3);
  }
  load(DEEP,0.28,26,0.18,'mop');
  for(let k=0;k<3;k++)await S.path(pts(t=>[X[2]+30+8*k, Y-50+130*t,0.15+0.5*Math.sin(Math.PI*t)],10),2);
  // D: strokes on dry paper
  load(ORANGE,0.3,40,0.3,'mop');
  for(let k=-3;k<=3;k++){
    const yy=Y+k*26, dx=Math.sqrt(Math.max(0,R*R-(yy-Y)*(yy-Y)));
    await S.path(pts(t=>[X[3]-dx+10+2*(dx-10)*t,yy+8*Math.sin(Math.PI*t),0.2+0.6*Math.sin(Math.PI*t)],14),3);
  }
  load(DEEP,0.28,26,0.18,'mop');
  for(let k=0;k<3;k++)await S.path(pts(t=>[X[3]+30+8*k, Y-50+130*t,0.15+0.5*Math.sin(Math.PI*t)],10),2);
  await dry();
  await S.look('swatches');
})();
