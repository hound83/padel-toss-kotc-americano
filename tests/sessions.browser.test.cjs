const test=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {chromium}=require('playwright');

test('an organizer can close the laptop, players score, and the organizer continues in the full planner on a phone',async t=>{
  const {localSessionApp}=await import('../sessions/local.mjs');
  const centralPassword=process.env.PADEL_TEST_ORGANIZER_PASSWORD || require('node:crypto').randomBytes(18).toString('hex');
  const app=await localSessionApp(':memory:',centralPassword);t.after(()=>app.close());
  let origin=process.env.PADEL_SESSION_SITE_URL || 'https://club.test';
  const intercept=process.env.PADEL_SESSION_ROUTE_FIXTURE==='1';
  if(!intercept && !process.env.PADEL_SESSION_SITE_URL){
    const server=http.createServer(async(req,res)=>{
      const headers=new Headers(req.headers);
      const body=['GET','HEAD'].includes(req.method)?null:req;
      const response=await app.fetch(new Request(origin+req.url,{method:req.method,headers,body,duplex:'half'}));
      res.writeHead(response.status,Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
    });
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    origin='http://127.0.0.1:'+server.address().port;
    t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
  }
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE_PATH});t.after(()=>browser.close());
  const errors=[];
  async function device(mobile=false){
    const ctx=await browser.newContext({serviceWorkers:'block',...(mobile?{viewport:{width:390,height:844},hasTouch:true}:{})});
    if(intercept)await ctx.route(origin+'/**',async route=>{
      const req=route.request(),response=await app.fetch(new Request(req.url(),{method:req.method(),headers:req.headers(),body:req.postDataBuffer()}));
      const body=Buffer.from(await response.arrayBuffer());
      await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),...(body.length?{body}:{})});
    });
    const page=await ctx.newPage();page.setDefaultTimeout(7500);
    page.on('pageerror',err=>errors.push(err.message));
    return {page,ctx};
  }
  const laptop=await device(),organizer=laptop.page;
  await organizer.goto(origin);assert.equal(await organizer.locator('#appVersion').innerText(),'v3.4.1');
  await organizer.locator('.format-btn[data-format=americano]').click();
  await organizer.locator('#continueTo2').click();await organizer.locator('#generateBtn').click();
  await organizer.getByRole('button',{name:'Schema delen'}).last().click();
  const playDate=new Date(Date.now()+18*86400000).toISOString().slice(0,10);
  const creations=[];organizer.on('request',req=>{if(req.method()==='POST' && new URL(req.url()).pathname==='/api/sessions')creations.push(req);});
  const dateField=organizer.getByLabel('Speeldatum',{exact:true});
  assert.equal(await dateField.inputValue(),'');
  await organizer.getByRole('button',{name:'Inplannen en delen'}).click();
  assert.equal(await dateField.evaluate(input=>input.validity.valueMissing),true);
  assert.equal(await organizer.locator('#shareUrl').isVisible(),false);
  assert.equal(creations.length,0);
  await dateField.fill(playDate);await organizer.getByLabel('Jouw naam',{exact:true}).fill('Mara');await organizer.getByRole('button',{name:'Inplannen en delen'}).click();
  await organizer.locator('#ownerUrl:visible').waitFor();
  const organizerPoll=req=>req.method()==='GET' && new URL(req.url()).pathname==='/api/manage';
  await organizer.waitForResponse(res=>organizerPoll(res.request()) && res.status()===304);
  // The next poll starts only after the previous one finished updating the open dialog.
  await organizer.waitForRequest(organizerPoll);
  assert.ok(await organizer.locator('#entryMode').isEnabled(),'score entry stays available after an organizer poll');
  assert.ok(await organizer.locator('#shareEnd').isEnabled(),'ending the session stays available after an organizer poll');
  await organizer.locator('#entryMode').selectOption('group');
  await organizer.locator('#entryUrl:visible').waitFor();
  const viewLink=await organizer.locator('#shareUrl').inputValue(),entryLink=await organizer.locator('#entryUrl').inputValue();
  const ownerLink=await organizer.locator('#ownerUrl').inputValue();
  assert.match(new URL(entryLink).pathname,/^\/s\/[0-9A-Z]{4}-[0-9A-Z]{4}$/);
  assert.equal(new URL(entryLink).hash,'');assert.notEqual(viewLink,entryLink);
  const central=await device(true);
  await central.page.goto(origin+'/beheer');
  await central.page.getByLabel('Beheerwachtwoord').fill(centralPassword);
  await central.page.getByRole('button',{name:'Inloggen'}).click();
  const liveCode=new URL(viewLink).pathname.split('/').pop().replace('-','');
  const liveCard=central.page.locator('.hub-session').filter({has:central.page.locator('a[href="/s/'+liveCode+'"]')});
  await liveCard.waitFor();
  assert.equal(await liveCard.locator('..').getByRole('heading',{level:2}).innerText(),'Komende avonden');
  assert.equal(await liveCard.count(),1);
  assert.equal(creations.length,1);
  await liveCard.getByRole('link',{name:'Open planner'}).click();
  await central.page.locator('#panel3:visible .match-card input').first().waitFor();
  assert.match(new URL(central.page.url()).pathname,/^\/beheer\/sessie\//);
  await central.ctx.close();
  await laptop.ctx.close();

  const watcher=await device(true),visitor=await device(true),player=visitor.page;
  const watch=watcher.page;
  const isScoreRead=req=>req.method()==='GET' && new URL(req.url()).pathname.startsWith('/api/s/');
  let reads=0;
  watch.on('request',req=>{if(isScoreRead(req))reads++;});
  const start=new Date('2026-03-01T10:00:00Z');
  await watch.clock.install({time:start});
  await watch.clock.pauseAt(new Date(start.getTime()+1000));
  const nextRead=()=>watch.waitForResponse(response=>isScoreRead(response.request()));
  const setHidden=hidden=>watch.evaluate(value=>{
    Object.defineProperty(document,'hidden',{configurable:true,value});
    document.dispatchEvent(new Event('visibilitychange'));
  },hidden);
  await watch.goto(viewLink);await watch.locator('#rounds article').first().waitFor();
  assert.equal(reads,1);
  const dateText=new Date(playDate+'T12:00:00Z').toLocaleDateString('nl-NL',{weekday:'long',day:'numeric',month:'long',timeZone:'UTC'});
  assert.equal(await watch.locator('#playDate').innerText(),dateText);
  await player.goto(entryLink.replace(/-([A-Z0-9]{4})$/,'$1').toLowerCase());
  const first=player.locator('article').first();const name=await first.locator('.person').first().textContent();
  await player.locator('#player').selectOption(name);
  await player.getByRole('button',{name:'Uitslag invullen'}).first().tap();
  await player.locator('#entryScore0').fill('21');await player.locator('#entryScore1').fill('17');
  await player.locator('#entrySend').tap();
  await player.getByText('Uitslag opgeslagen',{exact:false}).waitFor();
  await watch.clock.runFor(29_999);
  assert.equal(reads,1);
  assert.equal((await watch.locator('#rounds').textContent()).includes('21–17'),false);
  await Promise.all([nextRead(),watch.clock.runFor(1)]);
  await watch.getByText('21–17',{exact:true}).first().waitFor();
  assert.equal(reads,2);
  assert.equal(await watcher.page.getByRole('button',{name:'Uitslag invullen'}).count(),0);
  assert.ok(await watcher.page.locator('.board').textContent());

  const phone=await device(true),owner=phone.page;
  await owner.goto(ownerLink);
  await owner.locator('#panel3:visible .match-card input').first().waitFor();
  const input=owner.locator('.match-card input').first();
  assert.equal(await input.inputValue(),'21');
  const saved=action=>owner.waitForResponse(response=>{
    const req=response.request();
    return new URL(req.url()).pathname==='/api/manage' && req.method()==='POST' &&
      req.postDataJSON().action===action && response.ok();
  });
  await setHidden(true);
  await Promise.all([saved('save'),(async()=>{await input.fill('22');await input.press('Tab');})()]);
  await watch.clock.fastForward(90_000);
  assert.equal(reads,2);
  await Promise.all([nextRead(),setHidden(false)]);
  await watch.getByText('22–17',{exact:true}).first().waitFor();
  assert.equal(reads,3);
  await owner.route('**/api/manage',route=>route.abort('internetdisconnected'));
  await input.fill('23');await input.press('Tab');
  await owner.waitForFunction(()=>Object.keys(localStorage).some(k=>k.startsWith('padel-v31-pending-') && localStorage[k].includes('"t1":23')));
  await owner.reload();
  const recovered=saved('save');
  await owner.unroute('**/api/manage');await owner.evaluate(()=>dispatchEvent(new Event('online')));
  await recovered;
  await Promise.all([nextRead(),watch.clock.fastForward(30_000)]);
  await watch.getByText('23–17',{exact:true}).first().waitFor();
  await owner.getByRole('button',{name:'Schema delen'}).last().tap();
  const controls=await owner.locator('#shareEnd,#shareClose').evaluateAll(nodes=>nodes.map(el=>{const r=el.getBoundingClientRect();return {top:r.top,bottom:r.bottom};}));
  assert.ok(controls[1].top-controls[0].bottom>=8);
  assert.equal(await owner.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await owner.locator('#entryMode').selectOption('personal');
  await owner.locator('#entryUrl:visible').waitFor();
  await owner.waitForFunction(old=>{const el=document.getElementById('entryUrl');return !!el.value && !el.hidden && el.value!==old;},entryLink);
  const personal=await owner.locator('#entryUrl').inputValue();
  assert.notEqual(personal,entryLink);
  const individual=await device(true);await individual.page.goto(personal);
  await individual.page.locator('#rounds article').first().waitFor();
  assert.equal(await individual.page.locator('#player').isDisabled(),true);
  assert.ok(await individual.page.locator('#player').inputValue());
  await player.reload();
  await player.getByText(/verlopen, ingetrokken of ongeldig/).waitFor();
  await owner.locator('#shareClose').tap();
  await owner.reload();await owner.locator('#panel3:visible').waitFor();
  assert.equal(await owner.locator('.match-card input').first().inputValue(),'23');
  await owner.getByRole('button',{name:'Schema delen'}).last().tap();
  owner.once('dialog',d=>d.accept());
  await Promise.all([saved('close'),owner.locator('#shareEnd').tap()]);
  await Promise.all([nextRead(),watch.clock.fastForward(30_000)]);
  await watch.getByText(/gesloten.*eindstand/i).waitFor();
  const finalReads=reads;
  await watch.clock.fastForward(60_000);
  assert.equal(reads,finalReads);
  assert.deepEqual(errors,[]);

  for(const [mode,guided,entry] of [['toss',false,false],['splitToss',false,true],['koc',false,false],['koc',true,true]]){
    const laptop=await device(),planner=laptop.page;await planner.goto(origin);
    await planner.locator('.format-btn[data-format="'+mode+'"]').click();
    if(mode==='koc'){
      await planner.locator('#kocCourtButtons [data-courts="2"]').click();
      if(guided)await planner.locator('#kocVariant-planner-title').click();
      await planner.locator('#kocRoll').click();
    }else{
      await planner.locator('#continueTo2').click();
      if(mode==='splitToss')await planner.locator('#beginnerResultsToggle').check({force:true});
      await planner.locator('#generateBtn').click();
    }
    await planner.getByRole('button',{name:'Schema delen'}).filter({visible:true}).click();
    assert.equal(await planner.getByLabel('Speeldatum').inputValue(),'');
    await planner.getByLabel('Speeldatum').fill(playDate);await planner.getByLabel('Jouw naam',{exact:true}).fill('Sam');
    await planner.getByRole('button',{name:'Inplannen en delen'}).click();await planner.locator('#ownerUrl:visible').waitFor();
    assert.equal(await planner.locator('#entryGroup').isVisible(),entry,mode);
    const handoff=await planner.locator('#ownerUrl').inputValue();
    const another=await device(true);await another.page.goto(handoff);
    await another.page.locator(mode==='koc'?'#panelKoc:visible':'#panel3:visible').waitFor();
    if(mode==='koc'){
      await another.page.locator('#panelKoc .action-menu summary').tap();
      await another.page.locator('#kocEditDetails').tap();
      await another.page.locator('#kocEditNames input').first().fill('Lena');
      await another.page.locator('#kocEditCourts input').first().fill('Centercourt');
      await another.page.locator('#kocEditForm button[type=submit]').tap();
      await another.page.locator('#kocEditDialog').waitFor({state:'hidden'});
      assert.ok((await another.page.locator('#panelKoc').textContent()).includes('Centercourt'));
      if(guided){
        const scores=another.page.locator('#panelKoc [data-koc-round-score]');
        for(let i=0;i<await scores.count();i++)await scores.nth(i).fill(i%2?'17':'21');
        await another.page.locator('#kocRoundNext').tap();
        await another.page.waitForFunction(()=>document.querySelector('#panelKoc').textContent.includes('Ronde 2'));
      }
    }
    await laptop.ctx.close();await another.ctx.close();
  }
  assert.deepEqual(errors,[]);
});
