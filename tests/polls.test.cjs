const test=require('node:test');
const assert=require('node:assert/strict');
const {randomBytes}=require('node:crypto');
async function fixture(t){
  const {localSessionApp}=await import('../sessions/local.mjs');
  const app=await localSessionApp();t.after(()=>app.close());
  const config={title:'Testavond',format:'koc',date:new Date().toISOString().slice(0,10),start:'21:00',end:'23:00',courts:4,capacity:16};
  const password=randomBytes(14).toString('hex');
  async function send(path,body,headers={}){
    const req=new Request('https://club.test/api/polls'+path,{method:body===undefined?'GET':'POST',
      headers:{'content-type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)});
    const res=await app.fetch(req);return {status:res.status,data:await res.json(),headers:res.headers};
  }
  const created=await send('',{settings:config,password});assert.equal(created.status,201);
  const {id,token}=created.data;const root='/'+id,auth={Authorization:'Bearer '+token};
  const key=i=>({'X-Signup-Key':i.toString(16).padStart(64,'0')});
  const read=async()=> (await send(root+'/admin',undefined,auth)).data;
  async function act(body){const {revision}=await read();return send(root+'/admin',{revision,...body},auth);}
  async function vote(i,name,answer='yes'){return send(root,{name,answer},key(i));}
  return {app,send,read,act,vote,key,config,root,auth,password};
}
test('everyone can see names, each browser only changes its own response, and yes number 17 precedes explicit reserves',async t=>{
  const f=await fixture(t);
  await f.vote(90,'Early reserve','reserve');
  for(let i=1;i<=17;i++)assert.equal((await f.vote(i,'Player '+i)).status,200);
  let page=(await f.send(f.root)).data;
  assert.equal(page.groups.in.length,16);assert.equal(page.groups.wait[0].name,'Player 17');
  assert.equal(page.mine,undefined);assert.deepEqual(Object.keys(page.groups.in[0]),['name']);
  const privateData=await f.read(),first=privateData.entries.find(e=>e.name==='Player 1');
  assert.equal((await f.send(f.root,undefined,f.key(1))).data.mine.name,'Player 1');
  await f.vote(1,'Player 1');
  const same=await f.read();
  assert.deepEqual(same.entries,privateData.entries,'reading or repeating the same answer preserves timestamps and order');
  assert.equal((await f.send(f.root,{id:first.id,name:'Player 1',answer:'cancel'},f.key(999))).status,404);
  assert.equal((await f.vote(999,'Player 1','no')).status,409);
  await f.send(f.root,{id:first.id,name:'Player 4',answer:'cancel'},f.key(4));
  page=(await f.send(f.root)).data;
  assert.ok(page.groups.in.some(e=>e.name==='Player 1'));assert.ok(page.groups.in.some(e=>e.name==='Player 17'));assert.equal(page.groups.reserve.length,1);
  await f.vote(3,'Player 3','cancel');
  assert.ok((await f.send(f.root)).data.groups.in.some(e=>e.name==='Early reserve'));
  const removed=privateData.entries.find(e=>e.name==='Player 6');
  assert.equal((await f.act({action:'withdraw',id:removed.id})).status,200);
  assert.ok(!JSON.stringify((await f.send(f.root)).data.groups).includes('"Player 6"'));
  const original=privateData.entries.find(e=>e.name==='Player 10');
  const move=await f.act({action:'entry',id:original.id,name:'Player Ten',place:'in',position:1});assert.equal(move.status,200);
  assert.equal(move.data.entries.filter(e=>e.place==='in')[0].name,'Player Ten');
  assert.equal(move.data.entries.find(e=>e.id===original.id).first,original.first);
});
test('private series decision, password, phases, repeat, stale updates and expiry',async t=>{
  const f=await fixture(t);await f.vote(1,'Robin');
  assert.equal((await f.send(f.root+'/admin')).status,401);
  assert.equal((await f.send(f.root+'/login',{password:'incorrect'})).status,401);
  const login=await f.send(f.root+'/login',{password:f.password});assert.equal(login.status,200);
  const before=await f.read(),id=before.entries[0].id;
  await f.act({action:'entry',id,name:'Robin',place:'review',position:1,standing:true});
  assert.equal((await f.send(f.root+'/admin',{revision:before.revision,action:'plan'},f.auth)).status,409);
  const pub=await f.send(f.root,undefined,f.key(1));assert.deepEqual(pub.data.groups.reserve,[{name:'Robin'}]);
  assert.doesNotMatch(JSON.stringify(pub.data),/review|standing|held|first|person|verifier/);
  const unchanged=await f.vote(1,'Robin');assert.equal(unchanged.data.mine.place,'reserve');
  await f.act({action:'plan'});const locked=await f.send(f.root,undefined,f.key(1));
  assert.deepEqual(Object.keys(locked.data).sort(),['id','phase','settings']);assert.match(locked.headers.get('cache-control'),/no-store/);
  assert.equal((await f.vote(2,'Second')).status,409);
  assert.equal((await f.act({action:'entry',name:'Organizer addition',place:'in',position:1})).status,200);
  assert.equal((await f.act({action:'publish',sessionKey:'123'})).status,422);
  const next=await f.act({action:'repeat'});assert.equal(next.status,200);
  const second='/'+next.data.id;assert.equal((await f.send(second)).data.groups.in.length,0);
  assert.equal((await f.send(second+'/admin',undefined,f.auth)).status,200);
  const same=await f.send(second,{name:'Robin',answer:'yes'},f.key(1));assert.equal(same.data.mine.place,'reserve');
  await f.act({action:'reopen'});assert.equal((await f.send(f.root)).data.phase,'open');
  await f.send(f.root+'/logout',{},f.auth);assert.equal((await f.send(f.root+'/admin',undefined,f.auth)).status,401);
  const {cleanup}=await import('../sessions/api.mjs');await cleanup(f.app.DB,Date.now()+60*86400000);
  assert.equal((await f.send(f.root)).status,404);
  assert.equal(f.app.sql.prepare('SELECT count(*) AS n FROM signup_holds').get().n,0);
});
test('simultaneous signups fill only the available places, retries cannot create duplicates, and quick corrections preserve waitlist order',async t=>{
  const f=await fixture(t);
  const results=await Promise.all(Array.from({length:19},(_,i)=>f.vote(i+1,'P'+i)));assert.ok(results.every(x=>x.status===200),JSON.stringify(results.map(x=>x.status)));
  const before=(await f.send(f.root)).data;assert.equal(before.groups.in.length,16);assert.equal(before.groups.wait.length,3);
  assert.equal(new Set([...before.groups.in,...before.groups.wait].map(x=>x.name)).size,19);
  const [a,b]=before.groups.wait.map(x=>x.name);
  const k=Number(a.slice(1))+1;await f.vote(k,a,'reserve');await f.vote(k,a,'yes');await f.vote(k,a,'yes');
  const after=(await f.send(f.root)).data;assert.equal(after.groups.wait[0].name,a);assert.equal(after.groups.wait[1].name,b);
  const first=(await f.read()).entries.find(x=>x.name===a);
  await f.act({action:'entry',id:first.id,name:a,place:'in',position:2});
  const moved=(await f.send(f.root)).data;assert.equal(moved.groups.in[1].name,a);assert.equal(moved.groups.in.length,16);
});

test('a PIN opens only the original signup in one edition and never changes its priority',async t=>{
  const f=await fixture(t),first=f.key(1),phone=f.key(2),other=f.key(3);
  assert.equal((await f.send(f.root,{name:'Mila',answer:'yes',pin:'123'},first)).status,422);
  const added=await f.send(f.root,{name:'Mila',answer:'yes',pin:'0379'},first);
  assert.equal(added.data.mine.hasPin,true);
  await f.vote(3,'Robin');
  const before=await f.read(),original=before.entries.find(e=>e.name==='Mila');
  const recover=(path,name,pin,device)=>f.send(path+'/recover',{name,pin},device);
  assert.equal((await recover(f.root,'Mila','9999',phone)).data.error,'pin-login');
  assert.equal((await recover(f.root,'mila','0379',other)).data.error,'pin-device');
  assert.equal((await recover(f.root,'  MILA ','0379',phone)).status,200);
  assert.equal((await f.send(f.root,undefined,phone)).data.mine.name,'Mila');
  assert.equal((await f.send(f.root+'/admin',undefined,phone)).status,401);
  assert.deepEqual((await f.read()).entries,before.entries);
  assert.equal((await f.read()).revision,before.revision);
  assert.doesNotMatch(JSON.stringify(before.entries),/"pin"|verifier|salt|0379/);
  assert.doesNotMatch(JSON.stringify((await f.send(f.root)).data),/pin|verifier|salt|0379/i);
  assert.equal((await f.send(f.root,{name:'Mila',answer:'reserve'},phone)).status,200);
  assert.equal((await f.send(f.root,undefined,first)).data.mine.answer,'reserve');
  assert.equal((await f.read()).entries.find(e=>e.id===original.id).first,original.first);
  assert.equal((await f.send(f.root,{name:'Robin',answer:'no'},phone)).status,409);
  const next='/'+(await f.act({action:'repeat'})).data.id;
  await f.send(next,{name:'Mila',answer:'yes'},first);
  assert.equal((await f.send(next,undefined,phone)).data.mine,undefined);
  assert.equal((await recover(next,'Mila','0379',phone)).data.error,'pin-login');
  assert.equal((await f.send(f.root,{action:'set-pin',pin:'0041'},other)).data.mine.hasPin,true);
  assert.equal((await f.send(f.root,{action:'set-pin',pin:'0041'},f.key(8))).status,403);
  const unknown=await recover(f.root,'Unknown','0379',f.key(8));
  assert.equal(unknown.data.error,'pin-login');
  for(let i=0;i<5;i++){
    const attempt=await recover(f.root,'Robin','0000',{...f.key(7),'CF-Connecting-IP':'test-ip-'+i});
    assert.equal(attempt.status,401);
  }
  assert.equal((await recover(f.root,'ROBIN','0000',f.key(8))).data.error,'pin-limit');
  await f.act({action:'plan'});
  assert.equal((await recover(f.root,'Mila','0379',f.key(9))).data.error,'locked');
  assert.equal((await f.send(f.root,undefined,phone)).data.mine,undefined);
});

test('standby is exclusive to KOC; a previous non-KOC standby stays available to the organizer',async t=>{
  const f=await fixture(t);await f.vote(1,'Noor','reserve');
  const row=await f.read(),original=row.entries[0];
  const change=await f.act({action:'settings',settings:{...f.config,format:'toss'}});
  assert.equal(change.status,200);assert.equal(change.data.entries[0].place,'review');
  assert.equal(change.data.entries[0].first,original.first);
  for(const format of ['toss','americano','splitToss']){
    await f.act({action:'settings',settings:{...f.config,format}});
    const page=(await f.send(f.root,undefined,f.key(1))).data;
    assert.equal(page.groups.reserve,undefined);assert.equal(page.mine.place,'pending');
    assert.equal((await f.vote(2,'New standby','reserve')).data.error,'reserve-format');
    assert.equal((await f.act({action:'entry',name:'New standby',place:'reserve',position:1})).data.error,'reserve-format');
  }
  const pollId=f.root.slice(1);
  f.app.sql.prepare("UPDATE signup_polls SET document=json_set(document,'$.entries[0].place','reserve') WHERE id=?").run(pollId);
  assert.equal((await f.read()).entries[0].place,'review');
  assert.equal((await f.send(f.root,undefined,f.key(1))).data.mine.place,'pending');
  assert.equal((await f.vote(1,'Noor','yes')).data.mine.place,'in');
  assert.equal((await f.read()).entries.length,1);
});

test('a later Yes gets a new position once ten minutes have elapsed',async()=>{
  const {emptyPoll,respond}=await import('../sessions/poll-roster.mjs');
  const start=Date.UTC(2026,10,24,18),minute=60000;
  for(const delay of [10*minute,2*24*60*minute]){
    const doc=emptyPoll({title:'Toss',format:'toss',date:'2026-11-26',start:'21:00',end:'23:00',courts:2,capacity:4});
    const vote=(name,answer,at)=>respond(doc,name,{name,answer},at,false);
    ['Jan','Bo','Kim','Sam','Noor','Pim'].forEach((name,i)=>vote(name,'yes',start+i));
    vote('Jan','no',start+minute);vote('Jan','yes',start+minute+delay);
    const jan=doc.entries.find(e=>e.name==='Jan');
    assert.equal(jan.at,start+minute+delay);
    assert.deepEqual(doc.entries.filter(e=>e.place==='wait').map(e=>e.name),['Pim','Jan']);
  }
});

test('a confirmed correction restores the old time for ten minutes without displacing a promoted player',async()=>{
  const {emptyPoll,respond,adminEntry,publicPoll}=await import('../sessions/poll-roster.mjs');
  const start=Date.UTC(2026,10,24,18),minute=60000;
  const doc=emptyPoll({title:'Training',format:'koc',date:'2026-11-26',start:'21:00',end:'23:00',courts:2,capacity:4});
  const vote=(name,answer,at)=>respond(doc,name,{name,answer},at,false);
  const player=name=>doc.entries.find(e=>e.name===name);
  ['Jan','Bo','Kim','Sam','Noor','Pim'].forEach((name,i)=>vote(name,'yes',start+i));
  vote('Jan','no',start+minute);
  assert.equal(player('Noor').place,'in');
  assert.equal(publicPoll(doc,'id','Jan',start+minute).mine.correction.until,start+11*minute);
  vote('Jan','yes',start+11*minute-1);
  assert.equal(player('Jan').at,start);assert.equal(player('Noor').place,'in');
  assert.deepEqual(doc.entries.filter(e=>e.place==='wait').map(e=>e.name),['Jan','Pim']);
  vote('Jan','no',start+11*minute-1);
  assert.equal(player('Jan').correction.until,start+11*minute);
  vote('Jan','yes',start+11*minute);
  assert.deepEqual(doc.entries.filter(e=>e.place==='wait').map(e=>e.name),['Pim','Jan']);
  vote('Bo','no',start+12*minute);vote('Bo','yes',start+13*minute);
  assert.equal(player('Pim').place,'in');assert.equal(player('Bo').at,start+1);
  vote('Pim','no',start+14*minute);vote('Sam','no',start+14*minute+1);
  vote('Kim','no',start+14*minute+2);vote('Kim','yes',start+15*minute);
  assert.equal(player('Kim').place,'in');assert.equal(player('Kim').at,start+2);
  vote('Kim','no',start+16*minute);
  adminEntry(doc,{id:player('Kim').id,name:'Kim',place:'review',position:1},start+16*minute);
  vote('Kim','yes',start+17*minute);
  assert.equal(player('Kim').place,'review');assert.equal(player('Kim').at,start+17*minute);
});
