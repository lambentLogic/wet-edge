// Colour test: four orange mixes as flat moist washes, to find the persimmon.
const S=window.__sim,h=S.headless,V=S.values,M=window.__minds;
const pts=(f,n=60)=>Array.from({length:n+1},(_,i)=>f(i/n));
const disc=(x,y,r)=>pts(t=>[x+r*Math.cos(t*2*Math.PI),y+r*Math.sin(t*2*Math.PI)],60);
const MIXES=[
  [['Pyrrole Scarlet',3],['Transparent Yellow Oxide',2]],
  [['Pyrrole Scarlet',3],['Transparent Yellow Oxide',2],['Transparent Red Oxide',1]],
  [['Pyrrole Scarlet',2],['Transparent Red Oxide',2],['Transparent Yellow Oxide',2],['Bismuth Vanadate Yellow',1]],
  [['Pyrrole Scarlet',4],['Transparent Yellow Oxide',3],['Indian Red',1]],
];
window.__paintDone=(async()=>{
  h.setPaper('coldPress',17);h.setTone('natural');S.clear();
  const X=[170,390,620,850],Y=380,R=85;
  for(let i=0;i<4;i++){
    h.setBrushPreset('mop');h.setBrush(MIXES[i]);V.brushRadius=70;
    V.brushPigment=[0.35,0.35,0.45,0.5][i];V.dipLoad=0.35;
    await S.wash(disc(X[i],Y,R),{kind:'flat',paper:'moist'});
    S.act('dry',true);try{await S.skipTo('dry',{points:[[X[i],Y]]});}finally{S.act('dry',false);}
  }
  await S.look('mixes');
})();
