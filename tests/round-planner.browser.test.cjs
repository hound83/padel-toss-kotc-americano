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
  await koc.locator('#kocRoundSettingsVariant').selectOption('planner');
  const pairing=koc.locator('#kocRoundSettingsPairing');
  assert.equal(await pairing.inputValue(),'balanced');
  await pairing.selectOption('crossed');
  assert.match(await koc.locator('#kocRoundSettings .round-option-note').innerText(),/precies twee spelers/);
  assert.equal(await koc.locator('#roundSettingsScore').isVisible(),false);
  await koc.locator('#kocWaitingToggle').check();
  await koc.locator('#kocEntryToggle').check();
  const marks=koc.locator('#kocRoster .koc-entry-marker input');
  await marks.nth(0).uncheck();
  await marks.nth(1).uncheck();
  await marks.nth(2).check();
  await marks.nth(3).check();
  await koc.locator('#kocRoundSettingsEnabled').check();
  await koc.locator('#kocRoundSettingsPlay').fill('10');
  await koc.locator('#kocRoundSettingsBreak').fill('2');
  await koc.locator('#kocRoundSettingsBreak').press('Tab');
  await koc.locator('#panelKoc [data-round-rules] summary').tap();
  const serve=await koc.locator('#panelKoc [data-round-rules] ol li').allTextContents();
  assert.equal(serve.length,4);
  assert.match(serve[0],/Spaanse toss heeft gewonnen/);
  assert.match(serve[2],/Spaanse toss heeft gewonnen/);
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
  assert.equal(await koc.locator('.live-head #liveRoundClock').count(),1);
  assert.ok((await liveClock.boundingBox()).y>(await koc.locator('#liveSubtitle').boundingBox()).y);
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
  assert.equal(await pairing.inputValue(),'crossed');

  assert.equal(await duration.inputValue(),'00:01');
  assert.equal(await clock.locator('[data-clock-action=start]').isVisible(),true);

  const savedTeams=await readTeams();
  await koc.evaluate(()=>{
    const key='padel-toss-americano-session-v2';
    const save=JSON.parse(localStorage.getItem(key));
    delete save.state.koc.crossed;
    localStorage.setItem(key,JSON.stringify(save));
  });
  await koc.reload();
  await koc.locator('#resumeContinue').tap();
  assert.equal(await pairing.inputValue(),'balanced');
  assert.deepEqual(await readTeams(),savedTeams);

  const desktop=await open('koc');
  await desktop.locator('#kocRoundSettingsEnabled').check();
  await desktop.locator('#kocRoll').click();
  const regularClock=desktop.locator('#panelKoc [data-round-clock]');
  const result=desktop.locator('#kocResult');
  const regularBox=await regularClock.boundingBox();
  const resultBox=await result.boundingBox();
  assert.ok(regularBox.width<resultBox.width*.6);
  assert.ok(Math.abs(regularBox.x+regularBox.width-resultBox.x-resultBox.width)<2);
  await desktop.locator('#kocPresent').click();
  const head=desktop.locator('.live-head');
  const presentationClock=head.locator('#liveRoundClock');
  const title=await head.locator('#liveTitle').boundingBox();
  const clockBox=await presentationClock.boundingBox();
  assert.ok(clockBox.x>title.x+title.width);
  assert.ok((await desktop.locator('#liveKoc').boundingBox()).y<260);
  assert.ok(await presentationClock.locator('input').evaluate(el=>parseFloat(getComputedStyle(el).fontSize)>=50));
  if(process.env.PADEL_SCREENSHOT_DIR){
    await desktop.locator('#livePresentation').screenshot({
      path:path.join(process.env.PADEL_SCREENSHOT_DIR,'koc-presentation-clock.png')
    });
  }

  const toss=await open('toss');
  await toss.locator('#roundSettingsScore').selectOption('games');
  await toss.locator('#continueTo2').click();
  await toss.locator('#generateBtn').click();
  assert.equal(await toss.locator('#roundsCol input').count(),0);
  assert.equal(await toss.locator('#playcountPanel').isVisible(),false);
  await toss.locator('#playcountToggleBtn').click();
  assert.match(await toss.locator('#playcountPanel').innerText(),/opeenvolgende rustbeurten/);
  assert.match(await toss.locator('#playcountPanel').innerText(),/Duo’s die vaker samen spelen/);
  await toss.locator('#panel3 [data-round-rules] summary').click();
  assert.match(await toss.locator('#panel3 [data-round-rules]').innerText(),/15, 30 en 40/);

  const americano=await open('americano');
  await americano.locator('#roundSettingsScore').selectOption('games');
  await americano.locator('#continueTo2').click();
  await americano.locator('#generateBtn').click();
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
  await split.locator('#roundSettingsScore').selectOption('games');
  await split.locator('#continueTo2').click();
  await split.locator('#beginnerResultsToggle').check();
  await split.locator('#generateBtn').click();
  assert.match(await split.locator('#scheduleScoreUnit').innerText(),/gewonnen games/);
  assert.ok(await split.locator('#scheduleRound1 input[data-key^=beginner]').count()>0);
  assert.equal(await split.locator('#scheduleRound1 input[data-key^=ervaren]').count(),0);
});
