// End-to-end regression tests for the live match experience.
// node --test tests/live-presentation.browser.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const {chromium} = require('playwright');

test('v2.2: clean navigation and live KOC, Toss, Americano and split Toss', async t => {
  const root = path.join(__dirname,'..');
  const mime={'.html':'text/html','.css':'text/css','.js':'text/javascript','.webmanifest':'application/manifest+json',
    '.svg':'image/svg+xml','.png':'image/png'};
  const server=http.createServer((req,res)=>{
    const pathname=new URL(req.url,'http://127.0.0.1').pathname;
    const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
    if(!file.startsWith(root+path.sep))return res.writeHead(403).end();
    try{res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'})
      .end(fs.readFileSync(file));}catch(e){res.writeHead(404).end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>(server.closeAllConnections(), server.close(resolve))));
  const url='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({headless:true,
    ...(process.env.CHROMIUM_EXECUTABLE_PATH?
      {executablePath:process.env.CHROMIUM_EXECUTABLE_PATH}:{})});
  t.after(()=>browser.close());
  async function open(format,mobile=false){
    const ctx=await browser.newContext(mobile?
      {viewport:{width:390,height:844},isMobile:true,hasTouch:true}:{viewport:{width:1280,height:900}});
    t.after(()=>ctx.close());
    const page=await ctx.newPage();
    await page.goto(url);
    assert.equal(await page.locator('#panel0').isVisible(),true);
    await page.locator('.format-btn[data-format="'+format+'"]').click();
    assert.equal(await page.locator('#panel0').isVisible(),false,
      'four large format cards never remain visible after selection');
    assert.equal(await page.locator('#mastheadBack').isVisible(),true);
    assert.equal(await page.locator('#brandEyebrow').isVisible(),true);
    return page;
  }
  async function saveState(page,button='#saveBtn'){
    const event=page.waitForEvent('download');
    await page.locator(button).click();
    const download=await event;
    return JSON.parse(fs.readFileSync(await download.path(),'utf8')).state;
  }
  async function checkScheduleRound(page,round,max,jumped=false){
    assert.equal(await page.locator('#scheduleRoundLabel').innerText(),`Ronde ${round} / ${max}`);
    if(!jumped)return;
    await page.waitForFunction(n=>{
      const tools=document.getElementById('scheduleRoundTools').getBoundingClientRect();
      const block=document.getElementById('scheduleRound'+n);
      const marker=block.previousElementSibling;
      const target=marker?.classList.contains('phase-marker')?marker:block;
      const top=target.getBoundingClientRect().top;
      return tools.top>=-1&&top>=tools.bottom-1&&top<=tools.bottom+28;
    },round);
  }
  const firstNames=['Annemarieke','Maximiliaan','Christiaan','Sebastiaan','Alexander','Frederique',
    'Valentijn','Marjolein','Charlotte','Marianne','Willemijn','Benjamin','Jonathan','Isabelle','Sander','Noor',
    'Jeroen','Sophie','Marlies','Thomas','Daniel','Marieke','Joost','Nathalie','Lucas','Nina','Eva','Robin',
    'Floor','Stefan','Maud','David'];
  async function fillNames(page,count){
    const inputs=page.locator('#namesGrid .name-field input');
    assert.equal(await inputs.count(),count);
    for(const [index,name] of firstNames.slice(0,count).entries())await inputs.nth(index).fill(name);
  }
  async function checkNamesFit(names){
    const wrapped=await names.evaluateAll(elements=>elements.filter(el=>{
      const text=document.createRange();
      text.selectNodeContents(el);
      return text.getClientRects().length!==1||text.getBoundingClientRect().width>el.getBoundingClientRect().width+1;
    }).map(el=>el.textContent));
    assert.deepEqual(wrapped,[],'first names fit on one line');
  }
  async function checkLiveCourtRows(page,expected){
    for(const area of ['#liveCurrent','#liveUpcoming']){
      const rows=await page.locator(area+' .live-match').evaluateAll(cards=>{
        const counts=new Map();
        for(const card of cards){
          const top=card.getBoundingClientRect().top;
          counts.set(top,(counts.get(top)??0)+1);
        }
        return [...counts.values()];
      });
      assert.deepEqual(rows,expected,area+' court cards per row');
    }
  }
  async function checkScorePlacement(card,teamSelector,nameSelector,inline=false){
    const placement=await card.evaluate((match,{teamSelector,nameSelector,inline})=>
      [...match.querySelectorAll(teamSelector)].map((team,side)=>{
        const names=[...team.querySelectorAll(nameSelector)];
        const field=team.querySelector('input');
        const bounds=field.getBoundingClientRect();
        const lastName=names.at(-1).getBoundingClientRect();
        const edge=side===0?'left':'right';
        const nameBlock=inline?team.querySelector('.team-names').getBoundingClientRect():lastName;
        const beside=side===0?bounds.left>=nameBlock.right:bounds.right<=nameBlock.left;
        return {
          positioned:inline?beside&&bounds.top<nameBlock.bottom&&bounds.bottom>nameBlock.top:
            bounds.top>=lastName.bottom&&Math.abs(bounds[edge]-lastName[edge])<1,
          usable:bounds.width>=44&&bounds.height>=44,
          label:field.getAttribute('aria-label'),
          team:names.map(name=>name.textContent).join(' & ')
        };
      }),{teamSelector,nameSelector,inline});
    assert.equal(placement.length,2);
    for(const score of placement){
      assert.ok(score.positioned,inline?'each score box sits beside its team':'each score box sits below its team');
      assert.ok(score.usable,'score fields keep a 44px touch target');
      assert.equal(score.label,'Score voor '+score.team);
    }
  }

  const koc=await open('koc');
  assert.match(await koc.locator('#appTitle').innerText(),/KING OF THE COURT/);
  await koc.locator('#kocRoll').click();
  assert.equal(await koc.locator('#scheduleRoundTools').isVisible(),false);
  await koc.locator('#kocPresent').click();
  assert.equal(await koc.locator('#livePresentation').isVisible(),true);
  assert.equal(await koc.locator('#liveKoc .live-koc-card').count(),4);
  assert.equal(await koc.locator('#liveRoundTools').isVisible(),false);
  assert.equal(await koc.locator('#panel0').isVisible(),false);
  assert.equal(await koc.locator('#kocResult').isVisible(),false,
    'the old KOC screen is entirely hidden in presentation');
  assert.equal(await koc.locator('#liveKoc .crown').count(),1);
  await koc.locator('#presentExit').click();
  assert.equal(await koc.locator('#livePresentation').isVisible(),false);

  const toss=await open('toss');
  await toss.setViewportSize({width:1360,height:900});
  assert.equal((await toss.locator('#appTitle').innerText()).toUpperCase(),'TOSS');
  await toss.locator('#courtsSelect .court-btn[data-courts="4"]').click();
  const namesStep=toss.getByRole('button',{name:'Namen',exact:true});
  const scheduleStep=toss.getByRole('button',{name:'Schema',exact:true});
  assert.equal(await scheduleStep.isEnabled(),false);
  const playerCount=toss.locator('#playerCountInput');
  const defaultCount=await playerCount.inputValue();
  await playerCount.fill('2');
  assert.equal(await namesStep.isEnabled(),false);
  await playerCount.fill(defaultCount);
  await namesStep.press('Enter');
  assert.equal(await toss.locator('#panel0').isVisible(),false);
  assert.equal(await toss.locator('#panel2').isVisible(),true);
  assert.equal(await namesStep.getAttribute('aria-current'),'step');
  await fillNames(toss,32);
  await toss.locator('#generateBtn').click();
  assert.equal(await toss.locator('.brand-copy #metaStrip').textContent(),'32 spelers · 4 banen · 7 rondes');
  assert.equal(await scheduleStep.getAttribute('aria-current'),'step');
  await namesStep.click();
  await toss.waitForFunction(()=>document.activeElement.id==='appTitle');
  await scheduleStep.press('Enter');
  assert.equal(await toss.locator('#panel3').isVisible(),true);
  await checkScheduleRound(toss,1,7);
  assert.equal(await toss.locator('#schedulePrev').isEnabled(),false);
  assert.equal(await toss.locator('#scheduleAuto').isEnabled(),false);
  await toss.getByRole('button',{name:'Volgende ronde'}).press('Enter');
  await checkScheduleRound(toss,2,7,true);
  assert.equal(await toss.locator('.round-block').count(),7,'the full schedule stays available');
  await toss.locator('#schedulePrev').click();
  await checkScheduleRound(toss,1,7);
  await toss.locator('#presentBtn').click();
  assert.equal(await toss.locator('#liveCurrent .live-match').count(),4);
  assert.equal(await toss.locator('#liveUpcoming .live-match').count(),4);
  const roundLayout=await toss.locator('#liveLayout').evaluate(layout=>{
    const now=layout.querySelector('#liveCurrent');
    const next=layout.querySelector('#liveUpcoming');
    const first=now.querySelector('.live-match').getBoundingClientRect();
    const upcoming=next.querySelector('.live-match').getBoundingClientRect();
    return {
      currentWider:now.offsetWidth>next.offsetWidth,
      upcomingCompact:upcoming.width<first.width&&upcoming.height<first.height
    };
  });
  assert.deepEqual(roundLayout,{currentWider:true,upcomingCompact:true});
  await checkLiveCourtRows(toss,[2,2]);
  await checkNamesFit(toss.locator('#liveCurrent .live-team span, #liveUpcoming .live-team span'));
  const screenshotDir=process.env.PADEL_SCREENSHOT_DIR;
  if(screenshotDir){
    fs.mkdirSync(screenshotDir,{recursive:true});
    await toss.screenshot({path:path.join(screenshotDir,'presentation-four-courts.png')});
  }
  assert.equal(await toss.locator('#liveStandings .live-board').count(),0);
  assert.equal(await toss.locator('#liveAuto').isEnabled(),false);
  assert.match(await toss.locator('#liveRoundLabel').innerText(),/1\s*\/\s*7/);
  await toss.locator('#liveNext').click();
  assert.match(await toss.locator('#liveRoundLabel').innerText(),/2\s*\/\s*7/);
  await toss.locator('#liveAllRounds').click();
  assert.equal(await toss.locator('#panel3').isVisible(),true);
  await toss.waitForFunction(()=>!document.fullscreenElement);
  await checkScheduleRound(toss,2,7,true);
  await toss.locator('#scheduleNext').click();
  await checkScheduleRound(toss,3,7,true);
  await toss.setViewportSize({width:1060,height:900});
  await toss.locator('#presentBtn').click();
  assert.equal(await toss.locator('#liveRoundLabel').innerText(),'Ronde 3 / 7');
  await checkLiveCourtRows(toss,[1,1,1,1]);
  await checkNamesFit(toss.locator('#liveCurrent .live-team span, #liveUpcoming .live-team span'));
  if(screenshotDir)await toss.screenshot({path:path.join(screenshotDir,'presentation-four-courts-narrow.png')});
  await toss.locator('#presentExit').click();

  const split=await open('splitToss',true);
  await split.getByRole('button',{name:'Namen',exact:true}).tap();
  await split.locator('#generateBtn').click();
  assert.equal(await split.locator('#metaStrip').textContent(),'16 spelers (Zilver 8, Goud 8) · 2 banen · 7 rondes');
  assert.equal(await split.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false);
  await split.locator('#scheduleNext').tap();
  await checkScheduleRound(split,2,7,true);
  assert.equal(await split.locator('#scheduleAuto').isEnabled(),false);
  if(screenshotDir)await split.screenshot({path:path.join(screenshotDir,'mobile-schedule-round-navigation.png')});
  await split.locator('#presentBtn').click();
  assert.equal(await split.locator('#liveCurrent .live-match').count(),2);
  assert.equal(await split.locator('#liveStandings .live-board').count(),0);
  assert.equal(await split.locator('#liveCurrent .team-score input').count(),0);
  assert.equal(await split.locator('#liveAuto').isEnabled(),false,
    'without scores, split Toss uses manual progress');
  assert.match(await split.locator('#liveCurrent').innerText(),/Zilver/);
  assert.match(await split.locator('#liveCurrent').innerText(),/Goud/);
  await split.locator('#liveNext').click();
  assert.match(await split.locator('#liveRoundLabel').innerText(),/3\s*\/\s*7/);

  const splitMixed=await open('splitToss');
  await splitMixed.locator('#continueTo2').click();
  await splitMixed.locator('#beginnerResultsToggle').check();
  await splitMixed.locator('#generateBtn').click();
  const mixedFields=await splitMixed.locator('#scheduleRound1 .team-score input').all();
  assert.equal(mixedFields.length,2);
  await mixedFields[0].fill('11');
  await mixedFields[1].fill('5');
  await mixedFields[1].press('Tab');
  await checkScheduleRound(splitMixed,1,7);
  assert.equal(await splitMixed.locator('#scheduleAuto').isEnabled(),false,'a group without scores keeps round navigation manual');
  await splitMixed.locator('#scheduleNext').click();
  await checkScheduleRound(splitMixed,2,7,true);
  await splitMixed.locator('[data-lang="en"]').click();
  assert.equal(await splitMixed.locator('#scheduleRoundLabel').innerText(),'Round 2 / 7');
  assert.equal(await splitMixed.getByRole('button',{name:'Next round'}).isVisible(),true);

  // Score-tracking split Toss: Auto must only advance when all level matches
  // of the current round are fully scored.
  const splitScores=await open('splitToss');
  await splitScores.locator('#continueTo2').click();
  await splitScores.locator('#beginnerResultsToggle').check();
  await splitScores.locator('#ervarenResultsToggle').check();
  await splitScores.locator('#generateBtn').click();
  await checkScorePlacement(splitScores.locator('.match-card').first(),'.team','.players',true);
  await splitScores.setViewportSize({width:414,height:844});
  await checkScorePlacement(splitScores.locator('.match-card').first(),'.team','.players',true);
  if(screenshotDir)await splitScores.locator('.match-card').first().screenshot({path:path.join(screenshotDir,'mobile-score-card.png')});
  assert.equal(await splitScores.locator('#scheduleAuto').isEnabled(),false);
  const scoredFields=await splitScores.locator('#scheduleRound1 .team-score input').all();
  assert.equal(scoredFields.length,4);
  await scoredFields[0].fill('11');
  await scoredFields[1].fill('5');
  await scoredFields[1].press('Tab');
  await checkScheduleRound(splitScores,1,7);
  assert.equal(await splitScores.locator('#scheduleAuto').isEnabled(),true);
  await scoredFields[2].fill('8');
  await splitScores.locator('#presentBtn').click();
  await checkScorePlacement(splitScores.locator('#liveCurrent .live-match').first(),'.live-team','span');
  assert.equal(await splitScores.locator('#liveAuto').getAttribute('aria-pressed'),'true');
  assert.equal(await splitScores.locator('#liveCurrent .live-match').nth(1).locator('.team-score input').nth(0).inputValue(),'8');
  await splitScores.locator('#liveCurrent .live-match').nth(1).locator('.team-score input').nth(1).fill('7');
  await splitScores.locator('#liveCurrent .live-match').nth(1).locator('.team-score input').nth(1).press('Tab');
  assert.match(await splitScores.locator('#liveRoundLabel').innerText(),/2\s*\/\s*7/);
  assert.equal(await splitScores.locator('#liveStandings .live-board').count(),2);
  await splitScores.locator('#liveAllRounds').click();
  await checkScheduleRound(splitScores,2,7,true);

  const fourCourtAmericano=await open('americano');
  await fourCourtAmericano.locator('#courtsSelect .court-btn[data-courts="4"]').click();
  await fourCourtAmericano.locator('#continueTo2').click();
  await fillNames(fourCourtAmericano,16);
  await fourCourtAmericano.locator('#generateBtn').click();
  const firstRound=fourCourtAmericano.locator('.round-block').first();
  const courtRows=firstRound.locator('.match-card');
  assert.equal(await courtRows.count(),4);
  assert.deepEqual(await courtRows.locator('.court-label').allTextContents(),
    ['Baan 1','Baan 2','Baan 3','Baan 4']);
  const rows=await courtRows.evaluateAll(cards=>cards.map(card=>{
    const row=card.getBoundingClientRect();
    const label=card.querySelector('.court-label').getBoundingClientRect();
    const body=card.querySelector('.match-body').getBoundingClientRect();
    return {top:row.top,bottom:row.bottom,left:row.left,labelBeside:label.right<=body.left};
  }));
  for(const [index,row] of rows.entries()){
    assert.ok(row.labelBeside);
    if(index>0)assert.ok(row.left===rows[0].left&&row.top>rows[index-1].bottom);
  }
  assert.ok(rows.at(-1).bottom-rows[0].top<=270,'four court rows occupy less than 270px');
  await checkScorePlacement(courtRows.first(),'.team','.players',true);
  if(screenshotDir)await firstRound.screenshot({path:path.join(screenshotDir,'schedule-four-courts.png')});
  const firstScore=courtRows.first().locator('input[data-team="t1"]');
  await firstScore.fill('26');
  await firstScore.press('Tab');
  assert.equal(await courtRows.first().locator('input[data-team="t2"]').evaluate(input=>input===document.activeElement),true);
  for(const [width,inline] of [[500,true],[414,true],[390,false],[320,false]]){
    await fourCourtAmericano.setViewportSize({width,height:844});
    await checkNamesFit(courtRows.locator('.players'));
    await checkScorePlacement(courtRows.first(),'.team','.players',inline);
  }
  if(screenshotDir)await firstRound.screenshot({path:path.join(screenshotDir,'schedule-four-courts-narrow.png')});
  await fourCourtAmericano.setViewportSize({width:1600,height:1000});
  for(const field of await courtRows.locator('input').all())await field.fill('12');
  await fourCourtAmericano.locator('#scheduleNext').click();
  await checkScheduleRound(fourCourtAmericano,2,7,true);
  await fourCourtAmericano.locator('#presentBtn').click();
  assert.equal(await fourCourtAmericano.locator('#liveRoundLabel').innerText(),'Ronde 2 / 7');
  assert.equal(await fourCourtAmericano.locator('#liveStandings .live-board').count(),1);
  await checkLiveCourtRows(fourCourtAmericano,[2,2]);
  await checkNamesFit(fourCourtAmericano.locator('#liveCurrent .live-team span, #liveUpcoming .live-team span'));
  if(screenshotDir)await fourCourtAmericano.screenshot({path:path.join(screenshotDir,'presentation-americano-four-courts.png')});
  await fourCourtAmericano.locator('#presentExit').click();

  // Americano qualification and the new Gold/Silver competitions must not
  // contaminate each other's scores.
  const americano=await open('americano');
  await americano.locator('#continueTo2').click();
  await americano.locator('#roundsInput').fill('4');
  await americano.locator('#roundsInput').press('Tab');
  await americano.locator('#regroupToggle').check();
  await americano.locator('#splitRoundInput').fill('2');
  await americano.locator('#splitRoundInput').press('Tab');
  await americano.locator('#generateBtn').click();
  assert.equal(await americano.locator('#panel3').isVisible(),true);
  assert.equal(await americano.locator('#metaStrip').textContent(),'8 spelers · 2 banen · 4 rondes · Splits na ronde 2');
  for(const round of [1,2]){
    for(const court of [1,2]){
      const key='main-'+court+'-'+round;
      await americano.locator('input[data-key="'+key+'"][data-team="t1"]').fill('12');
      await americano.locator('input[data-key="'+key+'"][data-team="t2"]').fill('5');
    }
    await americano.locator('input[data-key="main-2-'+round+'"][data-team="t2"]').press('Tab');
    await checkScheduleRound(americano,2,2,round===1);
  }
  await americano.getByRole('button',{name:'Instellen',exact:true}).click();
  assert.equal(await americano.locator('#panel1').isVisible(),true);
  await americano.getByRole('button',{name:'Schema',exact:true}).click();
  assert.equal(await americano.locator('input[data-key="main-1-1"][data-team="t1"]').inputValue(),'12');
  assert.equal(await americano.locator('.checkpoint-card').count(),1);
  await americano.locator('.checkpoint-card button').click();
  await checkScheduleRound(americano,3,4,true);
  assert.equal(await americano.locator('.qualification-archive').count(),1);
  assert.equal(await americano.locator('#boardCol > .board').count(),2);
  assert.equal(await americano.locator('.phase-marker').count(),1);
  const goldSilverPoints=await americano.locator('#boardCol > .board td.pts').allTextContents();
  assert.ok(goldSilverPoints.length>=8 && goldSilverPoints.every(n=>Number(n)===0),
    'Gold/Silver finals begin with zero points');
  const historyPoints=await americano.locator('.qualification-archive td.pts').allTextContents();
  assert.ok(historyPoints.some(n=>Number(n)>0),'qualification scores remain archived');
  const before=await saveState(americano);
  const lockedGold=before.pools.find(p=>p.id==='top').players.slice();
  const lockedSilver=before.pools.find(p=>p.id==='bottom').players.slice();
  await americano.locator('input[data-key="main-1-1"][data-team="t1"]').fill('999');
  const corrected=await saveState(americano);
  assert.deepEqual(corrected.pools.find(p=>p.id==='top').players,lockedGold,
    'qualification correction cannot reassign Gold');
  assert.deepEqual(corrected.pools.find(p=>p.id==='bottom').players,lockedSilver,
    'qualification correction cannot reassign Silver');
  assert.ok((await americano.locator('#boardCol > .board td.pts').allTextContents())
    .every(n=>Number(n)===0),'phase-2 scoring is independent of qualification');
  await americano.locator('#presentBtn').click();
  assert.equal(await americano.locator('#liveCurrent .live-match').count(),2);
  assert.equal(await americano.locator('#liveStandings .live-board').count(),2);
  assert.match(await americano.locator('#liveRoundLabel').innerText(),/3\s*\/\s*4/);
  assert.equal(await americano.locator('#liveUpcoming .live-match').count(),2);
  await americano.locator('#liveCurrent .live-match').nth(0).locator('.team-score input').nth(0).fill('10');
  await americano.locator('#liveCurrent .live-match').nth(0).locator('.team-score input').nth(1).fill('8');
  await americano.locator('#liveCurrent .live-match').nth(1).locator('.team-score input').nth(0).fill('11');
  await americano.locator('#liveCurrent .live-match').nth(1).locator('.team-score input').nth(1).fill('7');
  await americano.locator('#liveCurrent .live-match').nth(1).locator('.team-score input').nth(1).press('Tab');
  assert.match(await americano.locator('#liveRoundLabel').innerText(),/4\s*\/\s*4/,
    'completing every court moves the current round forward');
  await americano.locator('#livePrev').click();
  assert.match(await americano.locator('#liveRoundLabel').innerText(),/3\s*\/\s*4/);
  // A later correction must change points, not the already-achieved round
  // progression. The override stays on round 3 until Auto is resumed.
  await americano.locator('#liveCurrent .live-match').nth(0)
    .locator('.team-score input').nth(0).fill('');
  await americano.locator('#liveCurrent .live-match').nth(0)
    .locator('.team-score input').nth(0).press('Tab');
  assert.match(await americano.locator('#liveRoundLabel').innerText(),/3\s*\/\s*4/);
  await americano.locator('#liveAllRounds').click();
  await checkScheduleRound(americano,3,4,true);
  const afterManual=await saveState(americano);
  assert.equal(afterManual.live.mode,'manual');
  assert.equal(afterManual.live.round,3);
  await americano.reload();
  await americano.locator('#resumeContinue').click();
  await checkScheduleRound(americano,3,4,true);
  await americano.locator('#scheduleAuto').click();
  await checkScheduleRound(americano,4,4);
  assert.equal(await americano.locator('#scheduleNext').isEnabled(),false);
  await americano.locator('#presentBtn').click();
  assert.match(await americano.locator('#liveRoundLabel').innerText(),/4\s*\/\s*4/);
  await americano.locator('#liveAllRounds').click();
  assert.equal(await americano.locator('#panel3').isVisible(),true);

  // KOC also remains usable as a presentation on a small phone viewport.
  const mobile=await open('koc',true);
  await mobile.locator('#kocRoll').click();
  await mobile.locator('#kocPresent').click();
  assert.equal(await mobile.locator('#liveKoc .live-koc-card').count(),4);
  assert.equal(await mobile.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false);
  assert.equal(await mobile.locator('#presentExit').isVisible(),true);
});
