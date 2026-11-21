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
  await organizer.locator('.format-btn[data-format=americano]').click();await organizer.locator('#continueTo2').click();
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
  assert.equal(await viewer.locator('#rounds input, #rounds button').count(),0);
  await viewer.locator('#player').selectOption({index:1});
  assert.equal(await viewer.locator('#rounds section').first().locator('article').count(),1);
  await viewer.locator('#player').selectOption('');
  assert.ok(await viewer.locator('table').count());
  await organizer.locator('#shareClose').click();
  await organizer.locator('.match-card input').first().fill('29');
  await organizer.locator('.match-card input').nth(1).fill('18');
  let score=false;
  for(let i=0;i<(real?160:30) && !score;i++){
    if(payload)await viewer.evaluate(({payload,channel})=>window.testStream.dispatchEvent(new MessageEvent('message',{data:JSON.stringify({event:'message',topic:channel,message:payload})})),{payload,channel});
    score=await viewer.getByText('29–18',{exact:true}).count()>0;
    if(!score)await viewer.waitForTimeout(150);
  }
  assert.ok(score,'another phone sees the new score on the original URL');
  assert.equal(await viewer.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.deepEqual(await organizer.evaluate(()=>JSON.parse(localStorage.getItem('padel-toss-americano-session-v2')).state),JSON.parse(old).state);
  assert.deepEqual(errors,[]);
});
