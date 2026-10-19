// Autumn lantern (a Fuyu persimmon) on white paper.
// Fourteenth pass, on d3c2bd0 (a wash's strokes no longer push wet paint; the push was what
// made a round wash's heavy side and pale foot). With that gone a variegated body is clean again
// - the reason I abandoned it was the bias - and it carries a lateral turn (L 58 left to 46
// right) where a graded body gives only 60 to 56 top to bottom. Body: variegated 0.42 into the
// darker mix; the wash's paint multiplier also dropped 1.38 -> 1.05, so the same density needs a
// higher strength than before (a flat body matches at ~0.52).
const S=window.__sim,h=S.headless,V=S.values,M=window.__minds;
window.__paintLog=[];
const log=t=>{window.__paintLog.push(t);console.log('[paint]',t);};
const pts=(f,n=24)=>Array.from({length:n+1},(_,i)=>f(i/n));
const oval=(x,y,rx,ry,n=64)=>pts(t=>[x+rx*Math.cos(t*2*Math.PI),y+ry*Math.sin(t*2*Math.PI)],n);
const load=(mix,p,r,w,b='round')=>{S.tool('paint');h.setBrushPreset(b);h.setBrush(mix);V.brushPigment=p;V.brushRadius=r;V.dipLoad=w;};

const CX=512, CY=404, A=172, B=134;
const LIGHT=[['Transparent Yellow Oxide',3],['Pyrrole Scarlet',2],['Bismuth Vanadate Yellow',1]];
const DEEP=[['Pyrrole Scarlet',3],['Transparent Red Oxide',2],['Quinacridone Rose',0.5]];
const DARKER=[['Transparent Red Oxide',3],['Pyrrole Scarlet',2],['Perylene Violet',0.5]];
const CALYX_MIX=[['Raw Umber',2.5],['Transparent Yellow Oxide',3],['Perylene Green',0.4],['Perylene Maroon',0.6]];

const fruit=pts(a=>{
  const t=a*2*Math.PI, c=Math.cos(t), s=Math.sin(t), e=2/2.3;
  const x=CX+A*Math.sign(c)*Math.pow(Math.abs(c),e);
  const y=CY+B*Math.sign(s)*Math.pow(Math.abs(s),e)*(s<0?0.90:0.98);
  return [x,y];
},200);
const edgeY=(x,below)=>{
  let best=below?-1e9:1e9;
  for(const [px,py] of fruit) if(Math.abs(px-x)<6) best=below?Math.max(best,py):Math.min(best,py);
  return best;
};
const inside=(x,inset,below)=>{const y=edgeY(x,below);return Number.isFinite(y)?(below?y-inset:y+inset):CY;};
const inPoly=(x,y)=>{
  let c=false;
  for(let i=0,j=fruit.length-1;i<fruit.length;j=i++){
    const [xi,yi]=fruit[i],[xj,yj]=fruit[j];
    if(((yi>y)!==(yj>y))&&(x<(xj-xi)*(y-yi)/(yj-yi)+xi))c=!c;
  }
  return c;
};
// a calyx lies on the fruit: no mark of it may cross the silhouette
const onFruit=(p,margin=5)=>{
  let [x,y]=p;
  for(let k=0;k<40&&!inPoly(x,y);k++){x+=(CX-x)*0.08;y+=((CY-60)-y)*0.08;}
  const dx=CX-x, dy=(CY-60)-y, d=Math.hypot(dx,dy)||1;
  return [x+dx/d*Math.min(margin,d),y+dy/d*Math.min(margin,d)];
};

const CALY=326, SL=0.30;
const lobeAngles=[0.80,0.80+Math.PI/2,0.80+Math.PI,0.80+3*Math.PI/2];
const at=(ang,u,v)=>[CX+u*Math.cos(ang)-v*Math.sin(ang), CALY+SL*(u*Math.sin(ang)+v*Math.cos(ang))];

window.__paintDone=(async()=>{
  h.setPaper('coldPress',17);h.setTone('natural');S.clear();
  const dry=async(p)=>{S.act('dry',true);try{await S.skipTo('dry',{points:p});}finally{S.act('dry',false);}};

  log('cast shadow: violet into a damp oval, below the base, darkest right at the contact');
  await S.dampen(M.maskOf(oval(556,546,190,34)),0.8,0.009,26);
  load([['French Ultramarine',2],['Quinacridone Rose',1.5],['Raw Umber',0.5]],0.115,26,0.08,'mop');
  for(const [dx,dy,w] of [[-46,2,0.94],[0,6,1.0],[44,12,0.86]])
    await S.path(pts(t=>[424+dx+272*t*w,542+dy+4*Math.sin(t*3),0.06+0.5*Math.sin(Math.PI*t)],18),3);
  load([['French Ultramarine',2],['Perylene Maroon',1],['Raw Umber',1]],0.13,17,0.07);
  await S.path(pts(t=>[452+174*t,540+2*Math.sin(t*4),0.1+0.4*Math.sin(Math.PI*t)],16),3);
  await dry([[556,546]]);await S.look('shadow');

  log('the fruit: yellow-orange across into deep red-orange, one variegated wash');
  h.setBrushPreset('mop');h.setBrush(LIGHT);V.brushRadius=72;V.brushPigment=0.42;V.dipLoad=0.36;
  await S.wash(fruit,{kind:"variegated",into:DARKER,direction:"across",paper:"moist"});
  await S.skipTo('shiny',{points:[[512,406]]});

  log('the deepest note low on the right, while shiny, following the form');
  load(DARKER,0.24,32,0.2,'mop');
  for(let k=0;k<3;k++)
    await S.path(pts(t=>{const x=618+8*k-24*Math.sin(Math.PI*t);return [...onFruit([x,372+112*t+8*k],18),0.05+0.32*Math.sin(Math.PI*t)];},16),2);

  log('lift along the top edge, just inside it');
  await S.skipTo('satin',{points:[[512,406]]});
  S.tool('water');V.brushRadius=18;V.dipLoad=0.18;
  await S.path(pts(t=>{const x=390+250*t;return [x,inside(x,9,false),0.1+0.3*Math.sin(Math.PI*t)];},22),5);
  V.brushRadius=11;V.dipLoad=0.1;
  await S.path([[452,356,0.12],[470,352,0.25],[486,350,0.1]],5);
  await dry([[512,406]]);await S.look('fruit-dry');

  log('the calyx: one dark collar on the shoulder, four points, all of it on the fruit');
  const collar=pts(t=>{const a=t*2*Math.PI;return onFruit([CX+62*Math.cos(a),CALY+24*Math.sin(a)],4);},48);
  h.setBrush(CALYX_MIX);V.brushRadius=24;V.brushPigment=0.42;V.dipLoad=0.34;
  await S.wash(collar,{kind:'flat',paper:'moist'});
  await dry([[512,CALY]]);
  for(const a of lobeAngles){
    load(CALYX_MIX,0.4,16,0.3,'mop');
    await S.path(pts(t=>{const [x,y]=at(a,28+84*t,2*Math.sin(t*2));return [...onFruit([x,y],4),0.3+0.6*Math.sin(Math.PI*Math.pow(t,0.8))];},14),3);
  }
  await S.skipTo('damp',{points:[[512,CALY]]});

  log('creases, dark centre, tan lit edges, stem, and the shadow it throws');
  load([['Raw Umber',2],['Perylene Maroon',1.5],['Perylene Green',1]],0.55,3.5,0.18,'rigger');
  for(const a of lobeAngles.map(a=>a+Math.PI/4))
    await S.path(pts(t=>{const [x,y]=at(a,8+40*t,0);return [...onFruit([x,y],4),0.1+0.4*Math.sin(Math.PI*t)];},10),3);
  load('Raw Umber',0.6,3.5,0.25);
  await S.path([[CX,320,0.85],[CX-3,306,0.6],[CX+4,292,0.25]],4);
  await dry([[512,CALY]]);

  load([['Titanium Buff',2],['Transparent Yellow Oxide',2],['Raw Umber',0.6]],0.24,2.5,0.2,'rigger');
  for(const a of lobeAngles)
    await S.path(pts(t=>{const [x,y]=at(a,62+44*t,-9);return [...onFruit([x,y],4),0.15+0.4*Math.sin(Math.PI*t)];},10),3);
  // the stem scar, pale, around the stem
  load([['Titanium Buff',2],['Transparent Yellow Oxide',1]],0.16,3,0.3);
  await S.path(pts(t=>[CX+7+11*Math.cos(t*Math.PI),CALY-6+4*Math.sin(t*Math.PI),0.15+0.25*Math.sin(Math.PI*t)],14),4);
  load([['Transparent Red Oxide',2],['Pyrrole Scarlet',1],['Perylene Maroon',0.5]],0.13,12,0.12);
  await S.path([[560,344,0.1],[590,352,0.4],[612,362,0.1]],4);
  await dry([[512,CALY]]);
  await S.look('finished');
  await S.note('Autumn lantern (paintings/autumn-lantern.js), DeepSeek: a Fuyu persimmon on white paper, repainted on d3c2bd0. That change (a wash strokes do not push wet paint; brushDrag 0 while the Wash tool works) removed the round wash heavy side and pale foot, so the probe now reads a symmetric rim (disc sides 1.23/1.20 and 1.21/1.21) and a foot of 1.00. Because the push had been spreading paint thin, the wash paint multiplier fell 1.38 -> 1.05 and the same density now needs a higher strength: a flat body matches the old 0.47 at about 0.52. Variegated is usable again now the bias is gone, and it is the better body here - measured on the fruit it runs L 58 left to 46 right, where a graded body only runs 60 to 56 top to bottom (graded does work; I had been measuring the wrong axis). Body variegated 0.42 into the darker red-oxide mix; calyx and shadow as before.');
  log('done');
})();