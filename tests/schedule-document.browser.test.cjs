const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {chromium}=require('playwright');

test('PDF and print have distinct actions, and a direct redraw preserves entered scores and preferences',async t=>{
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

  for(const mode of ['toss','americano','splitToss','koc']){
    const page=await open(mode,true), errors=[];
    page.on('pageerror',err=>errors.push(err.message));
    const koc=mode==='koc';
    if(koc){
      await page.locator('#kocExtras summary').tap();
      await page.locator('#kocCourtNumber0').fill('Centercourt');
      await page.locator('#kocLevelGrid select').first().selectOption('-1');
      await page.locator('#kocRoll').tap();
    }else{
      await page.locator('#continueTo2').click();
      await page.locator('#tossStartOptions summary').tap();
      await page.locator('#tossStartTime').fill('21:00');
      await page.locator('#tossCourtNumber0').fill('Centercourt');
      await page.locator('#tossStartGrid [data-choice=Rest]').last().check();
      await page.locator('#tossStartGrid select').first().selectOption('1');
      if(mode==='splitToss'){
        await page.locator('#prefGroup').selectOption('1');
        assert.equal(await page.locator('#tossStartGrid [data-choice=Rest]').last().isChecked(),false);
        await page.locator('#tossStartGrid [data-choice=Rest]').first().check();
        await page.locator('#prefGroup').selectOption('0');
        assert.equal(await page.locator('#tossStartGrid [data-choice=Rest]').last().isChecked(),true);
      }
      await page.locator('#generateBtn').tap();
      const names=page.locator('#scheduleRound1 .players');
      const grid=page.locator('#roundsCol .players');
      const before=await grid.allTextContents();
      const first=await names.allTextContents();
      if(mode==='americano')await page.locator('#scheduleRound1 .team-score input').first().fill('0');
      await page.locator('#rerollBtn').tap();
      assert.match(await page.locator('#rerollStatus').innerText(),new RegExp('ronde '+(mode==='americano'?2:1)));
      if(mode==='americano'){
        assert.deepEqual(await names.allTextContents(),first);
        assert.equal(await page.locator('#scheduleRound1 .team-score input').first().inputValue(),'0');
      }
      assert.notDeepEqual(await grid.allTextContents(),before);
    }
    await page.evaluate(()=>window.print=()=>window.printCalls=(window.printCalls||0)+1);
    const download=page.waitForEvent('download');
    await page.locator(koc?'#kocPdf':'#pdfBtn').tap();
    const file=await download;
    assert.ok(file.suggestedFilename().endsWith('.pdf'));
    const bytes=fs.readFileSync(await file.path());
    const pdf=bytes.toString('latin1');
    assert.match(pdf,/^%PDF-1.4/);
    const xref=Number(pdf.match(/startxref\n(\d+)/)[1]);
    assert.equal(pdf.slice(xref,xref+4),'xref');
    assert.ok(pdf.includes(Buffer.from('Centercourt').toString('hex')));
    if(!koc) assert.ok(pdf.includes(Buffer.from('21:00').toString('hex')));
    assert.equal(await page.evaluate(()=>window.printCalls||0),0);
    await page.locator(koc?'#kocPrint':'#printBtn').tap();
    assert.equal(await page.evaluate(()=>window.printCalls),1);
    await page.emulateMedia({media:'print'});
    const pages=page.locator('#printPages svg');
    assert.ok(await pages.first().isVisible());
    assert.ok((await pages.allTextContents()).some(text=>text.includes('Centercourt')));
    assert.equal(await page.locator('.schedule-actions').isVisible(),false);
    assert.deepEqual(errors,[]);
  }
  const page=await open('toss');
  const pages=await page.evaluate(()=>{
    const row={label:'Baan',value:'Ana & Bart vs Jo & Kim'};
    const round=(n,count)=>({heading:'Ronde '+n+' 21:00',rows:Array(count).fill(row)});
    return ScheduleDocument.layout('Toss',[round(1,16),round(2,16),round(3,60)])
      .map(page=>page.map(item=>item.text));
  });
  assert.equal(pages.filter(p=>p.includes('Ronde 1 21:00')).length,1);
  assert.equal(pages.filter(p=>p.includes('Ronde 2 21:00')).length,1);
  assert.ok(pages.filter(p=>p.includes('Ronde 3 21:00')).length>=2);
  assert.equal(pages.flat().filter(text=>text==='Baan').length,92);
});
