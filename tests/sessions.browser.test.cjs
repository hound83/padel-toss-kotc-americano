const test=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {chromium}=require('playwright');

test('an organizer can close the laptop, players score, and the organizer continues in the full planner on a phone',async t=>{
  const {localSessionApp}=await import('../sessions/local.mjs');
  const app=await localSessionApp();t.after(()=>app.close());
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
  const browser=await chromium.launch();t.after(()=>browser.close());
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
  await organizer.goto(origin);assert.equal(await organizer.locator('#appVersion').innerText(),'v3.1.0-preview');
  await organizer.locator('.format-btn[data-format=americano]').click();
  await organizer.locator('#continueTo2').click();await organizer.locator('#generateBtn').click();
  await organizer.getByRole('button',{name:'Schema delen'}).last().click();
  await organizer.locator('#sharePublish').click();
  await organizer.locator('#ownerUrl:visible').waitFor();
  await organizer.locator('#entryMode').selectOption('group');
  await organizer.locator('#entryUrl:visible').waitFor();
  const viewLink=await organizer.locator('#shareUrl').inputValue(),entryLink=await organizer.locator('#entryUrl').inputValue();
  const ownerLink=await organizer.locator('#ownerUrl').inputValue();
  assert.match(new URL(entryLink).pathname,/^\/s\/[0-9A-Z]{4}-[0-9A-Z]{4}$/);
  assert.equal(new URL(entryLink).hash,'');assert.notEqual(viewLink,entryLink);
  await laptop.ctx.close();

  const watcher=await device(true),visitor=await device(true),player=visitor.page;
  await watcher.page.goto(viewLink);await watcher.page.locator('#rounds article').first().waitFor();
  await player.goto(entryLink.replace(/-([A-Z0-9]{4})$/,'$1').toLowerCase());
  const first=player.locator('article').first();const name=await first.locator('.person').first().textContent();
  await player.locator('#player').selectOption(name);
  await player.getByRole('button',{name:'Uitslag invullen'}).first().tap();
  await player.locator('#entryScore0').fill('21');await player.locator('#entryScore1').fill('17');
  await player.locator('#entrySend').tap();
  await player.getByText('Uitslag opgeslagen',{exact:false}).waitFor();
  await watcher.page.waitForFunction(()=>document.querySelector('#rounds').textContent.includes('21–17'));
  assert.equal(await watcher.page.getByRole('button',{name:'Uitslag invullen'}).count(),0);
  assert.ok(await watcher.page.locator('.board').textContent());

  const phone=await device(true),owner=phone.page;
  await owner.goto(ownerLink);
  await owner.locator('#panel3:visible .match-card input').first().waitFor();
  const input=owner.locator('.match-card input').first();
  assert.equal(await input.inputValue(),'21');
  await input.fill('22');await input.press('Tab');
  await watcher.page.waitForFunction(()=>document.querySelector('#rounds').textContent.includes('22–17'));
  await owner.route('**/api/manage',route=>route.abort('internetdisconnected'));
  await input.fill('23');await input.press('Tab');
  await owner.waitForFunction(()=>Object.keys(localStorage).some(k=>k.startsWith('padel-v31-pending-') && localStorage[k].includes('"t1":23')));
  await owner.reload();
  await owner.unroute('**/api/manage');await owner.evaluate(()=>dispatchEvent(new Event('online')));
  await watcher.page.waitForFunction(()=>document.querySelector('#rounds').textContent.includes('23–17'));
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
  owner.once('dialog',d=>d.accept());await owner.locator('#shareEnd').tap();
  await watcher.page.getByText(/gesloten.*eindstand/i).waitFor();
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
    await planner.locator('#sharePublish').click();await planner.locator('#ownerUrl:visible').waitFor();
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
