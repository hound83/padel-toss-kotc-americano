const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {chromium}=require('playwright');
test('Toss times and court numbers appear in schedule, print and presentation and survive storage',async t=>{
  const root=path.join(__dirname,'..');
  const mime={'.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
  const server=http.createServer((req,res)=>{
    const pathname=new URL(req.url,'http://localhost').pathname;
    const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
    if(!file.startsWith(root+path.sep))return res.writeHead(403).end();
    try{res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'}).end(fs.readFileSync(file));}
    catch{res.writeHead(404).end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>(server.closeAllConnections(),server.close(resolve))));
  const browser=await chromium.launch({headless:true});
  t.after(()=>browser.close());
  const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
  t.after(()=>context.close());
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port);
  await page.locator('[data-format=toss].format-btn').click();
  await page.locator('#continueTo2').click();
  const options=page.locator('#tossStartOptions');
  assert.equal(await options.getAttribute('open'),null);
  await options.locator('summary').click();
  assert.equal(await page.locator('#tossStartTime').inputValue(),'');
  assert.equal(await page.locator('#tossRoundMinutes').inputValue(),'20');
  await page.locator('#tossStartTime').fill('11:00');
  await page.locator('#tossCourtNumber0').fill('2');
  assert.equal(await page.locator('#generateBtn').isDisabled(),true);
  await page.locator('#tossCourtNumber1').fill('3');
  assert.equal(await page.locator('#generateBtn').isEnabled(),true);
  await page.locator('#tossRoundMinutes').fill('0');
  assert.equal(await page.locator('#generateBtn').isDisabled(),true);
  await page.locator('#tossRoundMinutes').fill('20');
  await page.locator('[data-lang=en]').click();
  assert.equal(await page.locator('label[for=tossStartTime]').textContent(),'Start time (optional)');
  await page.locator('[data-lang=nl]').click();
  assert.equal(await page.locator('#tossStartTime').inputValue(),'11:00');
  const positions=await Promise.all(['#tossStartTime','#tossRoundMinutes','#tossCourtNumber0'].map(selector=>page.locator(selector).boundingBox()));
  assert.ok(positions.every(box=>Math.abs(box.y-positions[0].y)<1));
  if(process.env.PADEL_SCREENSHOT_DIR){
    fs.mkdirSync(process.env.PADEL_SCREENSHOT_DIR,{recursive:true});
    await page.locator('#tossSessionSettings').screenshot({path:path.join(process.env.PADEL_SCREENSHOT_DIR,'toss-times-settings-desktop.png')});
  }
  for(const width of [320,820,390]){
    await page.setViewportSize({width,height:900});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  }
  if(process.env.PADEL_SCREENSHOT_DIR)await page.locator('#tossSessionSettings').screenshot({path:path.join(process.env.PADEL_SCREENSHOT_DIR,'toss-times-settings-mobile.png')});
  await page.locator('#generateBtn').click();
  assert.equal(await page.locator('#scheduleRound1 .round-time').innerText(),'11:00–11:20');
  assert.equal(await page.locator('#scheduleRound7 .round-time').innerText(),'13:00–13:20');
  assert.deepEqual(await page.locator('#scheduleRound1 .court-label').allTextContents(),['Baan 2','Baan 3']);
  async function save(){
    const downloaded=page.waitForEvent('download');
    await page.locator('#saveBtn').click();
    return JSON.parse(fs.readFileSync(await (await downloaded).path(),'utf8'));
  }
  const saved=await save();
  assert.deepEqual(saved.state.pools[0].rounds[0].courts.map(c=>c.courtIndex),[1,2]);
  await page.emulateMedia({media:'print'});
  assert.equal(await page.locator('#scheduleRound1 .round-time').isVisible(),true);
  assert.equal(await page.locator('#scheduleRound7 .round-time').isVisible(),true);
  assert.deepEqual(await page.locator('#scheduleRound1 .court-label').allTextContents(),['Baan 2','Baan 3']);
  if(process.env.PADEL_SCREENSHOT_DIR)await page.locator('#scheduleRound1').screenshot({path:path.join(process.env.PADEL_SCREENSHOT_DIR,'toss-times-print.png')});
  await page.emulateMedia({media:'screen'});
  await page.locator('#presentBtn').click();
  assert.match(await page.locator('#liveCurrent .live-section-head').innerText(),/11:00–11:20/);
  assert.deepEqual(await page.locator('#liveCurrent .live-match-head').allTextContents(),['Baan 2','Baan 3']);
  await page.locator('#presentExit').click();
  await page.reload();
  await page.locator('#resumeContinue').click();
  assert.equal(await page.locator('#scheduleRound1 .round-time').innerText(),'11:00–11:20');
  await page.locator('#backToSettingsBtn').click();
  if(!await options.getAttribute('open'))await options.locator('summary').click();
  await page.locator('#tossRoundMinutes').fill('15');
  await page.getByRole('button',{name:'Terug naar schema',exact:false}).last().click();
  assert.equal(await page.locator('#scheduleRound2 .round-time').innerText(),'11:15–11:30');
  assert.deepEqual((await save()).state.pools[0].rounds,saved.state.pools[0].rounds);
  await page.locator('#loadFileInput').setInputFiles({name:'plan.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(saved))});
  assert.equal(await page.locator('#scheduleRound2 .round-time').innerText(),'11:20–11:40');
  await page.locator('#backToSettingsBtn').click();
  if(!await options.getAttribute('open'))await options.locator('summary').click();
  await page.locator('#generateBtn').click();
  await page.locator('#confirmYesBtn').click();
  assert.equal(await page.locator('#scheduleRound1 .round-time').innerText(),'11:00–11:20');
  assert.deepEqual(await page.locator('#scheduleRound1 .court-label').allTextContents(),['Baan 2','Baan 3']);
  delete saved.state.tossPlan;
  await page.locator('#loadFileInput').setInputFiles({name:'older.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(saved))});
  assert.equal(await page.locator('#roundsCol .round-time').count(),0);
  assert.deepEqual(await page.locator('#scheduleRound1 .court-label').allTextContents(),['Baan 1','Baan 2']);
  assert.deepEqual(errors,[]);
});
