const test=require('node:test');
const assert=require('node:assert/strict');
const {randomBytes}=require('node:crypto');

async function setup(t){
  const {localSessionApp}=await import('../sessions/local.mjs'), {api}=await import('../sessions/api.mjs');
  const app=await localSessionApp();t.after(()=>app.close());
  const password=randomBytes(16).toString('hex'), now=Date.now();
  const settings={title:'Clubavond',format:'koc',date:new Date(now).toISOString().slice(0,10),start:'21:00',end:'23:00',courts:4,capacity:16};
  async function send(path,body,headers={},secret=password,time=now){
    const req=new Request('https://club.test/api/'+path,{method:body===undefined?'GET':'POST',
      headers:{'Content-Type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)});
    const res=await api(req,app.DB,time,secret);
    return {status:res.status,data:await res.json(),headers:res.headers};
  }
  async function login(){
    const res=await send('polls/hub/login',{password});
    assert.equal(res.status,200);const cookie=res.headers.get('Set-Cookie');
    for(const flag of ['HttpOnly','Secure','SameSite=Strict','Path=/'])assert.ok(cookie.includes(flag));
    return {Cookie:cookie.split(';')[0]};
  }
  return {app,send,login,password,settings,now};
}
test('central login is separate from poll links, expires, rotates and revokes sessions on logout',async t=>{
  const {app,send,login,password,settings,now}=await setup(t);
  const poll=(await send('polls',{settings,password:randomBytes(15).toString('hex')})).data;
  for(const path of ['polls/hub','polls/hub/sessions']){
    assert.equal((await send(path)).status,401);
    assert.equal((await send(path,undefined,{Authorization:'Bearer '+poll.token})).status,401);
  }
  assert.equal((await send('polls/hub/login',{password}, {}, '')).status,503);
  assert.equal((await send('polls/hub/login',{password:'a different password'})).status,401);
  assert.equal((await send('polls/hub/login',{password},{Origin:'https://outside.test'})).status,403);
  const auth=await login();
  assert.equal((await send('polls/hub/status',undefined,auth)).status,200);
  assert.equal((await send('polls/hub/status',undefined,auth,password+'changed')).status,401);
  assert.equal((await send('polls/hub/status',undefined,auth,password,now+12*3600000)).status,401);
  assert.notEqual(app.sql.prepare('SELECT token FROM organizer_logins').get().token,auth.Cookie.split('=')[1]);
  const out=await send('polls/hub/logout',{},auth);
  assert.match(out.headers.get('Set-Cookie'),/Max-Age=0/);
  assert.equal((await send('polls/'+poll.id+'/admin',undefined,auth)).status,401);
  assert.equal((await send('polls/'+poll.id+'/admin',undefined,{Authorization:'Bearer '+poll.token})).status,200);
  for(let i=0;i<8;i++)await send('polls/hub/login',{password:'incorrect'},{'CF-Connecting-IP':'test-ip'});
  assert.equal((await send('polls/hub/login',{password},{'CF-Connecting-IP':'test-ip'})).status,429);
});
test('all poll series and separate sessions can be managed; the overview sends only card data',async t=>{
  const {app,send,login,settings,now}=await setup(t);
  const auth=await login();
  const first=(await send('polls',{settings,password:randomBytes(16).toString('hex')})).data;
  assert.equal((await send('polls',{settings,central:true})).status,401);
  const second=await send('polls',{settings:{...settings,title:'Toss'},central:true},auth);
  assert.equal(second.status,201);assert.deepEqual(Object.keys(second.data),['id']);
  const path='polls/'+first.id+'/admin';
  const edit=await send(path,{action:'entry',revision:1,name:'Private assessment',place:'review',position:1,standing:true},auth);
  assert.equal(edit.status,200);assert.equal(edit.data.entries[0].standing,true);
  assert.equal((await send(path,{action:'plan',revision:2},auth)).data.phase,'planning');
  assert.equal((await send('polls/'+first.id)).data.groups,undefined);
  const index=await send('polls/hub',undefined,auth);
  assert.equal(index.data.items.length,2);assert.equal(index.data.items.find(p=>p.id===first.id).phase,'planning');
  for(const marker of ['Private assessment','plannerKey','person','entries','viewCode'])assert.ok(!JSON.stringify(index.data).includes(marker));
  assert.match(index.headers.get('cache-control'),/no-store/);
  const id='00000000-0000-4000-8000-000000000001',code='TESTVIEW';
  const doc=JSON.stringify({state:{format:'koc'},view:{title:'Zaterdagavond'}});
  const ownerSecret=randomBytes(24).toString('hex');
  const ownerHash=require('node:crypto').createHash('sha256').update(ownerSecret).digest('hex');
  app.sql.prepare('INSERT INTO sessions VALUES (?,?,1,?,?,0,?,?,?)').run(id,ownerHash,'view','epoch',now+3600000,now,doc);
  app.sql.prepare('INSERT INTO links VALUES (?,?,?,?,?)').run(code,id,'view','','');
  const standalone=await send('polls/hub/sessions',undefined,auth);
  assert.deepEqual(standalone.data.items,[]);
  const legacyView=await send('manage/'+id,undefined,auth);
  assert.equal(legacyView.data.playDate,null);
  assert.equal((await send('manage/'+id,{action:'schedule',revision:1,playDate:'2026-02-31'},auth)).status,422);
  const promoted=await send('manage/'+id,{action:'schedule',revision:1,playDate:settings.date},auth);
  assert.equal(promoted.data.playDate,settings.date);assert.equal(promoted.data.links[0].code,code);
  const dated=(await send('polls/hub/sessions',undefined,auth)).data.items;
  assert.equal(dated.length,1);assert.equal(dated[0].date,settings.date);
  assert.equal((await send('manage/'+id,undefined,{Authorization:'Bearer '+first.token})).status,401);
  assert.equal((await send('manage/'+id,undefined,auth)).data.state.format,'koc');
  assert.equal((await send('manage/'+id,{action:'close',revision:2},auth)).data.closed,true);
  // A published poll already contains the session; there must be only one card.
  const published=await send(path,{action:'publish',revision:3,sessionKey:ownerSecret},auth);
  assert.equal(published.status,200);assert.equal(published.data.plannerId,id);assert.equal(published.data.plannerKey,undefined);
  assert.equal((await send(path,undefined,{Authorization:'Bearer '+first.token})).data.plannerKey,ownerSecret);
  assert.equal((await send('polls/'+first.id)).data.plannerId,undefined);
  assert.deepEqual((await send('polls/hub/sessions',undefined,auth)).data.items,[]);
  for(let i=0;i<65;i++)app.sql.prepare('INSERT INTO signup_polls SELECT ?,series,revision,expires,document FROM signup_polls WHERE id=?').run(i.toString(16).padStart(14,'0'),first.id);
  const a=(await send('polls/hub',undefined,auth)).data,b=(await send('polls/hub?after='+a.next,undefined,auth)).data;
  assert.equal(a.items.length,64);assert.equal(b.next,null);assert.equal(new Set([...a.items,...b.items].map(p=>p.id)).size,67);
});

test('removing one week is central-only, revision-checked and preserves the other weeks and series access',async t=>{
  const {app,send,login,settings}=await setup(t), auth=await login();
  const first=(await send('polls',{settings,password:randomBytes(16).toString('hex')})).data;
  const seriesAuth={Authorization:'Bearer '+first.token};
  async function edit(id,action,fields={}){
    const path='polls/'+id+'/admin';
    const current=(await send(path,undefined,seriesAuth)).data;
    const response=await send(path,{action,revision:current.revision,...fields},seriesAuth);
    assert.equal(response.status,200);return response.data;
  }
  const middle=(await edit(first.id,'repeat')).id;
  const last=(await edit(middle,'repeat')).id;
  const details=await edit(middle,'entry',{name:'Reservering',place:'review',standing:true,position:1});
  await edit(last,'entry',{name:'Volgende week',place:'in',position:1});
  const body={kind:'poll',id:middle,revision:details.revision}, path='polls/hub/remove';
  assert.equal((await send(path,body)).status,401);
  assert.equal((await send(path,body,seriesAuth)).status,401);
  assert.equal((await send(path,body,{...auth,Origin:'https://other.test'})).status,403);
  assert.equal((await send(path,{...body,revision:details.revision-1},auth)).status,409);
  assert.equal((await send('polls/'+first.id+'/admin',undefined,seriesAuth)).data.next,middle);
  assert.equal((await send('polls/'+middle+'/admin',undefined,seriesAuth)).data.entries.length,1);
  assert.equal((await send(path,body,auth)).status,200);
  assert.equal((await send(path,body,auth)).status,200);
  assert.equal((await send('polls/'+middle)).status,404);
  assert.equal((await send('polls/'+middle+'/admin',undefined,auth)).status,404);
  assert.equal((await send('polls/'+first.id+'/admin',undefined,seriesAuth)).data.next,null);
  assert.equal((await send('polls/'+last)).data.groups.in[0].name,'Volgende week');
  assert.equal(app.sql.prepare('SELECT COUNT(*) AS n FROM signup_holds').get().n,1);
  const replacement=(await edit(first.id,'repeat')).id;
  assert.notEqual(replacement,middle);
  assert.equal((await edit(replacement,'repeat')).id,last);
  assert.equal(app.sql.prepare('SELECT COUNT(*) AS n FROM signup_polls').get().n,3);
});

test('removing a schedule revokes its links and deleting a published event preserves schedules used by another event',async t=>{
  const {app,send,login,settings}=await setup(t), auth=await login();
  const schedule={state:{format:'koc',koc:{}},view:{title:'Zaterdag',rounds:[{n:1,rows:[
    {label:'Baan 1',slot:'baan1',teams:[['Ada'],['Bram']]}]}],boards:[],playerIds:{Ada:'a',Bram:'b'}}};
  const created=(await send('sessions',{...schedule,playDate:settings.date})).data, standalone=(await send('polls/hub/sessions',undefined,auth)).data.items[0];
  const owner={Authorization:'Bearer '+created.secret}, path='polls/hub/remove';
  const remove={kind:'session',id:standalone.id,revision:standalone.revision};
  const edit=await send('manage',{action:'mode',mode:'group',revision:1},owner);
  const scoreCode=(await send('manage',{action:'link',revision:edit.data.revision},owner)).data.code;
  assert.equal((await send(path,remove,auth)).status,409);
  assert.equal((await send('s/'+scoreCode)).status,200);
  remove.revision=edit.data.revision;
  assert.equal((await send(path,remove,owner)).status,401);
  assert.equal((await send(path,remove,auth)).status,200);
  assert.equal((await send(path,remove,auth)).status,200);
  for(const endpoint of ['s/'+standalone.viewCode,'s/'+scoreCode,'manage/'+standalone.id])assert.equal((await send(endpoint,undefined,auth)).status,404);
  assert.equal((await send('manage',undefined,owner)).status,404);

  const shared=(await send('sessions',{...schedule,playDate:settings.date})).data;
  const listed=(await send('polls/hub/sessions',undefined,auth)).data.items[0];
  const events=[];
  for(const title of ['Woensdag','Zaterdag']){
    const poll=(await send('polls',{settings:{...settings,title},central:true},auth)).data;
    const endpoint='polls/'+poll.id+'/admin';
    await send(endpoint,{action:'plan',revision:1},auth);
    const published=await send(endpoint,{action:'publish',revision:2,sessionKey:shared.secret},auth);
    assert.equal(published.status,200);
    events.push({kind:'poll',id:poll.id,revision:published.data.revision});
  }
  assert.equal((await send(path,{kind:'session',id:listed.id,revision:listed.revision},auth)).status,409);
  assert.equal((await send(path,{...events[0],revision:1},auth)).status,409);
  assert.equal((await send(path,events[0],auth)).status,200);
  assert.equal((await send('s/'+listed.viewCode)).status,200);
  assert.equal((await send('polls/'+events[1].id)).data.viewCode,listed.viewCode);
  assert.equal((await send(path,events[1],auth)).status,200);
  assert.equal((await send('s/'+listed.viewCode)).status,404);
  assert.deepEqual((await send('polls/hub/sessions',undefined,auth)).data.items,[]);
  assert.equal(app.sql.prepare('SELECT COUNT(*) AS n FROM links').get().n,0);
  assert.equal(app.sql.prepare('SELECT COUNT(*) AS n FROM signup_series').get().n,0);
});

test('only explicitly dated shares enter the planner and a poll always owns its published date',async t=>{
  const {app,login,send,settings,now,password}=await setup(t),auth=await login();
  const day=86400000,date=new Date(now+22*day).toISOString().slice(0,10);
  const doc={state:{format:'koc',koc:{}},view:{title:'KOC',rounds:[{n:1,rows:[]}],boards:[],playerIds:{}}};
  for(const playDate of [undefined,'','not a date','2026-02-31',new Date(now+400*day).toISOString().slice(0,10)]){
    const res=await send('sessions',{...doc,playDate});
    assert.equal(res.status,422);assert.equal(res.data.error,'date');
  }
  assert.equal(app.sql.prepare('SELECT count(*) n FROM sessions').get().n,0);
  const manual=(await send('sessions',{...doc,playDate:date})).data;
  assert.ok(manual.expires>=Date.parse(date)+7*day);
  const owner={Authorization:'Bearer '+manual.secret};
  const revised=await send('manage',{action:'save',revision:1,document:{...doc,view:{...doc.view,title:'KOC training'}}},owner);
  assert.equal(revised.data.playDate,date);
  const code=manual.links[0].code;
  const future=await send('s/'+code,undefined,{},password,now+18*day);
  assert.equal(future.status,200);assert.equal(future.data.view.playDate,date);
  assert.equal(future.data.view.planning,undefined);
  const poll=(await send('polls',{settings:{...settings,date},central:true},auth)).data;
  const manage='polls/'+poll.id+'/admin';
  await send(manage,{action:'plan',revision:1},auth);
  const imported=(await send('sessions',{...doc,state:{...doc.state,signupPoll:{id:poll.id}},playDate:'2000-01-01'})).data;
  assert.equal(imported.playDate,date);
  const list=()=>send('polls/hub/sessions',undefined,auth).then(res=>res.data.items.map(s=>s.viewCode));
  assert.deepEqual(await list(),[code]);
  const published=await send(manage,{action:'publish',revision:2,sessionKey:imported.secret},auth);
  assert.equal(published.data.phase,'published');
  const later=new Date(now+35*day).toISOString().slice(0,10);
  const moved=await send(manage,{action:'settings',revision:3,settings:{...settings,date:later}},auth);
  assert.equal(moved.data.settings.date,later);
  const view=await send('s/'+imported.links[0].code,undefined,{},password,now+33*day);
  assert.equal(view.data.view.playDate,later);
  await send(manage,{action:'reopen',revision:4},auth);
  assert.deepEqual(await list(),[code]);
});

test('an organizer can reopen only their own polls by name and password on a new device',async t=>{
  const {app,send,settings,now}=await setup(t);
  const credentials={organizerName:'Werner de Vries',password:randomBytes(16).toString('hex')};
  const cookie=res=>({Cookie:res.headers.get('Set-Cookie').split(';')[0]});
  const first=await send('polls',{settings,...credentials});assert.equal(first.status,201);
  const own=cookie(first),id=first.data.id;
  assert.deepEqual(Object.keys(first.data),['id']);
  for(const flag of ['HttpOnly','Secure','SameSite=Strict','Path=/'])assert.ok(first.headers.get('Set-Cookie').includes(flag));
  assert.notEqual(app.sql.prepare('SELECT token FROM poll_organizer_logins').get().token,own.Cookie.split('=')[1]);
  assert.equal((await send('polls/mine?name=Werner')).status,401);
  assert.equal((await send('polls/mine/login',{...credentials,password:'wrong-password'})).status,401);
  assert.equal((await send('polls/mine/login',{...credentials,organizerName:'Unknown'})).status,401);
  const wrong=await send('polls',{settings,organizerName:' WERNER  DE VRIES ',password:'wrong-password'});
  assert.equal(wrong.status,401);assert.equal(app.sql.prepare('SELECT count(*) AS n FROM signup_polls').get().n,1);
  assert.equal((await send('polls',{settings,organizerName:credentials.organizerName,useSession:true})).status,401);
  const second=await send('polls',{settings:{...settings,title:'Donderdagtoss'},organizerName:credentials.organizerName,useSession:true},own);
  assert.equal(second.status,201);
  const again=await send('polls/'+id+'/admin',{action:'repeat',revision:1},own);
  assert.equal(again.status,200);
  const other=await send('polls',{settings:{...settings,title:'Andere organisator'},organizerName:'Werner B',password:'eigen-wachtwoord'});
  assert.equal(other.status,201);
  const phone=await send('polls/mine/login',{...credentials,organizerName:'  wErNeR   de vries '});
  assert.equal(phone.status,200);const phoneCookie=cookie(phone);
  const list=await send('polls/mine',undefined,phoneCookie);
  assert.equal(list.status,200);assert.equal(list.data.name,'Werner de Vries');
  assert.match(list.headers.get('cache-control'),/no-store/);
  assert.deepEqual(list.data.items.map(x=>x.id).sort(),[id,second.data.id,again.data.id].sort());
  assert.deepEqual(Object.keys(list.data.items[0]).sort(),['date','format','id','start','title']);
  assert.deepEqual((await send('polls/mine',undefined,cookie(other))).data.items.map(p=>p.id),[other.data.id]);
  assert.equal((await send('polls/'+id+'/admin',undefined,cookie(other))).status,401);
  assert.equal((await send('polls/'+id+'/admin',undefined,phoneCookie)).status,200);
  assert.equal((await send('polls/hub',undefined,phoneCookie)).status,401);
  const publicView=await send('polls/'+id);
  assert.equal(publicView.status,200);
  assert.doesNotMatch(JSON.stringify(publicView.data),/Werner|organizer|verifier|password/i);
  assert.equal((await send('polls/'+id+'/login',{password:credentials.password})).status,200);
  const expired=await send('polls/mine',undefined,phoneCookie,undefined,now+12*3600000);
  assert.equal(expired.status,401);
  const out=await send('polls/mine/logout',{},phoneCookie);assert.match(out.headers.get('Set-Cookie'),/Max-Age=0/);
  assert.equal((await send('polls/'+id+'/admin',undefined,phoneCookie)).status,401);
  assert.equal((await send('polls/mine',undefined,own)).status,200);
});
test('a legacy organizer can link a whole series once while preserving its original link and password',async t=>{
  const {send,settings}=await setup(t);
  const oldPassword=randomBytes(14).toString('hex');
  const legacy=await send('polls',{settings,password:oldPassword});
  const path='polls/'+legacy.data.id,auth={Authorization:'Bearer '+legacy.data.token};
  const repeat=await send(path+'/admin',{action:'repeat',revision:1},auth);
  const credentials={organizerName:'Werner',password:'mijn-polls-wachtwoord'};
  assert.equal((await send(path+'/organizer',credentials)).status,401);
  const linked=await send(path+'/organizer',credentials,auth);
  assert.equal(linked.status,200);
  const own={Cookie:linked.headers.get('Set-Cookie').split(';')[0]};
  assert.deepEqual((await send('polls/mine',undefined,own)).data.items.map(r=>r.id).sort(),[legacy.data.id,repeat.data.id].sort());
  assert.equal((await send(path+'/admin',undefined,own)).data.hasOrganizer,true);
  assert.equal((await send(path+'/login',{password:oldPassword})).status,200);
  const other=await send('polls',{settings,organizerName:'Tessa',password:'andere-organisator'});
  const mismatch={Cookie:other.headers.get('Set-Cookie').split(';')[0],...auth};
  assert.equal((await send(path+'/organizer',{organizerName:'Tessa',useSession:true},mismatch)).status,409);
  assert.equal((await send(path+'/organizer',{organizerName:'Werner',useSession:true},{...own,...auth})).status,200);
});
test('simultaneous first polls with different passwords cannot claim the same organizer name',async t=>{
  const {app,send,settings}=await setup(t);
  const attempts=await Promise.all(['first-password','second-password'].map(password=>
    send('polls',{settings,organizerName:'Werner',password})));
  assert.deepEqual(attempts.map(r=>r.status).sort(),[201,401]);
  assert.equal(app.sql.prepare('SELECT count(*) AS n FROM poll_organizers').get().n,1);
  assert.equal(app.sql.prepare('SELECT count(*) AS n FROM poll_organizer_series').get().n,1);
});
