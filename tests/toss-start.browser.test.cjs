const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {chromium}=require('playwright');
test('Toss first-round choices survive generating, language, storage and roster edits',async t=>{
  const root=path.join(__dirname,'..');
  const mime={'.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
  const server=http.createServer((req,res)=>{
    const pathname=new URL(req.url,'http://localhost').pathname;
    const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
    if(!file.startsWith(root+path.sep))return res.writeHead(403).end();
    try{res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'}).end(fs.readFileSync(file));}
    catch{res.writeHead(404).end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>(server.closeAllConnections(),server.close(resolve))));
  const origin='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({headless:true});
  t.after(()=>browser.close());
  const ctx=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
  t.after(()=>ctx.close());
  const page=await ctx.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin);
  await page.locator('[data-format=toss].format-btn').click();
  await page.locator('#panel1 .court-btn[data-courts="3"]').click();
  await page.locator('#continueTo2').click();
  const details=page.locator('#tossStartOptions');
  assert.equal(await details.getAttribute('open'),null);
  await details.locator('summary').focus();
  await page.keyboard.press('Enter');
  assert.equal(await details.getAttribute('open'),'');
  const inputs=page.locator('#namesGrid .name-field input');
  await inputs.nth(0).fill('Alexandra van den Berg');
  await inputs.nth(1).fill('Benjamin');
  await inputs.nth(23).fill('Zoe');
  async function mark(index,kind){await details.locator('[data-player="'+index+'"][data-choice="'+kind+'"]').check();}
  await mark(23,'Play');
  const fields=page.locator('#namesGrid .name-field');
  await fields.nth(0).locator('.duo-link').click();
  assert.equal(await fields.nth(0).locator('.duo-link').getAttribute('aria-pressed'),'true');
  await fields.nth(1).locator('.plan-grip').dragTo(fields.nth(4));
  assert.equal(await inputs.nth(4).inputValue(),'Benjamin');
  assert.equal(await inputs.nth(3).inputValue(),'Alexandra van den Berg');
  assert.equal(await fields.nth(3).locator('.duo-link').getAttribute('aria-pressed'),'true');
  await fields.nth(4).locator('.plan-grip').press('Enter');
  await fields.nth(0).locator('.plan-grip').press('Enter');
  assert.equal(await inputs.nth(1).inputValue(),'Benjamin');
  assert.equal(await fields.nth(0).locator('.duo-link').getAttribute('aria-pressed'),'true');
  await fields.nth(2).locator('.duo-link').click();
  assert.equal(await fields.locator('.duo-link[aria-pressed=true]').count(),2);
  assert.equal(await details.locator('[data-choice=Pair]').count(),0);
  assert.equal(await details.locator('[data-player="0"][data-choice="Play"]').count(),0);
  for(let i=4;i<=12;i++)await mark(i,'Play');
  assert.equal(await page.locator('#generateBtn').isDisabled(),true);
  assert.match(await page.locator('#tossStartError').innerText(),/14 spelers.*12 speelplekken/);
  for(let i=4;i<=12;i++)await details.locator('[data-player="'+i+'"][data-choice="Play"]').uncheck();
  await page.locator('[data-lang=en]').click();
  assert.match(await details.locator('summary').innerText(),/Extra settings/);
  assert.equal(await page.getByRole('checkbox',{name:'Must play in round 1: Alexandra van den Berg',exact:true}).count(),0);
  await page.locator('[data-lang=nl]').click();
  if(process.env.PADEL_SCREENSHOT_DIR){
    fs.mkdirSync(process.env.PADEL_SCREENSHOT_DIR,{recursive:true});
    await details.screenshot({path:path.join(process.env.PADEL_SCREENSHOT_DIR,'toss-first-round-desktop.png')});
  }
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  if(process.env.PADEL_SCREENSHOT_DIR)await details.screenshot({path:path.join(process.env.PADEL_SCREENSHOT_DIR,'toss-first-round-mobile.png')});
  await page.locator('#generateBtn').click();
  async function save(){
    const promise=page.waitForEvent('download');
    await page.locator('.action-bar:visible summary').click();
    await page.locator('#saveBtn').click();
    return JSON.parse(fs.readFileSync(await (await promise).path(),'utf8'));
  }
  function check(data){
    const rounds=data.state.pools[0].rounds;
    for(let i=1;i<rounds.length;i++)assert.ok(rounds[i].resting.every(name=>!rounds[i-1].resting.includes(name)));
    const first=rounds[0].courts;
    assert.ok(first.some(c=>c.team1.concat(c.team2).includes('Zoe')));
    const pairedCourts=data.state.tossStart.pairs.map(pair=>{
      const names=pair.map(i=>data.state.names[i] || 'Speler '+(i+1));
      return first.findIndex(c=>[c.team1,c.team2].some(team=>names.every(name=>team.includes(name))));
    });
    assert.equal(pairedCourts.length,2);
    assert.ok(pairedCourts.every(i=>i>=0),'both linked duos start together');
    assert.notEqual(pairedCourts[0],pairedCourts[1],'the duos play different opponents on separate courts');
  }
  const generated=await save();check(generated);
  await page.reload();
  await page.locator('#resumeContinue').click();
  await page.locator('#stepsNav [data-step="2"]').click();
  await details.locator('summary').click();
  assert.equal(await fields.locator('.duo-link[aria-pressed=true]').count(),2);
  assert.equal(await details.locator('[data-player="23"][data-choice="Play"]').isChecked(),true);
  await page.locator('#generateBtn').click();
  await page.locator('#confirmYesBtn').click();
  const regenerated=await save();check(regenerated);
  // Freeze round 1, add a participant, and retain its waiting history.
  await page.locator('#stepsNav [data-step="2"]').click();
  await page.locator('#editPlayersBtn').click();
  const renamed=regenerated.state.activeRoster.indexOf('Benjamin');
  await page.locator('#editRosterList .edit-row input').nth(renamed).fill('Ben');
  const leaving=regenerated.state.activeRoster.indexOf('Speler 10');
  assert.ok(leaving>=0);
  await page.locator('#editRosterList .edit-row').nth(leaving).locator('.remove-btn').click();
  await page.locator('#editAddBtn').click();
  await page.locator('#editRosterList .edit-row input').last().fill('New player');
  const played=page.locator('#editStatus input[type=number]');
  await played.fill('1');
  await played.press('Tab');
  await page.locator('#editApplyBtn').click();
  const edited=await save();
  const renamedFirst=JSON.parse(JSON.stringify(regenerated.state.pools[0].rounds[0]).replaceAll('Benjamin','Ben'));
  assert.deepEqual(edited.state.pools[0].rounds[0],renamedFirst);
  assert.ok(edited.state.pools[0].rounds.slice(1).flatMap(r=>r.courts).some(c=>c.team1.concat(c.team2).includes('Ben')));
  assert.ok(edited.state.tossStart.pairs.some(pair=>pair.map(i=>edited.state.names[i]).includes('Ben')));
  for(let i=1;i<edited.state.pools[0].rounds.length;i++){
    assert.ok(edited.state.pools[0].rounds[i].resting.every(name=>!edited.state.pools[0].rounds[i-1].resting.includes(name)));
  }
  // Older saves without the optional field still restore.
  delete generated.state.tossStart;
  await page.locator('#loadFileInput').setInputFiles({name:'older-session.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(generated))});
  await page.locator('#stepsNav [data-step="2"]').click();
  if(!await details.getAttribute('open'))await details.locator('summary').click();
  assert.equal(await fields.locator('.duo-link[aria-pressed=true]').count(),0);
  await page.locator('#backTo1').click();
  await page.locator('#playerCountInput').fill('30');
  await page.locator('#continueTo2').click();
  assert.equal(await page.locator('#tossWaitWarning').isVisible(),true);
  await page.locator('#generateBtn').click();
  await page.locator('#confirmYesBtn').click();
  assert.equal(await page.locator('#tossScheduleWarning').isVisible(),true);
  assert.deepEqual(errors,[]);
});
