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
  async function checkScorePlacement(card,teamSelector,nameSelector){
    const placement=await card.evaluate((match,{teamSelector,nameSelector})=>
      [...match.querySelectorAll(teamSelector)].map((team,side)=>{
        const names=[...team.querySelectorAll(nameSelector)];
        const field=team.querySelector('input');
        const bounds=field.getBoundingClientRect();
        const lastName=names.at(-1).getBoundingClientRect();
        const edge=side===0?'left':'right';
        return {
          below:bounds.top>=lastName.bottom,
          aligned:Math.abs(bounds[edge]-lastName[edge])<1,
          label:field.getAttribute('aria-label'),
          team:names.map(name=>name.textContent).join(' & ')
        };
      }),{teamSelector,nameSelector});
    assert.equal(placement.length,2);
    for(const score of placement){
      assert.ok(score.below&&score.aligned,'each score box sits below its team on the same side');
      assert.equal(score.label,'Score voor '+score.team);
    }
  }

  const koc=await open('koc');
  assert.match(await koc.locator('#appTitle').innerText(),/KING OF THE COURT/);
  await koc.locator('#kocRoll').click();
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
  await toss.locator('#generateBtn').click();
  assert.equal(await toss.locator('.brand-copy #metaStrip').textContent(),'32 spelers · 4 banen · 7 rondes');
  assert.equal(await scheduleStep.getAttribute('aria-current'),'step');
  await namesStep.click();
  await scheduleStep.press('Enter');
  assert.equal(await toss.locator('#panel3').isVisible(),true);
  await toss.locator('#presentBtn').click();
  assert.equal(await toss.locator('#liveCurrent .live-match').count(),4);
  assert.equal(await toss.locator('#liveUpcoming .live-match').count(),4);
  const roundLayout=await toss.locator('#liveLayout').evaluate(layout=>{
    const now=layout.querySelector('#liveCurrent');
    const next=layout.querySelector('#liveUpcoming');
    const first=now.querySelector('.live-match').getBoundingClientRect();
    const [a,b,c]=[...next.querySelectorAll('.live-match')].map(card=>card.getBoundingClientRect());
    return {
      currentWider:now.offsetWidth>next.offsetWidth,
      upcomingCompact:a.width<first.width&&a.height<first.height,
      upcomingTwoAcross:a.top===b.top&&a.left<b.left&&a.top<c.top
    };
  });
  assert.deepEqual(roundLayout,{currentWider:true,upcomingCompact:true,upcomingTwoAcross:true});
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

  const split=await open('splitToss',true);
  await split.getByRole('button',{name:'Namen',exact:true}).tap();
  await split.locator('#generateBtn').click();
  assert.equal(await split.locator('#metaStrip').textContent(),'16 spelers (Zilver 8, Goud 8) · 2 banen · 7 rondes');
  assert.equal(await split.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false);
  await split.locator('#presentBtn').click();
  assert.equal(await split.locator('#liveCurrent .live-match').count(),2);
  assert.equal(await split.locator('#liveStandings .live-board').count(),0);
  assert.equal(await split.locator('#liveCurrent .team-score input').count(),0);
  assert.equal(await split.locator('#liveAuto').isEnabled(),false,
    'without scores, split Toss uses manual progress');
  assert.match(await split.locator('#liveCurrent').innerText(),/Zilver/);
  assert.match(await split.locator('#liveCurrent').innerText(),/Goud/);
  await split.locator('#liveNext').click();
  assert.match(await split.locator('#liveRoundLabel').innerText(),/2\s*\/\s*7/);

  // Score-tracking split Toss: Auto must only advance when all level matches
  // of the current round are fully scored.
  const splitScores=await open('splitToss');
  await splitScores.locator('#continueTo2').click();
  await splitScores.locator('#beginnerResultsToggle').check();
  await splitScores.locator('#ervarenResultsToggle').check();
  await splitScores.locator('#generateBtn').click();
  await checkScorePlacement(splitScores.locator('.match-card').first(),'.team','.players');
  await splitScores.setViewportSize({width:390,height:844});
  await checkScorePlacement(splitScores.locator('.match-card').first(),'.team','.players');
  if(screenshotDir)await splitScores.locator('.match-card').first().screenshot({path:path.join(screenshotDir,'mobile-score-card.png')});
  await splitScores.locator('#presentBtn').click();
  await checkScorePlacement(splitScores.locator('#liveCurrent .live-match').first(),'.live-team','span');
  assert.equal(await splitScores.locator('#liveAuto').isEnabled(),false,
    'automatic tracking is the default but grey until first score entry');
  await splitScores.locator('#liveCurrent .live-match').nth(0).locator('.team-score input').nth(0).fill('11');
  await splitScores.locator('#liveCurrent .live-match').nth(0).locator('.team-score input').nth(1).fill('5');
  await splitScores.locator('#liveCurrent .live-match').nth(1).locator('.team-score input').nth(0).fill('8');
  await splitScores.locator('#liveCurrent .live-match').nth(1).locator('.team-score input').nth(1).fill('7');
  await splitScores.locator('#liveCurrent .live-match').nth(1).locator('.team-score input').nth(1).press('Tab');
  assert.match(await splitScores.locator('#liveRoundLabel').innerText(),/2\s*\/\s*7/);
  assert.equal(await splitScores.locator('#liveStandings .live-board').count(),2);

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
  }
  await americano.getByRole('button',{name:'Instellen',exact:true}).click();
  assert.equal(await americano.locator('#panel1').isVisible(),true);
  await americano.getByRole('button',{name:'Schema',exact:true}).click();
  assert.equal(await americano.locator('input[data-key="main-1-1"][data-team="t1"]').inputValue(),'12');
  assert.equal(await americano.locator('.checkpoint-card').count(),1);
  await americano.locator('.checkpoint-card button').click();
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
  const afterManual=await saveState(americano);
  assert.equal(afterManual.live.mode,'manual');
  assert.equal(afterManual.live.round,3);
  await americano.locator('#presentBtn').click();
  assert.match(await americano.locator('#liveRoundLabel').innerText(),/3\s*\/\s*4/);
  await americano.locator('#liveAuto').click();
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
