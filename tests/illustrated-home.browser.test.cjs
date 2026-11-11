const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {chromium}=require('playwright');

test('illustrated home: keyboard, all formats, EN/mobile, offline assets and existing-client upgrade',async t=>{
  const root=path.join(__dirname,'..');
  const worker=fs.readFileSync(path.join(root,'sw.js'),'utf8');
  let legacy=true;
  const mime={'.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
  const server=http.createServer((req,res)=>{
    const pathname=new URL(req.url,'http://localhost').pathname;
    const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
    if(!file.startsWith(root+path.sep))return res.writeHead(403).end();
    try{
      const body=pathname==='/sw.js'?(legacy?worker.replace('v230','v220'):worker):fs.readFileSync(file);
      res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'}).end(body);
    }catch{res.writeHead(404).end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH}:{})});
  t.after(()=>browser.close());
  const ctx=await browser.newContext({viewport:{width:1280,height:900}});
  t.after(()=>ctx.close());
  const page=await ctx.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const origin='http://127.0.0.1:'+server.address().port;
  await page.goto(origin);
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
  await page.waitForFunction(async()=>!!navigator.serviceWorker.controller&&(await caches.keys()).includes('padel-toss-americano-v220'));
  await page.evaluate(()=>localStorage.setItem('visual-upgrade-check','keep-this-session'));
  legacy=false;
  await page.evaluate(async()=>{const reg=await navigator.serviceWorker.getRegistration();await reg.update();});
  await page.waitForFunction(async()=>{const keys=await caches.keys();return keys.includes('padel-toss-americano-v230')&&!keys.includes('padel-toss-americano-v220');});
  assert.equal(await page.evaluate(()=>localStorage.getItem('visual-upgrade-check')),'keep-this-session');
  const shell=await page.evaluate(async()=>{const c=await caches.open('padel-toss-americano-v230');return (await c.keys()).map(r=>new URL(r.url).pathname);});
  for(const file of ['visual-theme.css','assets/mode-toss.svg','assets/mode-koc.svg','assets/mode-americano.svg','assets/mode-split.svg'])assert.ok(shell.includes('/'+file),file+' is cached');
  await ctx.setOffline(true);
  await page.reload();
  await page.waitForFunction(()=>[...document.querySelectorAll('.mode-illustration')].every(img=>img.complete&&img.naturalWidth>0));
  assert.equal(await page.locator('#panel0').isVisible(),true);
  await page.locator('.format-btn[data-format="americano"]').click();
  await page.waitForFunction(()=>{const img=document.querySelector('#formatMark img');return img&&img.complete&&img.naturalWidth>0;});
  assert.equal(await page.locator('#brandEyebrow').isVisible(),true);
  assert.deepEqual(errors,[]);
});
