// A single leaf on white paper over a soft warm patch: masked midrib, a variegated wash laid around it,
// then the veins in a tapering rigger stroke. Claude (Haiku) study, a first try at the wash tool on a small shape.
const S=window.__sim,h=S.headless,V=S.values,M=window.__minds;
window.__paintLog=[];
const log=t=>{window.__paintLog.push(t);console.log('[paint]',t);};
const pts=(f,n=24)=>Array.from({length:n+1},(_,i)=>f(i/n));
const C=[500,400], ANG=-0.5, L=290, W=84;                       // centre, tilt (rad), length, half-width (cells)
const at=(t,off,side=0)=>{                                      // point along the leaf: t 0 base to 1 tip, off across (-1..1 of W)
  const x=(t-0.5)*L, y=side*W*off*Math.sin(Math.PI*Math.pow(t,0.85))*(1-0.2*t);
  return [C[0]+x*Math.cos(ANG)-y*Math.sin(ANG), C[1]+x*Math.sin(ANG)+y*Math.cos(ANG)];
};
const outline=[...pts(t=>at(t,1,-1),40), ...pts(t=>at(1-t,1,1),40).slice(1)];
const midrib=pts(t=>{const [x,y]=at(t,0);return [x,y+5*Math.sin(Math.PI*t),0.5];},40);
const load=(mix,p,r,w,b='round')=>{S.tool('paint');h.setBrushPreset(b);h.setBrush(mix);V.brushPigment=p;V.brushRadius=r;V.dipLoad=w;};
window.__paintDone=(async()=>{
  h.setPaper('coldPress',7);h.setTone('natural');S.clear();
  const dry=async(p=[[120,80]])=>{S.act('dry',true);try{await S.skipTo('dry',{points:p});}finally{S.act('dry',false);}};

  log('a soft warm patch behind, wider than the leaf');
  await S.dampen(M.maskOf(pts(t=>{const a=t*2*Math.PI;return[C[0]+(230+18*Math.sin(3*a))*Math.cos(a),C[1]+(170+14*Math.cos(2*a))*Math.sin(a)];},90)),0.8,0.012,30);
  load([['Transparent Yellow Oxide',3],['Quinacridone Rose',1]],0.03,40,0.12,'mop');
  for(const dy of [-130,-95,-60,-25,10,45,80,115]){
    await S.path(pts(t=>[C[0]-230+460*t,C[1]+dy+8*Math.sin(t*3),0.15+0.75*Math.sin(Math.PI*t)],16),2);
  }
  await dry([[300,300]]);

  log('mask the midrib so it stays white');
  S.tool('mask');V.brushRadius=2;
  await S.path(midrib,2);
  await dry([[300,300]]);

  log('the leaf: a variegated sage into a darker green, laid wet, around the mask');
  load([['Transparent Yellow Oxide',3],['Phthalo Green',1]],0.2,30,0.35,'mop');
  await S.wash(outline,{kind:'variegated',into:[['Perylene Green',1],['Raw Umber',0.4]],direction:'across',paper:'moist'});
  await M.waitDry([at(0.5,-0.5,-1)]);
  await S.look('leaf-wash');

  log('peel the mask');
  S.act('unmask');
  await dry([at(0.5,0)]);

  log('a cast shadow, cool and thin, into a damp oval under the leaf');
  await S.dampen(M.maskOf(pts(t=>{const a=t*2*Math.PI;return[C[0]+160+150*Math.cos(a),C[1]+70+40*Math.sin(a)];},60)),0.6,0.008,20);
  load([['French Ultramarine',2],['Quinacridone Rose',1]],0.07,14,0.1);
  await S.path(pts(t=>[C[0]-120+300*t,C[1]+80+6*Math.sin(t*3),0.1+0.6*Math.sin(Math.PI*t)],20),2);
  await dry([[500,470]]);

  log('veins: a tapering rigger stroke off each side of the midrib');
  load([['Raw Umber',2],['Perylene Green',1]],0.35,3,0.2,'rigger');
  for(let k=0;k<5;k++){
    const t0=0.18+0.14*k;
    for(const side of [-1,1]){
      const p=pts(s=>{const [x,y]=at(t0+0.2*s,0.65*s,side);return [x,y,0.08+0.6*Math.sin(Math.PI*s)];},12);
      await S.path(p,3);
    }
  }
  await dry([[300,300]]);
  await S.look('finished');
  await S.note('Leaf study (paintings/leaf.js): warm patch of mop strokes into a damp oval, midrib masked and peeled, a variegated sage wash (yellow oxide into perylene green and raw umber) laid around the mask on moist paper, a thin violet cast shadow, rigger veins tapering at both ends. No physics changes.');
  log('done');
})();
