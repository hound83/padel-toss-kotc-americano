const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const http=require('node:http');
const path=require('node:path');
const {chromium}=require('playwright');

test('Stable layout and isolated preview share one organizer-signed schedule across devices',async t=>{
  const root=path.join(__dirname,'..');
  const server=http.createServer((req,res)=>{
    const pathname=new URL(req.url,'http://localhost').pathname;
    const file=path.join(root,pathname==='/'?'index.html':pathname);
    if(!fs.existsSync(file))return res.writeHead(404).end();
    const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'};
    res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'}).end(fs.readFileSync(file));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>(server.closeAllConnections(),server.close(resolve))));
  const browser=await chromium.launch();t.after(()=>browser.close());
  const host=await browser.newContext(),mobile=await browser.newContext({viewport:{width:390,height:844},hasTouch:true});
  const organizer=await host.newPage(),viewer=await mobile.newPage();
  const origin='http://127.0.0.1:'+server.address().port;
  await organizer.goto(origin);
  assert.equal(await organizer.locator('#appVersion').innerText(),'v2.8.0');
  await organizer.locator('.format-btn[data-format=toss]').click();await organizer.locator('#continueTo2').click();
  await organizer.locator('#generateBtn').click();
  await organizer.waitForTimeout(400);
  const old=await organizer.evaluate(()=>localStorage.getItem('padel-toss-americano-session-v2'));
  assert.ok(old);
  assert.deepEqual(await organizer.locator('#panel3 .schedule-actions > button:visible').allTextContents(),['Opnieuw loten','Presentatiemodus']);
  const menu=organizer.locator('#panel3 .action-menu');
  await menu.locator('summary').focus();
  await organizer.keyboard.press('Enter');
  assert.equal(await menu.locator('#pdfBtn').isVisible(),true);
  await organizer.keyboard.press('Escape');
  assert.equal(await menu.locator('#pdfBtn').isVisible(),false);
  assert.equal(await menu.locator('summary').evaluate(el=>el===document.activeElement),true);
  assert.equal(await organizer.getByRole('button',{name:'Schema delen'}).count(),0);
  await organizer.locator('#versionLink').click();
  assert.equal(await organizer.locator('#appVersion').innerText(),'v3.0.0-preview');
  await organizer.locator('.format-btn[data-format=americano]').click();
  await organizer.locator('#playerCountInput').fill('12');await organizer.locator('#continueTo2').click();
  await organizer.locator('#generateBtn').click();
  let payload,channel;
  const real=process.env.PADEL_REAL_RELAY==='1';
  if(!real) await organizer.route('https://ntfy.sh/**',async route=>{
    channel=new URL(route.request().url()).pathname.slice(1);payload=route.request().postData();
    await route.fulfill({status:200,body:'{}'});
  });
  await organizer.getByRole('button',{name:'Schema delen'}).last().click();
  await organizer.locator('#sharePublish').click();
  await organizer.waitForFunction(()=>document.querySelector('#shareUrl').value.length>0);
  const url=await organizer.locator('#shareUrl').inputValue();
  const errors=[];viewer.on('pageerror',err=>errors.push(err.message));
  // Browser transport is deterministic here. Production uses the same signed envelope over SSE.
  if(!real) await mobile.addInitScript(()=>{window.EventSource=class extends EventTarget{constructor(){super();window.testStream=this;}};});
  await viewer.goto(url,{waitUntil:'domcontentloaded'});
  await viewer.locator('#rounds article').first().waitFor();
  assert.equal(await viewer.locator('#rounds input, #rounds button:not(.person)').count(),0);
  await viewer.locator('#player').selectOption({index:1});
  assert.equal(await viewer.locator('#rounds section').first().locator('article').count(),1);
  await viewer.locator('#player').selectOption('');
  assert.ok(await viewer.locator('table').count());
  await organizer.locator('#shareClose').click();
  await organizer.locator('#scheduleRound2 input').first().fill('21');
  await organizer.locator('#scheduleRound2 input').nth(1).fill('17');
  await organizer.locator('.match-card input').first().fill('638');
  await organizer.locator('.match-card input').nth(1).fill('393');
  let score=false;
  for(let i=0;i<(real?160:30) && !score;i++){
    if(payload)await viewer.evaluate(({payload,channel})=>window.testStream.dispatchEvent(new MessageEvent('message',{data:JSON.stringify({event:'message',topic:channel,message:payload})})),{payload,channel});
    score=await viewer.getByText('638–393',{exact:true}).count()>0;
    if(!score)await viewer.waitForTimeout(150);
  }
  assert.ok(score,'another phone sees the new score on the original URL');
  assert.equal(await viewer.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.deepEqual(await organizer.evaluate(()=>JSON.parse(localStorage.getItem('padel-toss-americano-session-v2')).state),JSON.parse(old).state);
  const scored=viewer.locator('#rounds article').filter({has:viewer.locator('.score')}).first();
  const player=await scored.locator('.names .person').first().textContent();
  await scored.getByRole('button',{name:player,exact:true}).click();
  assert.equal(await viewer.locator('#player').inputValue(),player);
  await viewer.locator('#everyone').click();
  await viewer.locator('.board').getByRole('button',{name:player,exact:true}).click();
  assert.equal(await viewer.locator('#player').inputValue(),player);
  assert.equal(await scored.locator('.mine').first().textContent(),player);
  const rests=await viewer.locator('article.rest .names .person').allTextContents();
  assert.ok(rests.length>0);
  assert.ok(rests.every(name=>name===player));
  assert.ok(await viewer.locator('.vs').first().textContent()==='vs');
  assert.equal(await scored.locator('.score:visible').evaluate(el=>getComputedStyle(el).whiteSpace),'nowrap');
  const autosave=()=>organizer.evaluate(()=>JSON.parse(localStorage.getItem('padel-toss-session-v3-preview')).state);
  const original=await autosave();
  await organizer.locator('#stepsNav [data-step="2"]').click();
  const slot=Number(player.match(/\d+/)[0])-1;
  const nameInput=organizer.locator('#namesGrid input').nth(slot);
  assert.equal(await organizer.locator('#applySchedule2').isVisible(),false);
  await nameInput.fill('Verworpen naam');
  await organizer.locator('#cancelToScheduleBtn2').click();
  assert.deepEqual((await autosave()).pools,original.pools);
  await organizer.locator('#stepsNav [data-step="2"]').click();
  assert.equal(await nameInput.inputValue(),'');
  await nameInput.fill('Jan-Bart-Willem');
  await organizer.locator('#applySchedule2').click();
  const changed=await autosave();
  assert.deepEqual(changed.scores,original.scores);
  assert.deepEqual(changed.live,original.live);
  assert.equal(changed.previewChannel,original.previewChannel);
  assert.deepEqual(changed.pools,JSON.parse(JSON.stringify(original.pools,(key,value)=>value===player?'Jan-Bart-Willem':value)));
  for(let i=0;i<(real?160:40) && await viewer.locator('#player').inputValue()!== 'Jan-Bart-Willem';i++){
    if(payload)await viewer.evaluate(({payload,channel})=>window.testStream.dispatchEvent(new MessageEvent('message',{data:JSON.stringify({event:'message',topic:channel,message:payload})})),{payload,channel});
    await viewer.waitForTimeout(150);
  }
  assert.equal(await viewer.locator('#player').inputValue(),'Jan-Bart-Willem');
  assert.equal(await viewer.locator('.board .mine').innerText(),'Jan-Bart-Willem');
  await organizer.locator('#stepsNav [data-step="2"]').click();
  await organizer.locator('#roundsPlus').click();
  assert.equal(await organizer.locator('#applySchedule2').isVisible(),false);
  await organizer.locator('#generateBtn').click();
  assert.match(await organizer.locator('#confirmModalText').textContent(),/ingevulde score: 2/);
  await organizer.locator('#confirmCancelBtn').click();
  await organizer.locator('#cancelToScheduleBtn2').click();
  assert.deepEqual((await autosave()).scores,original.scores);
  await organizer.getByRole('button',{name:'Schema delen'}).last().click();
  organizer.once('dialog',dialog=>dialog.accept());
  await organizer.locator('#shareEnd').click();
  await organizer.waitForFunction(()=>document.querySelector('#shareEnd').hidden);
  if(!real)await viewer.evaluate(({payload,channel})=>window.testStream.dispatchEvent(new MessageEvent('message',{data:JSON.stringify({event:'message',topic:channel,message:payload})})),{payload,channel});
  await viewer.locator('#connection.closed').waitFor();
  assert.match(await viewer.locator('#connection').textContent(),/gesloten/);
  if(real){
    const lateViewer=await browser.newPage();
    await lateViewer.goto(url);
    await lateViewer.locator('#connection.closed').waitFor();
    assert.ok(await lateViewer.getByText('638–393',{exact:true}).count());
    await lateViewer.close();
  }
  await viewer.reload();
  await viewer.locator('#connection.closed').waitFor();
  assert.equal(await viewer.getByText('638–393',{exact:true}).count()>0,true);
  assert.deepEqual(errors,[]);
});

test('Viewer keeps both teams in place for small and large results',async t=>{
  const browser=await chromium.launch();
  t.after(()=>browser.close());
  const page=await browser.newPage();
  const root=path.join(__dirname,'..');
  await page.route('https://viewer.test/**',route=>{
    const pathname=new URL(route.request().url()).pathname;
    const file=path.join(pathname.startsWith('/assets/')?'assets':'',path.basename(pathname));
    return route.fulfill({path:path.join(root,file),contentType:file.endsWith('html')?'text/html':file.endsWith('js')?'text/javascript':'image/svg+xml'});
  });
  await page.goto('https://viewer.test/kijken.html');
  const url=await page.evaluate(async()=>{
    const teams=[['Jan-Bart-Willem','Marjolein'],['Alexander','Annabel']];
    const rounds=[null,[99,99],[969,350]].map((score,i)=>({n:i+1,rows:[{label:'Baan 1',teams,score}]}));
    return TossShare.link(await TossShare.create({title:'Toss',at:Date.now(),rounds,boards:[]}));
  });
  await page.goto('about:blank');
  await page.route('https://ntfy.sh/**',route=>route.abort());
  await page.goto(url);
  await page.locator('.match').first().waitFor();
  for(const width of [320,390,1280]){
    await page.setViewportSize({width,height:800});
    const columns=await page.locator('.match').evaluateAll(rows=>rows.map(row=>
      [...row.querySelectorAll('.names')].map(col=>[col.offsetWidth,col.getBoundingClientRect().x])));
    assert.deepEqual(columns[0],columns[1]);
    assert.deepEqual(columns[1],columns[2]);
    assert.equal(await page.locator('article').nth(1).locator('.head-score').isVisible(),width<500);
    assert.equal(await page.locator('article').nth(2).locator('.head-score').isVisible(),true);
  }
});
