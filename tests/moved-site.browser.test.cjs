const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const http=require('node:http');
const path=require('node:path');
const {chromium}=require('playwright');

const project='/padel-toss-kotc-americano/';
const cloud='https://padel.hound83.workers.dev';
const root=path.join(__dirname,'..'),built=path.join(root,'_site');
const hasBuild=fs.existsSync(path.join(built,'index.html'));
const moved=fs.readFileSync(hasBuild?path.join(built,'index.html'):path.join(root,'_layouts/verhuisd.html'),'utf8');
const readWorker=()=>hasBuild?fs.readFileSync(path.join(built,'sw.js'),'utf8'):
  fs.readFileSync(path.join(root,'pages/cache-opruimen.txt'),'utf8').replace(/^---[\s\S]*?---\s*/,'');
const modes=['toss','koc','americano','splitToss'];

test('Pages builds only a notice at every legacy entry point',()=>{
  if(process.env.GITHUB_ACTIONS)assert.ok(hasBuild,'the Pages site must be built before running browser tests');
  if(!hasBuild)return;
  for(const name of ['index.html','kijken.html','aanmelden.html','404.html']){
    const html=fs.readFileSync(path.join(built,name),'utf8');
    assert.match(html,/De Padel Planner is verhuisd/);
    assert.doesNotMatch(html,/id="appVersion"|id="rounds"|id="panel0"|koriander-sessions/);
  }
  assert.match(readWorker(),/pages-moved/);
  for(const name of ['round-planner.js','session-admin.js','sessions','tests']){
    assert.equal(fs.existsSync(path.join(built,name)),false,name+' must stay out of Pages');
  }
});

test('Old links retain the event, query and fragment, and a local-only draw can be downloaded and imported into 3.3',async t=>{
  const browser=await chromium.launch();t.after(()=>browser.close());
  const ctx=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844},hasTouch:true});
  const page=await ctx.newPage(),old='https://hound83.github.io'+project;
  await ctx.route('https://hound83.github.io/**',route=>{
    if(route.request().resourceType()==='image')return route.fulfill({path:path.join(root,'assets/mode-toss.svg'),contentType:'image/svg+xml'});
    return route.fulfill({status:200,body:moved,contentType:'text/html'});
  });
  await ctx.route(cloud+'/**',route=>{
    const url=new URL(route.request().url()),file=url.pathname==='/'?'index.html':url.pathname.slice(1);
    if(!['index.html','poll-common.js','organizer-hub.js','round-planner.js','ranking.js','session-admin.js','name-hint.js','schedule-document.js','visual-theme.css','manifest.webmanifest','icon.svg','icon-192.png','icon-512.png'].includes(file) && !file.startsWith('assets/')){
      return route.fulfill({status:404,body:''});
    }
    const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'};
    return route.fulfill({path:path.join(root,file),contentType:mime[path.extname(file)]||'application/octet-stream'});
  });
  for(const [prior,next] of [
    ['?preview=2.8&rehearsal=1','/?rehearsal=1'],['?preview=3&poll=abcdef12345678','/?poll=abcdef12345678'],
    ['aanmelden/abcdef12345678','/aanmelden/abcdef12345678'],['s/ABCD-EFGH','/s/ABCD-EFGH'],['b/demo','/b/demo'],
    ['beheer/sessie/voorbeeld','/beheer/sessie/voorbeeld'],['kijken.html?preview=3#kijkcode','/kijken.html#kijkcode']
  ]){
    await page.goto(old+prior);
    await page.getByRole('heading',{name:'De Padel Planner is verhuisd'}).waitFor();
    assert.equal(await page.locator('#open').getAttribute('href'),cloud+next);
    assert.equal(await page.locator('.format-btn').count(),0);
  }
  const channel='koriander-11111111-2222-4333-a444-555555555555';
  const final={closed:true,at:12,rounds:[{n:1,rows:[{label:'Baan 1',teams:[['Speler A'],['Speler B']],score:[24,16]}]}],boards:[]};
  const sourceHash=channel+'.'+'a'.repeat(43)+'.'+'b'.repeat(87)+'.early';
  await page.evaluate(({channel,final})=>localStorage.setItem('padel-view-final-'+channel,JSON.stringify(final)),{channel,final});
  await page.goto(old+'kijken.html#'+sourceHash);
  await page.reload(); // A second visit with the old device's cached final score.
  await page.waitForFunction(()=>!document.getElementById('open').hash.endsWith('.early'));
  const viewerTarget=new URL(await page.locator('#open').getAttribute('href'));
  assert.equal(viewerTarget.origin,cloud);assert.equal(viewerTarget.search,'');
  const fields=viewerTarget.hash.slice(1).split('.');
  assert.deepEqual(fields.slice(0,3),sourceHash.split('.').slice(0,3));
  assert.deepEqual(JSON.parse(require('node:zlib').gunzipSync(Buffer.from(fields[3],'base64url'))),final);
  await page.goto(old+'?preview=3.1');
  await page.waitForURL(cloud+'/');
  assert.equal(await page.locator('#appVersion').innerText(),'v3.3.0');
  assert.deepEqual((await page.locator('.format-btn').evaluateAll(all=>all.map(el=>el.dataset.format))).sort(),modes.slice().sort());
  await page.locator('.format-btn[data-format=toss]').click();await page.locator('#continueTo2').click();
  await page.locator('#namesGrid input').first().fill('Test Deelnemer');await page.locator('#generateBtn').click();
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('padel-toss-americano-session-v2'))?.state?.step===3);
  const draft=await page.evaluate(()=>localStorage.getItem('padel-toss-americano-session-v2'));
  await page.goto(old);await page.evaluate(d=>localStorage.setItem('padel-toss-americano-session-v2',d),draft);await page.reload();
  await page.locator('#saved').waitFor();
  const download=page.waitForEvent('download');await page.getByRole('button',{name:/Download Planner/}).tap();
  const filename=await (await download).path();
  const saved=JSON.parse(fs.readFileSync(filename,'utf8'));
  assert.equal(saved.format,'padel-scheduler');assert.deepEqual(saved.state,JSON.parse(draft).state);
  assert.equal(await page.evaluate(()=>localStorage.getItem('padel-toss-americano-session-v2')),draft);
  await page.evaluate(()=>localStorage.clear()); // isolated legacy origin, synthetic fixture only
  await page.locator('#open').tap();await page.waitForURL(cloud+'/');
  await page.evaluate(()=>localStorage.clear());await page.reload();
  const picker=page.locator('input[type=file]').first();
  await picker.setInputFiles({name:'wedstrijd.json',mimeType:'application/json',buffer:fs.readFileSync(filename)});
  await page.locator('#panel3').waitFor();
  assert.ok((await page.locator('#scheduleRound1').innerText()).includes('Test Deelnemer') ||
            (await page.locator('#panel3').innerText()).includes('Test Deelnemer'));
});

test('An installed GitHub copy replaces the old offline planner and retains local drafts',async t=>{
  let upgraded=false;
  const first="self.addEventListener('install',e=>e.waitUntil(caches.open('padel-toss-americano-old').then(c=>c.add('./index.html')).then(()=>self.skipWaiting())));self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));";
  const server=http.createServer((req,res)=>{
    const p=new URL(req.url,'http://localhost').pathname;
    if(p===project+'sw.js')return res.writeHead(200,{'Content-Type':'text/javascript','Cache-Control':'no-store'}).end(upgraded?readWorker():first);
    if(p.endsWith('.svg'))return res.writeHead(200,{'Content-Type':'image/svg+xml'}).end(fs.readFileSync(path.join(root,'assets/mode-toss.svg')));
    res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'}).end(upgraded?moved:'<!doctype html><title>oude planner</title>');
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>(server.closeAllConnections(),server.close(resolve))));
  const browser=await chromium.launch();t.after(()=>browser.close());
  const ctx=await browser.newContext(),page=await ctx.newPage(),url='http://127.0.0.1:'+server.address().port+project;
  await page.goto(url);
  await page.evaluate(async()=>{
    localStorage.setItem('unrelated','keep');await caches.open('another-site-cache');
    localStorage.setItem('padel-toss-americano-session-v2',JSON.stringify({format:'padel-toss-autosave',version:2,state:{format:'toss'}}));
    await navigator.serviceWorker.register('./sw.js');await navigator.serviceWorker.ready;
  });
  await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
  // Capture the old controller before the update. Removing its cache alone does not prove that
  // Chromium has finished activating its replacement and delivered the controllerchange event.
  upgraded=true;
  const control=page.evaluate(async()=>{
    const reg=await navigator.serviceWorker.getRegistration();
    const previous=navigator.serviceWorker.controller;
    const takeover=new Promise(resolve=>{
      navigator.serviceWorker.addEventListener('controllerchange',()=>resolve(),{once:true});
    });
    await reg.update();
    if(navigator.serviceWorker.controller===previous)await takeover;
    const active=navigator.serviceWorker.controller;
    if(active.state!=='activated')await new Promise(resolve=>active.addEventListener('statechange',()=>{
      if(active.state==='activated')resolve();
    }));
  });
  await control;
  await page.waitForFunction(async()=>!(await caches.keys()).includes('padel-toss-americano-old'));
  await ctx.setOffline(true);await page.reload();
  await page.locator('#saved').waitFor();
  assert.equal(await page.getByRole('heading').first().innerText(),'De Padel Planner is verhuisd');
  assert.equal(await page.evaluate(()=>localStorage.getItem('unrelated')),'keep');
  assert.ok(await page.evaluate(()=>caches.has('another-site-cache')));
});
