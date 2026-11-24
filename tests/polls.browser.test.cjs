const test=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {randomBytes}=require('node:crypto');
const {chromium,webkit,devices}=require('playwright');

test('signup poll through the real planner, mobile visitor, password and live format artwork', {timeout:90000},async t=>{
  const {localSessionApp}=await import('../sessions/local.mjs');
  const app=await localSessionApp();t.after(()=>app.close());
  let url=process.env.PADEL_SESSION_SITE_URL;
  if(!url){
    const server=http.createServer(async(req,res)=>{
      const result=await app.fetch(new Request(url+req.url,{method:req.method,headers:req.headers,
        body:['GET','HEAD'].includes(req.method)?null:req,duplex:'half'}));
      res.writeHead(result.status,Object.fromEntries(result.headers));res.end(Buffer.from(await result.arrayBuffer()));
    });
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));url='http://127.0.0.1:'+server.address().port;
    t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
  }
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE_PATH});t.after(()=>browser.close());
  const safari=await webkit.launch();t.after(()=>safari.close());
  const owner=await browser.newContext(),phone=await browser.newContext(devices['Pixel 7']),other=await safari.newContext(devices['iPhone 13']);
  const errors=[];
  async function tab(context){
    const page=await context.newPage();page.setDefaultTimeout(7500);
    page.on('pageerror',err=>errors.push(err.message));
    return page;
  }
  const host=await tab(owner);
  let player=await tab(phone),visitor=await tab(other);
  const password=randomBytes(14).toString('hex'),ownerName='Werner '+randomBytes(4).toString('hex');
  await host.goto(url);await host.getByRole('link',{name:'Aanmeldpoll maken'}).click();
  await host.getByLabel('Speelvorm').selectOption('koc');await host.getByLabel('Naam van de avond').fill('Test KOC');
  await host.getByLabel('Banen',{exact:true}).fill('2');await host.getByLabel('Plekken',{exact:true}).fill('8');
  assert.equal(await host.getByLabel('Plekken',{exact:true}).inputValue(),'8');
  await host.getByLabel('Jouw naam',{exact:true}).fill(ownerName);
  await host.getByLabel('Wachtwoord',{exact:true}).fill(password);
  await host.getByRole('button',{name:'Nieuwe poll aanmaken',exact:true}).click();
  await host.getByRole('button',{name:'Ga indelen'}).waitFor();
  const id=new URL(host.url()).pathname.split('/').pop(),publicUrl=url+'/aanmelden/'+id;
  const remembered=await tab(owner);
  await remembered.goto(url);await remembered.getByRole('link',{name:'Mijn polls',exact:true}).click();
  await remembered.getByRole('heading',{name:ownerName,exact:true}).waitFor();
  await remembered.getByRole('link',{name:/Test KOC/}).focus();await remembered.keyboard.press('Enter');
  await remembered.getByRole('button',{name:'Ga indelen'}).waitFor();
  assert.equal(new URL(remembered.url()).pathname,'/beheer/'+id);
  await remembered.getByRole('link',{name:'Mijn polls',exact:true}).click();
  await remembered.getByRole('link',{name:'Nieuwe poll aanmaken'}).click();
  await remembered.getByText('Ingelogd als '+ownerName).waitFor();
  await remembered.getByLabel('Naam van de avond').fill('Extra eigen avond');
  await remembered.getByRole('button',{name:'Nieuwe poll aanmaken'}).click();
  await remembered.getByRole('button',{name:'Ga indelen'}).waitFor();
  await remembered.close();
  await player.goto(publicUrl);assert.equal(await player.locator('#listJump:visible').innerText(),'0 / 8 · Bekijk aanmeldingen');await player.getByLabel('Jouw naam').fill('Mila');await player.getByRole('button',{name:'Ja, ik doe mee'}).click();await player.getByText('Je staat bij Deelnemers.').waitFor();
  async function reopenSignup(previous,context,name,status,answer){
    await previous.close();
    const returning=await tab(context), writes=[];
    returning.on('request',req=>{if(req.method()==='POST')writes.push(req.url());});
    await returning.goto(publicUrl);await returning.getByText(status,{exact:true}).waitFor();
    assert.equal(await returning.getByLabel('Jouw naam').inputValue(),name);
    assert.equal(await returning.locator('[data-answer="'+answer+'"]').getAttribute('aria-pressed'),'true');
    assert.ok(await returning.getByRole('button',{name:'Mijn aanmelding intrekken'}).isVisible());
    assert.deepEqual(writes,[],'reopening must not submit another response or change queue order');
    return returning;
  }
  player=await reopenSignup(player,phone,'Mila','Je staat bij Deelnemers.','yes');
  await visitor.goto(publicUrl);await visitor.locator('#groups').getByText('Mila').waitFor();assert.equal(await visitor.getByRole('button',{name:'Mijn aanmelding intrekken'}).count(),0);
  await visitor.getByLabel('Jouw naam').fill('Mila');
  await visitor.getByRole('button',{name:'Ja, ik doe mee'}).click();
  await visitor.getByText(/Die naam staat al op de lijst/).waitFor();
  assert.equal(await visitor.getByRole('button',{name:'Mijn aanmelding intrekken'}).count(),0);
  await visitor.getByLabel('Jouw naam').fill('Testreserve');
  await visitor.getByRole('button',{name:'Alleen reserve',exact:true}).click();
  await visitor.getByText('Je staat bij Reserve.').waitFor();
  visitor=await reopenSignup(visitor,other,'Testreserve','Je staat bij Reserve.','reserve');
  visitor.on('dialog',d=>d.accept());
  await visitor.getByRole('button',{name:'Mijn aanmelding intrekken'}).click();await visitor.getByText('Je aanmelding is ingetrokken.').waitFor();
  assert.ok(await visitor.locator('#groups').getByText('Mila',{exact:true}).isVisible());
  assert.match(await player.locator('#art').getAttribute('src'),/mode-koc\.svg/);
  assert.ok(await player.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  for(let i=1;i<=7;i++){const res=await host.request.post(url+'/api/polls/'+id,{headers:{'X-Signup-Key':randomBytes(32).toString('hex')},data:{name:'Test '+i,answer:'yes'}});assert.equal(res.status(),200);}
  await host.reload();await host.getByRole('button',{name:'Wijzig Test 7',exact:true}).click();
  await host.getByLabel('Plek',{exact:true}).selectOption('2');await host.getByRole('button',{name:'Opslaan',exact:true}).click();
  await host.waitForFunction(()=>document.querySelector('[data-place=in] li:nth-child(2) .person')?.textContent.startsWith('Test 7'));
  const playing=host.locator('[data-place=in]');
  assert.equal(await playing.locator('.count').innerText(),'8 / 8');
  await playing.locator('li').filter({hasText:'Test 6'}).dragTo(host.locator('[data-place=reserve]'));
  await host.locator('[data-place=reserve] li').filter({hasText:'Test 6'}).waitFor();
  await host.getByRole('button',{name:'Wijzig Test 6',exact:true}).click();
  await host.getByLabel('Verplaats naar',{exact:true}).selectOption('in');
  await host.getByLabel('Plek',{exact:true}).selectOption('8');
  await host.getByRole('button',{name:'Opslaan',exact:true}).click();await playing.locator('li').filter({hasText:'Test 6'}).waitFor();
  if(process.env.PADEL_SCREENSHOT_DIR){
    const fs=require('node:fs/promises'),path=require('node:path');
    await fs.mkdir(process.env.PADEL_SCREENSHOT_DIR,{recursive:true});
    await host.screenshot({path:path.join(process.env.PADEL_SCREENSHOT_DIR,'poll-beheer-desktop.png'),fullPage:true});
    await player.reload();await player.locator('#groups').getByText('Test 6',{exact:true}).waitFor();
    await player.screenshot({path:path.join(process.env.PADEL_SCREENSHOT_DIR,'poll-aanmelden-mobiel.png'),fullPage:true});
  }
  const phoneOrganizer=await tab(phone);
  await phoneOrganizer.goto(publicUrl);
  await phoneOrganizer.getByRole('link',{name:'Deze avond beheren',exact:true}).tap();
  await phoneOrganizer.getByLabel('Beheercode van deze poll').fill(password);
  await phoneOrganizer.getByRole('button',{name:'Inloggen'}).tap();
  await phoneOrganizer.getByRole('button',{name:'Speler toevoegen'}).waitFor();
  assert.equal(new URL(phoneOrganizer.url()).pathname,'/beheer/'+id);
  await phoneOrganizer.close();
  await visitor.goto(url);await visitor.getByRole('link',{name:'Mijn polls',exact:true}).tap();
  assert.equal(await visitor.getByRole('link',{name:/Test KOC/}).count(),0);
  await visitor.getByLabel('Jouw naam',{exact:true}).fill(ownerName.toLowerCase());
  await visitor.getByLabel('Wachtwoord',{exact:true}).fill('onjuist-wachtwoord');
  await visitor.getByRole('button',{name:'Mijn polls openen'}).tap();
  await visitor.getByText(/Controleer je naam en wachtwoord/).waitFor();
  assert.equal(await visitor.getByText('Extra eigen avond').count(),0);
  await visitor.getByLabel('Wachtwoord',{exact:true}).fill(password);
  await visitor.getByRole('button',{name:'Mijn polls openen'}).tap();
  await visitor.getByRole('link',{name:/Extra eigen avond/}).waitFor();
  await visitor.getByRole('link',{name:/Test KOC/}).tap();
  await visitor.getByRole('button',{name:'Speler toevoegen'}).waitFor();
  host.on('dialog',d=>d.accept());await host.getByRole('button',{name:'Ga indelen'}).click();
  await host.locator('#kocRoll:visible').waitFor();await host.waitForFunction(()=>[...document.querySelectorAll('#kocRoster input')].some(i=>i.value==='Test 7'));
  await player.getByText('De indeling wordt gemaakt').waitFor({timeout:12000});
  assert.equal(await player.locator('#groups').count(),0);assert.equal(await player.getByLabel('Jouw naam').count(),0);
  await host.locator('#kocRoll').click();
  await host.setViewportSize({width:320,height:740});
  await host.locator('#kocPresent').click();
  assert.match(await host.locator('#liveArt').getAttribute('src'),/mode-koc\.svg/);
  const manager=await host.locator('#livePresentation .organizer-button').boundingBox();
  const exit=await host.locator('#presentExit').boundingBox();
  assert.ok(manager && exit && manager.height>=44 && manager.x+manager.width<=exit.x,'both live controls fit on a small phone');
  await host.locator('#presentExit').click();
  await host.waitForFunction(()=>!document.fullscreenElement);
  await host.setViewportSize({width:1280,height:720});
  await host.getByRole('button',{name:'Publiceer op de aanmeldlink'}).click();
  await player.getByRole('link',{name:'Bekijk de baanindeling'}).click({timeout:15000});
  await player.locator('#rounds article').first().waitFor();assert.match(await player.locator('#modeArt').getAttribute('src'),/mode-koc\.svg/);
  assert.ok((await player.locator('#rounds').innerText()).includes('Mila'));
  await visitor.reload();await visitor.getByRole('button',{name:'Herhaal volgende week'}).click();
  await visitor.getByRole('button',{name:'Ga indelen'}).waitFor();assert.notEqual(new URL(visitor.url()).pathname.split('/').pop(),id);
  assert.equal(await visitor.locator('#groups li').count(),0);
  for(const [format,asset] of [['toss','toss'],['americano','americano'],['splitToss','split']]){
    const settings={title:'Test '+format,format,capacity:8,courts:2,date:new Date().toISOString().slice(0,10),start:'11:00',end:'13:00'};
    const created=await host.request.post(url+'/api/polls',{data:{settings,password}});assert.equal(created.status(),201);
    const poll=await created.json(),api=url+'/api/polls/'+poll.id;
    for(let i=1;i<=8;i++)await host.request.post(api,{headers:{'X-Signup-Key':randomBytes(32).toString('hex')},data:{name:'Naam '+i,answer:'yes'}});
    await host.goto(url+'/beheer/'+poll.id);await host.getByLabel('Beheercode van deze poll').fill(password);await host.getByRole('button',{name:'Inloggen'}).click();
    if(format==='toss'){
      await host.getByRole('button',{name:'Toevoegen aan Mijn polls'}).click();
      const dlg=host.getByRole('dialog');
      await dlg.getByText('Ingelogd als '+ownerName).waitFor();
      await dlg.getByRole('button',{name:'Opslaan'}).click();
      await host.getByText('Toegevoegd aan Mijn polls.').waitFor();
    }
    await host.getByRole('button',{name:'Ga indelen'}).click();await host.locator('#generateBtn:visible').waitFor();
    assert.equal(await host.locator('#panel2 .name-field input:visible').count(),8);
    await host.locator('#generateBtn').click();await host.locator('#presentBtn').click();
    assert.match(await host.locator('#liveArt').getAttribute('src'),new RegExp('mode-'+asset+'\\.svg'));await host.locator('#presentExit').click();
    await host.getByRole('button',{name:'Publiceer op de aanmeldlink'}).click();await host.getByText('Het speelschema staat op de groepslink.').waitFor();
    await player.goto(url+'/aanmelden/'+poll.id);await player.getByRole('link',{name:'Bekijk de baanindeling'}).click();
    await player.locator('#rounds article').first().waitFor();assert.match(await player.locator('#modeArt').getAttribute('src'),new RegExp('mode-'+asset+'\\.svg'));
  }
  assert.deepEqual(errors,[]);
});
