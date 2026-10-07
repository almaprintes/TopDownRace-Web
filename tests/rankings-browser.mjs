import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir} from 'node:fs/promises';
const require=createRequire(import.meta.url);
const {webkit}=require(require.resolve('playwright',{paths:[process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES||process.cwd()]}));
const cars=['avenir_gripline','helix_vortex','helix_spark'];
const entries=Array.from({length:10},(_,i)=>({rank:i+1,nick:['JUANFRIKI','JUANFRIKAZO_DEV','JOSELU','MERCHITA','PRUEBA','MIA','CaMByMaN'][i]||'PILOTO',best_time_ms:8789+i*1000,car_id:cars[i%3]}));
const payload={version:1,generated_at:new Date().toISOString(),tracks:[{id:'circuito-atlantico',entries},{id:'santa-cruz',entries:[{...entries[0],nick:'JUANFRIKAZO_DEV',car_id:'helix_vortex'}]},{id:'empty',entries:[]}]};
await mkdir('test-results',{recursive:true});
const browser=await webkit.launch();
try {
 for(const width of [390,430,320,1024]){
  const page=await browser.newPage({viewport:{width,height:900},deviceScaleFactor:1,isMobile:width<600,hasTouch:width<600,reducedMotion:'reduce'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://**/*',async route=>{
   const url=route.request().url();
   if(url.includes('/web_leaderboard_snapshot'))return route.fulfill({json:[{payload}]});
   if(url.includes('/web_track_comments'))return route.fulfill({json:[{display_name:'Test piloto',message:'Paddock operativo',created_at:new Date().toISOString()}]});
   return route.abort();
  });
  await page.goto('http://127.0.0.1:8765/#records');
  await page.locator('.rankingRow').first().waitFor();
  await page.waitForFunction(()=>[...document.querySelectorAll('.rankingCar')].every(img=>img.complete&&img.naturalWidth>0));
  const check=async()=>{
   const violations=await page.locator('.rankingRow').evaluateAll(rows=>{
    const failures=[];
    for(const row of rows){
     const [pos,nick,art,time]=row.children;
     const r=row.getBoundingClientRect(),n=nick.getBoundingClientRect(),a=art.getBoundingClientRect(),t=time.getBoundingClientRect();
     if(n.right>a.left+.5||a.right>t.left+.5||t.right>r.right+.5)failures.push('overlap '+row.dataset.rank);
     if(nick.scrollWidth>nick.clientWidth+1||time.scrollWidth>time.clientWidth+1)failures.push('text clipped '+row.dataset.rank);
     if(getComputedStyle(row).overflow!=='hidden'||getComputedStyle(art).overflow!=='hidden')failures.push('missing clipping');
     if(a.top<r.top||a.bottom>r.bottom+.5)failures.push('art outside row');
     if(Number(row.dataset.rank)>3&&art.children.length)failures.push('car outside podium');
     if(getComputedStyle(row).color!=='rgb(245, 245, 247)')failures.push('dimmed text');
    }
    if(document.documentElement.scrollWidth>innerWidth)failures.push('page overflow');
    return failures;
   });
   assert.deepEqual(violations,[],`${width}px layout`);
  };
  await check();
  await page.locator('.rankingCard').screenshot({path:`test-results/records-${width}.png`});
  assert.equal(await page.locator('.rankingCar').count(),3);
  assert.match(await page.locator('#trackComments').innerText(),/Paddock operativo/);
  await page.selectOption('#rankingTrack','santa-cruz');
  assert.equal(await page.locator('.rankingRow').count(),1);
  await page.waitForFunction(()=>document.querySelector('.rankingCar').naturalWidth>0);
  await check();
  await page.selectOption('#lang','en');
  assert.match(await page.locator('.rankingHeader').innerText(),/Best lap/);
  await page.selectOption('#rankingTrack','empty');
  assert.equal(await page.locator('#rankingTable').isVisible(),false);
  assert.match(await page.locator('#rankingEmpty').innerText(),/No published times/);
  assert.deepEqual(errors,[]);
  console.log(`PASS WebKit ${width}px: clipping, long nick, lap times, tracks, language, comments, empty state`);
  await page.close();
 }
} finally {await browser.close();}
