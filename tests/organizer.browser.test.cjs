const test=require('node:test');
const assert=require('node:assert/strict');
const {randomBytes}=require('node:crypto');
const http=require('node:http');
const {chromium}=require('playwright');

test('one central login reaches existing and new events, live schedules, and the inline roster on a phone', {timeout:90000},async t=>{
  let url=process.env.PADEL_SESSION_SITE_URL;
  const password=url?process.env.PADEL_TEST_ORGANIZER_PASSWORD:randomBytes(18).toString('hex');
  assert.ok(password);
  if(!url){
    const {localSessionApp}=await import('../sessions/local.mjs');
    const app=await localSessionApp(':memory:',password);t.after(()=>app.close());
    const server=http.createServer(async(req,res)=>{
      const result=await app.fetch(new Request(url+req.url,{method:req.method,headers:req.headers,
        body:['GET','HEAD'].includes(req.method)?null:req,duplex:'half'}));
      res.writeHead(result.status,Object.fromEntries(result.headers));res.end(Buffer.from(await result.arrayBuffer()));
    });
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));url='http://127.0.0.1:'+server.address().port;
    t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
  }
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE_PATH});t.after(()=>browser.close());
  const phone=await browser.newContext({viewport:{width:390,height:844},hasTouch:true}),guest=await browser.newContext();
  const host=await phone.newPage(), publicPage=await guest.newPage(), errors=[];
  host.setDefaultTimeout(7500);host.on('pageerror',err=>errors.push(err.message));
  const date=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Amsterdam'}).format(new Date());
  const title='Woensdag '+randomBytes(4).toString('hex');
  const settings={title,format:'koc',date,start:'21:00',end:'23:00',courts:2,capacity:8};
  const created=await guest.request.post(url+'/api/polls',{data:{settings,password:randomBytes(12).toString('hex')}});
  assert.equal(created.status(),201);const {id}=await created.json();
  async function footerButton(page,name='Beheer'){
    const button=page.locator('footer').getByRole('link',{name,exact:true});
    await button.waitFor();
    const box=await button.boundingBox();
    assert.ok(box && box.width>=44 && box.height>=44,'the footer has a full touch target');
    assert.notEqual(await button.evaluate(el=>getComputedStyle(el).backgroundColor),'rgba(0, 0, 0, 0)');
    return button;
  }
  await host.goto(url);
  const homeButton=await footerButton(host);
  await homeButton.focus();await host.keyboard.press('Enter');
  await host.getByLabel('Beheerwachtwoord').fill(password);await host.getByRole('button',{name:'Inloggen'}).click();
  const event=host.getByRole('button',{name:new RegExp(title)});
  await event.focus();await host.keyboard.press('Enter');
  await host.getByRole('button',{name:'Speler toevoegen'}).click();
  await host.getByLabel('Naam',{exact:true}).fill('Mira');
  await host.getByRole('button',{name:'Opslaan',exact:true}).click();
  await host.locator('[data-place=in] li').filter({hasText:'Mira'}).waitFor();
  assert.equal(new URL(host.url()).searchParams.get('avond'),id);
  await event.filter({hasText:'1 / 8'}).waitFor();
  assert.match(await event.locator('img').getAttribute('src'),/mode-koc\.svg/);
  assert.ok(await host.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await publicPage.goto(url+'/aanmelden/'+id);await publicPage.locator('#groups').getByText('Mira').waitFor();
  const eventLink=publicPage.locator('footer').getByRole('link',{name:'Deze avond beheren'});
  assert.equal(await eventLink.getAttribute('href'),'/beheer/'+id);
  await (await footerButton(publicPage)).click();await publicPage.getByLabel('Beheerwachtwoord').waitFor();
  assert.equal(await publicPage.getByText('Mira').count(),0);
  assert.equal((await guest.request.get(url+'/api/polls/hub')).status(),401);
  const planner=await phone.newPage();
  planner.setDefaultTimeout(7500);
  planner.on('dialog',dialog=>dialog.accept());
  planner.on('pageerror',err=>errors.push(err.message));
  const players=['Ada','Bea','Cato','Daan','Elin','Fien','Gijs','Hugo'];
  for(const format of ['toss','koc']){
    const eventTitle='Poll '+format+' '+randomBytes(4).toString('hex');
    await planner.goto(url+'/beheer');
    await planner.getByRole('link',{name:'Nieuwe avond'}).click();
    await planner.getByLabel('Speelvorm',{exact:true}).selectOption(format);
    await planner.getByLabel('Naam van de avond').fill(eventTitle);
    await planner.getByLabel('Banen',{exact:true}).fill('2');
    await planner.getByLabel('Plekken',{exact:true}).fill('8');
    await planner.getByRole('button',{name:'Aanmelding openen'}).click();
    await planner.getByRole('button',{name:'Ga indelen'}).waitFor();
    const pollId=new URL(planner.url()).searchParams.get('avond');
    assert.match(pollId,/^[a-f0-9]{14}$/);
    const signupUrl=url+'/aanmelden/'+pollId;
    for(const name of ['Nora Reserve',...players,'Ivo Wachtlijst']){
      const response=await guest.request.post(url+'/api/polls/'+pollId,{
        headers:{'X-Signup-Key':randomBytes(32).toString('hex')},
        data:{name,answer:name==='Nora Reserve'?'reserve':'yes'}
      });
      assert.equal(response.status(),200);
    }
    await planner.goto(url+'/beheer');
    await planner.getByRole('button',{name:new RegExp(eventTitle)}).click();
    await planner.locator('[data-place=reserve]').getByRole('button',{name:'Wijzig Nora Reserve',exact:true}).waitFor();
    await planner.locator('[data-place=wait]').getByRole('button',{name:'Wijzig Ivo Wachtlijst',exact:true}).waitFor();
    await planner.getByRole('button',{name:'Ga indelen'}).click();
    await planner.getByText('Bevestigde deelnemers overgenomen.',{exact:true}).waitFor();
    const roster=planner.locator(format==='koc'?'#kocRoster input[type=text]':'#namesGrid .name-field input');
    assert.deepEqual(await roster.evaluateAll(fields=>fields.map(field=>field.value).filter(Boolean)),players);
    await publicPage.goto(signupUrl);
    await publicPage.getByText('De indeling wordt gemaakt').waitFor();
    assert.equal(await publicPage.locator('#groups').count(),0);
    await planner.locator(format==='koc'?'#kocRoll':'#generateBtn').click();
    await planner.getByRole('button',{name:'Publiceer op de aanmeldlink'}).click();
    await planner.getByText('Het speelschema staat op de groepslink.').waitFor();
    await publicPage.goto(signupUrl);
    await publicPage.getByRole('link',{name:'Bekijk de baanindeling'}).click();
    await publicPage.locator('#rounds article').first().waitFor();
    const courts=await publicPage.locator('#rounds').innerText();
    for(const name of players)assert.ok(courts.includes(name),name);
    assert.doesNotMatch(courts,/Nora Reserve|Ivo Wachtlijst/);
    if(format==='koc'){
      const viewCode=new URL(publicPage.url()).pathname.split('/').pop();
      await planner.goto(url+'/beheer?avond='+pollId);
      const remove=planner.getByRole('button',{name:'Avond verwijderen',exact:true});
      await remove.tap();
      const confirmation=planner.getByRole('dialog',{name:'Avond verwijderen?'});
      await confirmation.getByText(eventTitle,{exact:false}).waitFor();
      assert.match(await confirmation.innerText(),/aanmeldlink vervalt/);
      assert.match(await confirmation.innerText(),/gepubliceerde speelschema/);
      assert.equal(await planner.evaluate(()=>document.activeElement.textContent),'Annuleren');
      await confirmation.getByRole('button',{name:'Annuleren'}).tap();
      assert.equal((await guest.request.get(url+'/api/s/'+viewCode)).status(),200);
      await remove.focus();await planner.keyboard.press('Enter');await planner.keyboard.press('Escape');
      assert.equal(await confirmation.isVisible(),false);
      await remove.tap();
      await confirmation.getByRole('button',{name:'Ja, verwijderen'}).tap();
      await planner.getByText('Avond verwijderd.',{exact:true}).waitFor();
      assert.equal(new URL(planner.url()).searchParams.has('avond'),false);
      assert.equal(await planner.getByRole('button',{name:new RegExp(eventTitle)}).count(),0);
      assert.equal((await guest.request.get(url+'/api/s/'+viewCode)).status(),404);
      await publicPage.goto(signupUrl);
      await publicPage.getByText(/Deze avond is niet meer beschikbaar/).waitFor();
      assert.equal(await publicPage.getByRole('link',{name:'Bekijk de baanindeling'}).count(),0);
    }
  }
  await planner.close();
  await host.getByRole('button',{name:'Herhaal volgende week'}).click();
  await host.waitForFunction(old=>new URL(location.href).searchParams.get('avond')!==old,id);
  await host.getByRole('button',{name:'Speler toevoegen'}).waitFor();assert.equal(await host.locator('#groups li').count(),0);
  await host.getByRole('link',{name:'Nieuwe avond'}).click();
  assert.equal(await host.getByLabel('Kies een beheercode om deze poll later te openen',{exact:true}).count(),0);
  const title2='Donderdag '+randomBytes(4).toString('hex');
  await host.getByLabel('Naam van de avond').fill(title2);await host.getByRole('button',{name:'Aanmelding openen'}).click();
  await host.getByRole('button',{name:'Speler toevoegen'}).waitFor();
  assert.equal(new URL(host.url()).pathname,'/beheer');
  await host.locator('#language').click();await host.getByRole('button',{name:'Add a player'}).waitFor();
  // Each standalone planner is opened with the central cookie, never a copied owner key.
  const names=['A','B','C','D','E','F','G','H'];
  const plan={state:{format:'toss',activeRoster:names,activeRosterLevels:[],scores:{},laterAdditions:{},pools:[{id:'main',players:names,rounds:[]}]},
    view:{title:'Los '+id,en:false,rounds:[{n:1,rows:[]}],boards:[],playerIds:Object.fromEntries(names.map((n,i)=>[n,'p'+i]))}};
  const shared=await guest.request.post(url+'/api/sessions',{data:{...plan,playDate:date}});assert.equal(shared.status(),201);
  const viewerCode=(await shared.json()).links[0].code;
  await host.reload();const standalone=host.locator('.hub-session').filter({hasText:'Los '+id});
  await standalone.getByRole('link',{name:'Open live view'}).waitFor();
  assert.equal(await standalone.locator('..').getByRole('heading',{level:2}).innerText(),'Today');
  const plannerPath=await standalone.getByRole('link',{name:'Open planner'}).getAttribute('href');
  assert.match(plannerPath,/^\/beheer\/sessie\/[a-f0-9-]{36}$/);
  assert.equal((await guest.request.get(url+'/api/manage/'+plannerPath.split('/').pop())).status(),401);
  await publicPage.goto(url+'/s/'+viewerCode);
  assert.equal(await (await footerButton(publicPage)).getAttribute('href'),'/beheer');
  assert.equal(await (await footerButton(host,'Organizer')).getAttribute('href'),'/beheer?lang=en');
  const removeSchedule=standalone.getByRole('button',{name:'Delete schedule',exact:true});
  await removeSchedule.tap();
  const confirmation=host.getByRole('dialog',{name:'Delete schedule?'});
  await confirmation.getByText('Los '+id,{exact:false}).waitFor();
  await confirmation.getByRole('button',{name:'Cancel'}).tap();
  assert.equal((await guest.request.get(url+'/api/s/'+viewerCode)).status(),200);
  await removeSchedule.tap();
  await confirmation.getByRole('button',{name:'Yes, delete'}).tap();
  await host.getByText('Schedule deleted.',{exact:true}).waitFor();
  await host.reload();await host.getByRole('button',{name:'Sign out'}).waitFor();
  assert.equal(await standalone.count(),0);
  assert.equal((await guest.request.get(url+'/api/s/'+viewerCode)).status(),404);
  await host.getByRole('button',{name:'Sign out'}).click();await host.getByLabel('Organizer password').waitFor();
  assert.equal(await host.locator('.hub-row,.hub-session').count(),0);
  await host.reload();await host.getByLabel('Organizer password').waitFor();
  assert.equal((await phone.request.get(url+'/api/polls/'+id+'/admin')).status(),401);
  assert.deepEqual(errors,[]);
});
