// Reopen the rerun and verify the actual foreground, rather than blank sky.
const S=window.__sim,h=S.headless;
window.__paintDone=(async()=>{
  h.begin();
  try {
    for(let simulated=0;simulated<600;simulated+=5) {
      let wet=0,film=0;
      for(const [x,y] of [[120,640],[140,720],[800,650]]) {
        const s=await S.sense(x,y,10);
        wet=Math.max(wet,s.water,s.damp*0.3); film=Math.max(film,s.water);
      }
      console.log('[paint]','foreground wetness',wet,'surface water',film);
      if(wet<0.003) { await h.wait(2); await S.look('verified-finished'); return; }
      await h.wait(5,{dry:film<0.003});
    }
    throw new Error('Foreground did not dry.');
  } finally { h.end(); }
})();
