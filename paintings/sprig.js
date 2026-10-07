// A sprig of three leaves on a curved stem, white paper with a soft warm patch behind.
// Follows the leaf study's notes: lighter veins, a darker shadow side painted thirsty at satin
// so the leaf turns, the cast shadow tucked under the leaves' bases, and the stem last.
const S=window.__sim,h=S.headless,V=S.values,M=window.__minds;
window.__paintLog=[];
const log=t=>{window.__paintLog.push(t);console.log('[paint]',t);};
const pts=(f,n=24)=>Array.from({length:n+1},(_,i)=>f(i/n));
const load=(mix,p,r,w,b='round')=>{S.tool('paint');h.setBrushPreset(b);h.setBrush(mix);V.brushPigment=p;V.brushRadius=r;V.dipLoad=w;};

// a leaf from its base point, pointing at angle ang (radians, y down), length L, half-width W
const leaf=(base,ang,L,W)=>{
  const C=[base[0]+L/2*Math.cos(ang),base[1]+L/2*Math.sin(ang)];
  const at=(t,off,side=0)=>{
    const x=(t-0.5)*L, y=side*W*off*Math.sin(Math.PI*Math.pow(t,0.85))*(1-0.2*t);
    return [C[0]+x*Math.cos(ang)-y*Math.sin(ang), C[1]+x*Math.sin(ang)+y*Math.cos(ang)];
  };
  const outline=[...pts(t=>at(t,1,-1),40),...pts(t=>at(1-t,1,1),40).slice(1)];
  const midrib=pts(t=>{const [x,y]=at(t,0);return [x,y+4*Math.sin(Math.PI*t),0.5];},40);
  return {at,outline,midrib};
};
// the stem: a quadratic curve from the cutting up to the tip
const stemAt=t=>{const B=[430,640],Q=[480,470],T=[560,250];
  return [0,1].map(k=>(1-t)*(1-t)*B[k]+2*(1-t)*t*Q[k]+t*t*T[k]);};
const stem=pts(t=>{const [x,y]=stemAt(t);return [x,y,0.2+0.45*Math.sin(Math.PI*t)];},40);

const leaves=[
  {base:stemAt(0.42),ang:-0.35,L:220,W:62,into:[['Perylene Green',1],['Raw Umber',0.4]]},
  {base:stemAt(0.68),ang:-2.5,L:200,W:56,into:[['Perylene Green',1],['French Ultramarine',0.4]]},
  {base:stemAt(0.95),ang:-1.25,L:165,W:46,shade:0.24,into:[['Perylene Green',1],['Raw Umber',0.3]]},
].map(d=>({...d,...leaf(d.base,d.ang,d.L,d.W)}));

window.__paintDone=(async()=>{
  h.setPaper('coldPress',11);h.setTone('natural');S.clear();
  const dry=async(p)=>{S.act('dry',true);try{await S.skipTo('dry',{points:p});}finally{S.act('dry',false);}};

  log('a soft warm patch behind the sprig, denser strokes so they overlap');
  await S.dampen(M.maskOf(pts(t=>{const a=t*2*Math.PI;return[500+(260+16*Math.sin(3*a))*Math.cos(a),420+(260+14*Math.cos(2*a))*Math.sin(a)];},90)),0.8,0.012,30);
  load([['Transparent Yellow Oxide',3],['Quinacridone Rose',1]],0.03,40,0.12,'mop');
  for(let dy=-200;dy<=200;dy+=22){
    await S.path(pts(t=>[260+480*t,420+dy+8*Math.sin(t*3),0.15+0.75*Math.sin(Math.PI*t)],16),2);
  }
  await dry([[260,220]]);

  log('mask the three midribs');
  S.tool('mask');V.brushRadius=2;
  for(const L of leaves) await S.path(L.midrib,2);
  await dry([[260,220]]);

  log('the leaves, one at a time: a variegated sage laid wet around the mask');
  load([['Transparent Yellow Oxide',3],['Phthalo Green',1]],0.2,28,0.35,'mop');
  for(const L of leaves){
    await S.wash(L.outline,{kind:'variegated',into:L.into,direction:'across',paper:'moist'});
    await M.waitDry([L.at(0.5,-0.5,-1)]);
  }
  await S.look('leaves-wash');

  log('peel the masks; the shadow side of each leaf in a thirsty mop stroke at satin');
  S.act('unmask');
  await dry([stemAt(0.5)]);
  for(const L of leaves){
    await S.skipTo('satin',{points:[L.at(0.5,0.3,1)]});
    load([['Perylene Green',2],['French Ultramarine',1]],L.shade||0.16,12,0.25,'mop');
    await S.path(pts(t=>{const [x,y]=L.at(0.12+0.76*t,0.55,1);return [x,y,0.1+0.6*Math.sin(Math.PI*t)];},18),2);
  }
  await dry(leaves.map(L=>L.at(0.5,0)));

  log('a cast shadow under the sprig, touching the bases, cool and thin');
  await S.dampen(M.maskOf(pts(t=>{const a=t*2*Math.PI;return[560+130*Math.cos(a),520+26*Math.sin(a)];},60)),0.6,0.008,20);
  load([['French Ultramarine',2],['Quinacridone Rose',1]],0.06,12,0.1);
  await S.path(pts(t=>[470+170*t,512+10*t+4*Math.sin(t*3),0.1+0.6*Math.sin(Math.PI*t)],20),2);
  await dry([[560,520]]);

  log('the stem, tapering at both ends, in the cut end of the sprig');
  load([['Raw Umber',2],['Perylene Green',1]],0.3,4,0.3,'rigger');
  await S.path(stem,3);
  await dry([stemAt(0.5)]);

  log('veins: light and fine, a rigger stroke off each side of each midrib');
  load([['Raw Umber',1],['Perylene Green',1]],0.18,2.5,0.3,'rigger');
  for(const L of leaves){
    for(let k=0;k<4;k++){
      const t0=0.2+0.15*k;
      for(const side of [-1,1]){
        await S.path(pts(s=>{const [x,y]=L.at(t0+0.2*s,0.6*s,side);return [x,y,0.06+0.45*Math.sin(Math.PI*s)];},12),3);
      }
    }
  }
  await dry([stemAt(0.5)]);
  await S.look('finished');
  await S.note('Sprig (paintings/sprig.js), Claude (Haiku): three leaves on a curved stem over a warm patch. Changes from the leaf study: thirsty mop strokes into each leaf'+"'"+'s shadow side at satin, veins lighter and finer, the cast shadow moved under the lower leaf, the stem drawn last. No physics changes.');
  log('done');
})();
