const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {chromium}=require('playwright');

test('illustrated home: keyboard, all formats, EN/mobile, offline assets and existing-client upgrade',{timeout:90000},async t=>{
  const root=path.join(__dirname,'..');
  const worker=fs.readFileSync(path.join(root,'sw.js'),'utf8');
  const kocArtwork=fs.readFileSync(path.join(root,'assets/mode-koc.svg'),'utf8');
  const legacyArtwork=kocArtwork.replace('</svg>','<text x="437" y="241">4</text></svg>');
  let browser,ctx;
  let legacy=true;
  const mime={'.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
  const server=http.createServer((req,res)=>{
    const pathname=new URL(req.url,'http://localhost').pathname;
    const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
    if(!file.startsWith(root+path.sep))return res.writeHead(403).end();
    try{
      let body;
      if(pathname==='/sw.js')body=legacy?worker.replace('v242','v230'):worker;
      else if(pathname==='/assets/mode-koc.svg'&&legacy)body=legacyArtwork;
      else body=fs.readFileSync(file);
      res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'}).end(body);
    }catch{res.writeHead(404).end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{
    if(ctx)await ctx.close();
    if(browser)await browser.close();
    server.closeAllConnections();
    await new Promise(resolve=>server.close(resolve));
  });
  browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH}:{})});
  ctx=await browser.newContext({viewport:{width:1280,height:900}});
  const page=await ctx.newPage();
  page.setDefaultTimeout(15000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const origin='http://127.0.0.1:'+server.address().port;
  await page.goto(origin);
  // Production registers on HTTPS. Localhost is a secure test context; register
  // explicitly here to exercise the real worker without weakening that guard.
  await page.evaluate(()=>navigator.serviceWorker.register('./sw.js'));
  console.log('Illustrated home: browser loaded and offline worker registered.');
  await page.waitForFunction(()=>[...document.querySelectorAll('.mode-illustration')].every(img=>img.complete&&img.naturalWidth>0));
  const screenshotDir=process.env.PADEL_SCREENSHOT_DIR;
  if(screenshotDir){fs.mkdirSync(screenshotDir,{recursive:true});await page.screenshot({path:path.join(screenshotDir,'desktop-home.png'),fullPage:true});}
  assert.equal(await page.locator('.mode-illustration').count(),4);
  const art=await (await ctx.request.get(origin+'/assets/mode-americano.svg')).text();
  assert.ok(art.includes('26–6'),'illustrated score is a point score, never a clock');
  await page.locator('.format-btn[data-format="toss"]').focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('#panel0').isVisible(),false);
  assert.match(await page.locator('#formatMark img').getAttribute('src'),/mode-toss\.svg$/);
  await page.locator('#mastheadBack').click();
  for(const [mode,asset]of [['koc','koc'],['americano','americano'],['splitToss','split']]){
    await page.locator('.format-btn[data-format="'+mode+'"]').click();
    assert.equal(await page.locator('#panel0').isVisible(),false);
    assert.equal(await page.locator('#brandEyebrow').isVisible(),true);
    assert.match(await page.locator('#formatMark img').getAttribute('src'),new RegExp('mode-'+asset+'\\.svg$'));
    if(screenshotDir&&mode==='koc')await page.screenshot({path:path.join(screenshotDir,'desktop-koc.png'),fullPage:true});
    await page.locator('#mastheadBack').click();
  }
  await page.locator('[data-lang="en"]').click();
  assert.equal(await page.locator('#modeHomeTitle').innerText(),'What shall we play?');
  assert.equal(await page.locator('[data-i18n="homeAmericanoAction"]').innerText(),'Choose Americano');
  for(const width of [320,390,768,1280]){
    await page.setViewportSize({width,height:900});
    if(screenshotDir&&width===390)await page.screenshot({path:path.join(screenshotDir,'mobile-home.png'),fullPage:true});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'home fits '+width+'px');
    await page.locator('.format-btn[data-format="koc"]').click();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'selected-format header fits '+width+'px');
    await page.locator('#mastheadBack').click();
  }
  await page.evaluate(()=>navigator.serviceWorker.ready);
  console.log('Illustrated home: keyboard, modes, languages and responsive layouts passed.');
  await page.waitForFunction(async()=>!!navigator.serviceWorker.controller&&(await caches.keys()).includes('padel-toss-americano-v230'));
  const previousArtwork=await page.evaluate(async()=>{
    const cache=await caches.open('padel-toss-americano-v230');
    return (await cache.match('./assets/mode-koc.svg')).text();
  });
  assert.match(previousArtwork,/<text\b[^>]*>4<\/text>/);
  await page.evaluate(()=>localStorage.setItem('visual-upgrade-check','keep-this-session'));
  legacy=false;
  await page.evaluate(async()=>{
    const reg=await navigator.serviceWorker.getRegistration();
    const activated=new Promise((resolve,reject)=>reg.addEventListener('updatefound',()=>{
      const next=reg.installing;
      const check=()=>{if(next.state==='activated')resolve();else if(next.state==='redundant')reject(new Error('Worker installation failed'));};
      next.addEventListener('statechange',check);check();
    },{once:true}));
    await reg.update();await activated;
  });
  await page.waitForFunction(async()=>{const keys=await caches.keys();return keys.includes('padel-toss-americano-v242')&&!keys.includes('padel-toss-americano-v230');});
  assert.equal(await page.evaluate(()=>localStorage.getItem('visual-upgrade-check')),'keep-this-session');
  console.log('Illustrated home: existing-client cache upgrade preserved local storage.');
  const shell=await page.evaluate(async()=>{const c=await caches.open('padel-toss-americano-v242');return (await c.keys()).map(r=>new URL(r.url).pathname);});
  console.log('Updated offline cache paths:',JSON.stringify(shell));
  for(const file of ['visual-theme.css','assets/mode-toss.svg','assets/mode-koc.svg','assets/mode-americano.svg','assets/mode-split.svg'])assert.ok(shell.includes('/'+file),file+' is ready before client takeover');
  await ctx.setOffline(true);
  await page.reload({waitUntil:'domcontentloaded'});
  if(await page.locator('#resumeContinue').isVisible())await page.locator('#resumeContinue').click();
  if(!await page.locator('#panel0').isVisible())await page.locator('#mastheadBack').click();
  await page.waitForFunction(()=>[...document.querySelectorAll('.mode-illustration')].every(img=>img.complete&&img.naturalWidth>0));
  assert.equal(await page.locator('.format-btn').first().evaluate(el=>getComputedStyle(el).display),'grid','the illustrated stylesheet must work offline');
  assert.equal(await page.locator('#panel0').isVisible(),true);
  const offlineArtwork=await page.evaluate(async()=>(await fetch('./assets/mode-koc.svg')).text());
  assert.equal(offlineArtwork,kocArtwork);
  assert.doesNotMatch(offlineArtwork,/<text\b[^>]*>4<\/text>/);
  await page.locator('.format-btn[data-format="americano"]').click();
  await page.waitForFunction(()=>{const img=document.querySelector('#formatMark img');return img&&img.complete&&img.naturalWidth>0;});
  assert.equal(await page.locator('#brandEyebrow').isVisible(),true);
  await page.locator('[data-lang="en"]').click();
  await page.getByRole('button',{name:'Names',exact:true}).click();
  await page.locator('#generateBtn').click();
  assert.equal(await page.locator('#metaStrip').textContent(),'8 players · 2 courts · 7 rounds');
  assert.deepEqual(errors,[]);
  console.log('Illustrated home: offline artwork and selected-format header passed.');
});
