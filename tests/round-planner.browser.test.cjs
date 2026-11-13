const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {chromium}=require('playwright');

test('round planner, clock, rules and scoring options work in the browser',async t=>{
  const root=path.join(__dirname,'..');
  const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
  const server=http.createServer((req,res)=>{
    const request=new URL(req.url,'http://localhost').pathname;
    const file=path.resolve(root,'.'+(request==='/'?'/index.html':request));
    if(!file.startsWith(root+path.sep))return res.writeHead(403).end();
    try{res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'}).end(fs.readFileSync(file));}
    catch{return res.writeHead(404).end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>(server.closeAllConnections(),server.close(resolve))));
  const origin='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({headless:true});
  t.after(()=>browser.close());
  async function open(mode,mobile=false){
    const context=await browser.newContext(mobile?{viewport:{width:390,height:844},isMobile:true,hasTouch:true}:{});
    t.after(()=>context.close());
    const page=await context.newPage();
    await page.goto(origin);
    await page.locator('.format-btn[data-format="'+mode+'"]').click();
    return page;
  }
  const koc=await open('koc',true);
  await koc.locator('#kocCourtButtons [data-courts="2"]').tap();
  assert.equal(await koc.getByRole('radio',{name:'Startindeling'}).isChecked(),true);
  assert.equal(await koc.locator('#kocPairing-balanced').count(),0);
  await koc.locator('#kocVariant-planner-title').tap();
  assert.equal(await koc.locator('#kocPairing-balanced').isChecked(),true);
  const pairing=koc.locator('#kocPairing-crossed');
  await koc.locator('#kocPairing-crossed-title').tap();
  assert.equal(await pairing.isChecked(),true);
  assert.equal(await koc.locator('#roundSettingsScore').isVisible(),false);
  await koc.locator('#kocWaitingToggle').tap();
  const marks=koc.locator('#kocRoster .koc-entry-marker');
  await marks.nth(2).tap();
  await marks.nth(3).tap();
  assert.equal(await koc.locator('#kocRoundSettingsPlay').isVisible(),false);
  await koc.getByRole('switch',{name:'Rondeklok'}).check();
  assert.equal(await koc.locator('#kocRoundSettingsPlay').inputValue(),'20');
  assert.equal(await koc.locator('#kocRoundSettingsBreak').inputValue(),'0');
  await koc.locator('#kocRoundSettingsPlay').fill('10');
  await koc.locator('#kocRoundSettingsBreak').fill('2');
  await koc.locator('#kocRoundSettingsBreak').press('Tab');
  const setupRules=koc.locator('#playRules');
  assert.equal(await setupRules.locator('summary').textContent(),'Spelregels voor King of the Court met Rondeplanner');
  await setupRules.locator('summary').tap();
  const serve=await setupRules.locator('ol li').allTextContents();
  assert.equal(serve.length,4);
  assert.match(serve[0],/Spaanse toss won/);
  assert.match(serve[2],/Spaanse toss won/);
  await koc.locator('#kocRoll').tap();
  const clock=koc.locator('#panelKoc [data-round-clock]');
  const reading=clock.locator('output');
  const duration=clock.locator('input');
  assert.equal(await duration.inputValue(),'10:00');
  await duration.fill('08:20');
  await clock.locator('[data-clock-action=start]').tap();
  assert.equal(await clock.locator('[data-clock-action=pause]').isVisible(),true);
  await clock.locator('[data-clock-action=minus]').tap();
  assert.match(await reading.textContent(),/^07:1\d$|^07:20$/);
  await clock.locator('[data-clock-action=plus]').tap();
  assert.match(await reading.textContent(),/^08:1\d$|^08:20$/);
  await clock.locator('[data-clock-action=pause]').tap();
  await clock.locator('[data-clock-action=reset]').tap();
  assert.equal(await duration.inputValue(),'08:20');
  assert.equal(await clock.locator('[data-clock-action=start]').isVisible(),true);
  assert.equal(await clock.locator('[data-clock-action=pause]').isVisible(),false);
  const face=clock.locator('.round-clock-face');
  assert.ok((await face.boundingBox()).width>=145);
  await duration.fill('00:03');
  await clock.locator('[data-clock-action=start]').tap();
  await koc.waitForFunction(()=>{
    const clock=document.querySelector('#panelKoc [data-round-clock]');
    const progress=parseFloat(clock.style.getPropertyValue('--clock-remaining'));
    return progress>0&&progress<100;
  });
  await clock.locator('text=Tijd om').waitFor();
  assert.equal(await reading.textContent(),'00:00');
  assert.equal(await clock.evaluate(el=>el.style.getPropertyValue('--clock-remaining')),'0.000%');
  assert.equal(await clock.evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(163, 46, 61)');
  assert.equal(await clock.locator('[data-clock-action=start]').isVisible(),false);
  if(process.env.PADEL_SCREENSHOT_DIR){
    fs.mkdirSync(process.env.PADEL_SCREENSHOT_DIR,{recursive:true});
    await clock.screenshot({path:path.join(process.env.PADEL_SCREENSHOT_DIR,'round-clock-expired-mobile.png')});
  }
  await clock.locator('[data-clock-action=plus]').tap();
  assert.equal(await reading.textContent(),'01:00');
  assert.equal(await clock.locator('text=Tijd om').isVisible(),false);
  assert.equal(await clock.locator('[data-clock-action=pause]').isVisible(),false);
  await clock.locator('[data-clock-action=reset]').tap();
  assert.equal(await duration.inputValue(),'00:03');
  await clock.locator('[data-clock-action=phase]').tap();
  assert.equal(await duration.inputValue(),'02:00');
  await clock.locator('[data-clock-action=phase]').tap();

  const cards=koc.locator('#kocRoundCards');
  const teams=cards.locator('.koc-round-team ul');
  const readTeams=async()=>Promise.all((await teams.all()).map(team=>team.locator('li').allTextContents()));
  const firstTeams=await readTeams();
  for(const team of firstTeams.slice(-2)){
    assert.equal(team.filter(name=>['Speler 7','Speler 8'].includes(name)).length,1);
  }
  assert.deepEqual(await cards.locator('.koc-waiting-card li').allTextContents(),['Speler 9','Speler 10']);
  const expectedWaiting=await cards.locator('.koc-courts .koc-court').last().locator('.koc-round-team').nth(1).locator('li').allTextContents();
  for(const [key,value] of [['2:0','20'],['2:1','13'],['1:0','17'],['1:1','17']]){
    await cards.locator('[data-koc-round-score="'+key+'"]').fill(value);
  }
  assert.equal(await koc.locator('#kocRoundNext').isEnabled(),false);
  await cards.locator('[data-koc-round-score="1:0"]').fill('18');
  await koc.locator('#kocRoundNext').tap();
  assert.equal(await koc.locator('#kocRoundHeading').textContent(),'Ronde 2');
  assert.equal(await duration.inputValue(),'10:00');
  assert.equal(await clock.locator('[data-clock-action=start]').isVisible(),true);
  assert.deepEqual(await cards.locator('.koc-waiting-card li').allTextContents(),expectedWaiting);
  for(const team of await readTeams()){
    assert.ok(!firstTeams.some(previous=>team.every(name=>previous.includes(name))));
    assert.ok(!team.every(name=>['Speler 9','Speler 10'].includes(name)));
  }
  assert.ok((await cards.locator('.koc-courts .koc-court').last().locator('li').allTextContents()).includes('Speler 9'));
  assert.equal(await koc.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await koc.locator('#kocPresent').tap();
  assert.equal(await koc.locator('#liveSubtitle').textContent(),'Ronde 2');
  assert.equal(await koc.locator('#livePresentation [data-round-clock] input').inputValue(),'10:00');
  const liveClock=koc.locator('#livePresentation [data-round-clock]');
  const mobileHead=await koc.locator('.live-head').boundingBox();
  assert.ok((await liveClock.boundingBox()).y>=mobileHead.y+mobileHead.height);
  assert.ok((await liveClock.locator('.round-clock-face').boundingBox()).width>=150);
  await liveClock.locator('input').fill('00:01');
  await liveClock.locator('[data-clock-action=start]').tap();
  await liveClock.locator('text=Tijd om').waitFor();
  assert.equal(await liveClock.locator('output').textContent(),'00:00');
  await liveClock.locator('[data-clock-action=reset]').tap();
  await koc.locator('#presentExit').tap();
  await koc.evaluate(()=>navigator.serviceWorker.register('./sw.js'));
  await koc.waitForFunction(()=>!!navigator.serviceWorker.controller);
  await koc.context().setOffline(true);
  await koc.reload();
  await koc.locator('#resumeContinue').tap();
  assert.equal(await koc.locator('#kocRoundHeading').textContent(),'Ronde 2');
  assert.deepEqual(await cards.locator('.koc-waiting-card li').allTextContents(),expectedWaiting);
  assert.equal(await pairing.isChecked(),true);

  assert.equal(await duration.inputValue(),'00:01');
  assert.equal(await clock.locator('[data-clock-action=start]').isVisible(),true);

  const savedTeams=await readTeams();
  const legacySave=await koc.evaluate(()=>JSON.parse(localStorage.getItem('padel-toss-americano-session-v2')));
  delete legacySave.state.koc.crossed;
  legacySave.state.roundTimer=legacySave.state.koc.roundTimer;
  delete legacySave.state.koc.roundTimer;
  const legacyContext=await browser.newContext();
  t.after(()=>legacyContext.close());
  await legacyContext.addInitScript(save=>{
    localStorage.setItem('padel-toss-americano-session-v2',JSON.stringify(save));
  },legacySave);
  const legacy=await legacyContext.newPage();
  await legacy.goto(origin);
  await legacy.locator('#resumeContinue').click();
  assert.equal(await legacy.locator('#kocPairing-balanced').isChecked(),true);
  assert.equal(await legacy.locator('#kocRoundSettingsPlay').inputValue(),'10');
  const legacyTeams=await legacy.locator('#kocRoundCards .koc-round-team ul').all();
  assert.deepEqual(await Promise.all(legacyTeams.map(team=>team.locator('li').allTextContents())),savedTeams);

  const desktop=await open('koc');
  const choice=desktop.getByRole('radio',{name:'Startindeling'});
  await choice.focus();
  await choice.press('ArrowRight');
  assert.equal(await desktop.getByRole('radio',{name:'Rondeplanner'}).isChecked(),true);
  await desktop.getByRole('radio',{name:'Rondeplanner'}).press('ArrowLeft');
  assert.equal(await choice.isChecked(),true);
  const clockToggle=desktop.getByRole('switch',{name:'Rondeklok'});
  const rosterHeading=desktop.locator('.koc-roster-tools .sub-heading');
  const clockCard=desktop.locator('.koc-clock-card');
  await clockToggle.scrollIntoViewIfNeeded();
  const off=await Promise.all([clockToggle.boundingBox(),rosterHeading.boundingBox(),clockCard.boundingBox()]);
  const choiceCard=await desktop.locator('.koc-choice-card').last().boundingBox();
  assert.ok(off[2].x>=choiceCard.x+choiceCard.width);
  assert.equal(off[2].y,choiceCard.y);
  assert.equal(off[2].height,choiceCard.height);
  await clockToggle.press('Space');
  assert.deepEqual(await Promise.all([clockToggle.boundingBox(),rosterHeading.boundingBox(),clockCard.boundingBox()]),off);
  assert.equal(await desktop.locator('#kocRoundSettingsPlay').inputValue(),'20');
  const play=await desktop.locator('#kocRoundSettingsPlay').boundingBox();
  const change=await desktop.locator('#kocRoundSettingsBreak').boundingBox();
  assert.equal(play.y,change.y);
  assert.ok(change.x>play.x);
  if(process.env.PADEL_SCREENSHOT_DIR){
    await desktop.locator('#kocSetup').screenshot({path:path.join(process.env.PADEL_SCREENSHOT_DIR,'koc-setup-desktop.png')});
  }
  const playRules=desktop.locator('#playRules');
  const summary=playRules.locator('summary');
  await summary.scrollIntoViewIfNeeded();
  await summary.press('Enter');
  const beforeDraw=await playRules.evaluate(el=>({top:el.offsetTop,width:el.offsetWidth,height:el.offsetHeight}));
  await desktop.locator('#kocRoll').click();
  assert.equal(await playRules.getAttribute('open'),'');
  assert.deepEqual(await playRules.evaluate(el=>({top:el.offsetTop,width:el.offsetWidth,height:el.offsetHeight})),beforeDraw);
  const regularClock=desktop.locator('#panelKoc [data-round-clock]');
  const result=desktop.locator('#kocResult');
  const regularBox=await regularClock.boundingBox();
  const resultBox=await result.boundingBox();
  assert.ok(regularBox.width<resultBox.width*.6);
  assert.ok(Math.abs(regularBox.x+regularBox.width-resultBox.x-resultBox.width)<2);
  assert.equal(await desktop.locator('.round-rules').count(),1);
  assert.equal(await summary.textContent(),'Spelregels voor King of the Court');
  assert.ok(await playRules.evaluate(el=>el.offsetWidth===el.parentElement.clientWidth-2*parseFloat(getComputedStyle(el.parentElement).paddingLeft)));
  await desktop.locator('#kocPresent').click();
  const head=desktop.locator('.live-head');
  const presentationClock=desktop.locator('#liveRoundClock');
  const title=await head.locator('#liveTitle').boundingBox();
  const header=await head.boundingBox();
  const clockBox=await presentationClock.boundingBox();
  const courtsBox=await desktop.locator('#liveKoc').boundingBox();
  assert.ok(clockBox.y>=header.y+header.height);
  assert.ok(courtsBox.y>=clockBox.y+clockBox.height);
  assert.ok(Math.abs(clockBox.x+clockBox.width-header.x-header.width)<1);
  assert.ok(await presentationClock.locator('input').evaluate(el=>parseFloat(getComputedStyle(el).fontSize)>=50));
  if(process.env.PADEL_SCREENSHOT_DIR){
    await desktop.locator('#livePresentation').screenshot({
      path:path.join(process.env.PADEL_SCREENSHOT_DIR,'koc-presentation-clock.png')
    });
  }
  await desktop.locator('#presentExit').click();
  await clockToggle.press('Space');
  await desktop.locator('#kocPresent').click();
  assert.equal(await presentationClock.isVisible(),false);
  assert.deepEqual(await head.boundingBox(),header);
  assert.deepEqual(await head.locator('#liveTitle').boundingBox(),title);

  const toss=await open('toss');
  const tossRules=toss.locator('#playRules');
  assert.equal(await tossRules.locator('summary').textContent(),'Spelregels voor Toss');
  await tossRules.locator('summary').click();
  assert.match(await tossRules.innerText(),/gezelligheid en kennismaken/);
  assert.match(await tossRules.innerText(),/spreken zelf een telling af/);
  assert.match(await tossRules.innerText(),/15, 30 en 40/);
  assert.equal(await toss.locator('#roundSettingsScore').count(),0);
  await toss.locator('#roundSettingsEnabled').check();
  assert.equal(await toss.locator('#roundSettingsPlay').inputValue(),'12');
  await toss.locator('#continueTo2').click();
  assert.equal(await tossRules.getAttribute('open'),'');
  await toss.locator('#generateBtn').click();
  assert.equal(await toss.locator('#roundsCol input').count(),0);
  assert.equal(await toss.locator('#playcountPanel').isVisible(),false);
  await toss.locator('#playcountToggleBtn').click();
  assert.match(await toss.locator('#playcountPanel').innerText(),/opeenvolgende rustbeurten/);
  assert.match(await toss.locator('#playcountPanel').innerText(),/Duo’s die vaker samen spelen/);
  assert.equal(await tossRules.getAttribute('open'),'');

  const americano=await open('americano',true);
  const brand=await americano.locator('.brand').boundingBox();
  const language=await americano.locator('#langSwitch').boundingBox();
  assert.ok(language.y>=brand.y+brand.height);
  assert.ok((await americano.locator('#appTitle').boundingBox()).width>200);
  assert.equal(await americano.locator('#playRules summary').textContent(),'Spelregels voor Americano');
  await americano.locator('#roundSettingsScore').selectOption('games');
  await americano.locator('#continueTo2').click();
  await americano.locator('#generateBtn').click();
  assert.equal(await americano.locator('#playRules summary').textContent(),'Spelregels voor Americano');
  const gameScores=americano.locator('#scheduleRound1 input[data-key]');
  await gameScores.first().fill('4');
  await gameScores.nth(1).fill('3');
  assert.match(await gameScores.first().getAttribute('aria-label'),/^Games voor /);
  assert.match(await americano.locator('#boardCol thead').textContent(),/Games/);
  await americano.locator('#backToSettingsBtn').click();
  await americano.locator('#stepsNav [data-step="1"]').click();
  assert.equal(await americano.locator('#roundSettingsScore').isVisible(),true);
  assert.equal(await americano.locator('#roundSettingsScore').isEnabled(),false);

  const split=await open('splitToss');
  assert.equal(await split.locator('#playRules summary').textContent(),'Spelregels voor Gesplitste Toss');
  await split.locator('.lang-btn[data-lang="en"]').click();
  assert.equal(await split.locator('#playRules summary').textContent(),'How to play Split Toss');
  await split.locator('.lang-btn[data-lang="nl"]').click();
  await split.locator('#roundSettingsScore').selectOption('games');
  await split.locator('#continueTo2').click();
  await split.locator('#beginnerResultsToggle').check();
  await split.locator('#generateBtn').click();
  assert.match(await split.locator('#scheduleScoreUnit').innerText(),/gewonnen games/);
  assert.ok(await split.locator('#scheduleRound1 input[data-key^=beginner]').count()>0);
  assert.equal(await split.locator('#scheduleRound1 input[data-key^=ervaren]').count(),0);
});
