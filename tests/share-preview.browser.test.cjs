const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const http=require('node:http');
const path=require('node:path');
const {chromium}=require('playwright');

// Existing 3.0 spectator links still accept signed snapshots after the planner moves.
test('A legacy viewer opens the shared draw, follows a signed score and caches the final result',async t=>{
  const root=path.join(__dirname,'..');
  const server=http.createServer((req,res)=>{
    const file=path.basename(new URL(req.url,'http://localhost').pathname);
    if(!['kijken.html','share-v3.js','poll-common.js','name-hint.js'].includes(file))return res.writeHead(404).end();
    res.writeHead(200,{'Content-Type':file.endsWith('.html')?'text/html':'text/javascript'}).end(fs.readFileSync(path.join(root,file)));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>(server.closeAllConnections(),server.close(resolve))));
  const browser=await chromium.launch();t.after(()=>browser.close());
  const sender=await browser.newPage(),viewer=await browser.newPage({viewport:{width:390,height:844},hasTouch:true});
  const base='http://127.0.0.1:'+server.address().port+'/kijken.html';
  await sender.goto(base);
  const url=await sender.evaluate(async()=>{
    window.fixture={title:'Americano',format:'americano',at:10,rounds:[{n:1,rows:[
      {label:'Baan 1',teams:[['Speler 1','Speler 2'],['Speler 3','Speler 4']]},
      {label:'Rust',rest:true,teams:[['Speler 5']]}
    ]}],boards:[{title:'Klassement',unit:'Punten',rows:[[1,'Speler 1',0]]}]};
    window.session=await TossShare.create(window.fixture);
    return TossShare.link(window.session);
  });
  await viewer.addInitScript(()=>{window.EventSource=class extends EventTarget{constructor(){super();window.testStream=this;}close(){}};});
  let envelope;
  await sender.route('https://ntfy.sh/**',async route=>{
    envelope={event:'message',topic:new URL(route.request().url()).pathname.slice(1),message:route.request().postData()};
    await route.fulfill({status:200,body:'{}'});
  });
  await viewer.goto(url);
  await viewer.locator('#rounds article').first().waitFor();
  assert.equal(await viewer.locator('#rounds input, #rounds button:not(.person)').count(),0);
  await viewer.locator('.board').getByRole('button',{name:'Speler 1',exact:true}).click();
  assert.equal(await viewer.locator('#player').inputValue(),'Speler 1');
  assert.equal(await viewer.locator('#rounds article').count(),1);
  await viewer.locator('#everyone').click();
  for(const closed of [false,true]){
    await sender.evaluate(async closed=>{
      const snapshot=structuredClone(window.fixture);
      snapshot.rounds[0].rows[0].score=closed?[24,16]:[13,8];snapshot.at=closed?30:20;snapshot.closed=closed;
      await TossShare.send(window.session,snapshot);
    },closed);
    await viewer.evaluate(message=>window.testStream.dispatchEvent(new MessageEvent('message',{data:JSON.stringify(message)})),envelope);
    await viewer.getByText(closed?'24–16':'13–8',{exact:true}).first().waitFor({state:'attached'});
  }
  await viewer.locator('#connection.closed').waitFor();
  await viewer.reload();await viewer.locator('#connection.closed').waitFor();
  assert.ok(await viewer.getByText('24–16',{exact:true}).count());
  assert.equal(await viewer.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
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
