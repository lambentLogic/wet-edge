// A single plum with its bloom, on white paper with a soft warm patch behind (after Sol's vignettes).
const S=window.__sim,h=S.headless,V=S.values,M=window.__minds;
window.__paintLog=[];
const log=t=>{window.__paintLog.push(t);console.log('[paint]',t);};
const pts=(f,n=24)=>Array.from({length:n+1},(_,i)=>f(i/n));
const oval=(x,y,rx,ry)=>pts(t=>[x+rx*Math.cos(t*2*Math.PI),y+ry*Math.sin(t*2*Math.PI)],60);
// plum outline: round, a little wider than tall, a shallow dimple at the stem, slightly lopsided
const knots=[[500,262],[538,252],[588,268],[626,312],[636,372],[620,432],[580,474],[526,488],[470,478],[428,440],[412,380],[424,318],[458,276]];
const plum=knots.flatMap((b,i)=>{const a=knots[(i+knots.length-1)%knots.length],c=knots[(i+1)%knots.length],d=knots[(i+2)%knots.length];return pts(t=>[0,1].map(k=>0.5*((2*b[k])+(-a[k]+c[k])*t+(2*a[k]-5*b[k]+4*c[k]-d[k])*t*t+(-a[k]+3*b[k]-3*c[k]+d[k])*t*t*t)),6).slice(0,-1);});
const load=(mix,p,r,w,b='round')=>{S.tool('paint');h.setBrushPreset(b);h.setBrush(mix);V.brushPigment=p;V.brushRadius=r;V.dipLoad=w;};
window.__paintDone=(async()=>{
  h.setPaper('coldPress',52);h.setTone('natural');S.clear();
  const dry=async()=>{S.act('dry',true);try{await S.skipTo('dry');}finally{S.act('dry',false);}};
  log('a faint warm patch behind');
  const patch=pts(t=>{const a=t*2*Math.PI;return[524+(250+20*Math.sin(3*a))*Math.cos(a),378+(200+24*Math.cos(4*a))*Math.sin(a)];},90);
  await S.dampen(M.maskOf(patch),0.85,0.016,35);
  load([['Transparent Yellow Oxide',3],['Quinacridone Rose',1]],0.03,55,0.1,'mop');
  for(const [x,y,len] of [[300,230,440],[285,300,470],[300,370,440],[330,440,380],[370,505,300]]){
    V.brushPigment=y<330?0.035:0.022;
    await S.path(pts(t=>[x+len*t,y+10*Math.sin(t*4),0.12+0.8*Math.sin(Math.PI*t)],18),2);
  }
  await dry();await S.look('ground');
  log('cast shadow, cool violet, into a damp oval');
  await S.dampen(M.maskOf(oval(560,508,190,40)),0.7,0.009,20);
  load([['French Ultramarine',2],['Quinacridone Rose',1.5],['Raw Umber',0.5]],0.08,16,0.09);
  await S.path(pts(t=>[420+280*t,510+5*Math.sin(t*3),0.1+0.65*Math.sin(Math.PI*t)],24),2);
  await dry();
  log('the plum: rose into violet across the form, wet');
  h.setBrushPreset('round');h.setBrush([['Quinacridone Rose',2],['Perylene Violet',1]]);V.brushRadius=24;V.brushPigment=0.2;V.dipLoad=0.6;
  await S.wash(plum,{kind:'variegated',into:[['Perylene Violet',2],['French Ultramarine',1]],direction:'across',paper:'moist'});
  await S.skipTo('satin',{points:[[520,380]]});
  log('shadow side: deep ultramarine-violet-maroon in curved strokes, thirsty brush');
  load([['French Ultramarine',2],['Perylene Maroon',1],['Perylene Violet',1]],0.2,20,0.08);
  for(let k=0;k<4;k++)await S.path(pts(t=>[596+10*k-26*Math.sin(t*Math.PI),290+170*t,0.1+0.6*Math.sin(t*Math.PI)],20),2);
  await S.path(pts(t=>[440+150*t,470+10*Math.sin(t*Math.PI),0.1+0.5*Math.sin(t*Math.PI)],18),2);
  await dry();await S.look('plum-form');
  log('bloom: lift a soft pale dusting on the lit upper left');
  // rewet lightly and lift once at damp is risky; instead a thin glaze of cool grey-blue over the light
  load([['French Ultramarine',1],['Titanium Buff',2]],0.05,26,0.12,'mop');
  await S.path(pts(t=>[452+50*t,300+70*t+20*Math.sin(t*Math.PI),0.15+0.5*Math.sin(t*Math.PI)],10),2);
  await dry();
  log('dimple, stem, and a stalk scar');
  load([['Raw Umber',2],['Perylene Maroon',1]],0.4,3,0.2);
  await S.path([[505,268,0.3],[512,282,0.6],[508,310,0.5],[504,336,0.2]],4);
  load('Raw Umber',0.5,3.5,0.2);
  await S.path([[500,264,0.9],[496,246,0.65],[504,222,0.3]],4);
  await dry();await S.look('finished');
  await S.note('Plum vignette (paintings/plum.js): warm patch of loose mop strokes, cool violet cast shadow into a damp oval, rose-to-violet variegated body at moist, thirsty ultramarine/maroon/violet curved strokes at satin, a thin buff-ultramarine veil for the bloom, umber cleft and stem. No physics changes.');
  log('done');
})();
