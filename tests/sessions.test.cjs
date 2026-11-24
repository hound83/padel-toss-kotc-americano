const test=require('node:test');
const assert=require('node:assert/strict');

function fixture(){
  const names=['Emma','Jan','Noor','Pim','Ali','Jo','Sem','Sofie'];
  const ids=Object.fromEntries(names.map((n,i)=>[n,'person'+i]));
  const courts=[0,1].map((i)=>({courtIndex:i+1,team1:names.slice(4*i,4*i+2),team2:names.slice(4*i+2,4*i+4),entryTicket:'ticket'+i}));
  const state={format:'americano',activeRoster:names,activeRosterLevels:[],scores:{},laterAdditions:{},pools:[
    {id:'main',resultsEnabled:true,players:names,rounds:[{round:1,courts}]}]};
  const rows=courts.map(m=>({slot:'main-'+m.courtIndex+'-1',ticket:m.entryTicket,label:'Baan '+m.courtIndex,teams:[m.team1,m.team2],score:null}));
  return {state,view:{title:'Americano',en:false,rounds:[{n:1,rows}],boards:[{poolId:null,title:'Stand',unit:'Punten',rows:[]}],playerIds:ids}};
}
const week=7*86400000;
async function setup(t,doc=fixture()){
  const {localSessionApp}=await import('../sessions/local.mjs'),{api,cleanup}=await import('../sessions/api.mjs');
  const app=await localSessionApp();t.after(()=>app.close());
  let now=Date.now();
  async function send(path,body,secret,h={}){
    const headers={'CF-Connecting-IP':'test',...h};if(body!==undefined)headers['Content-Type']='application/json';
    if(secret)headers.Authorization='Bearer '+secret;
    const r=await api(new Request('https://club.test'+path,{method:body===undefined?'GET':'POST',headers,body:body===undefined?undefined:JSON.stringify(body)}),app.DB,now);
    return {status:r.status,...(r.status===304?{}:await r.json())};
  }
  const created=await send('/api/sessions',{...doc,playDate:new Date(now).toISOString().slice(0,10)});assert.equal(created.status,201);
  return {app,created,send,clock:delta=>{now+=delta;},cleanup:()=>cleanup(app.DB,now),owner:body=>send('/api/manage',body,created.secret),
    visitor:(code,body,h)=>send('/api/s/'+code,body,null,h)};
}
test('short links have separate roles, protected owner state and atomic results with the organizer offline',async t=>{
  const {created,send,owner,visitor}=await setup(t);
  const view=created.links[0].code;
  assert.match(view,/^[0-9A-HJKMNP-TV-Z]{8}$/);
  assert.match(created.secret,/^[0-9a-f]{48}$/);
  const viewer=await visitor(view.slice(0,4).toLowerCase()+'-'+view.slice(4).toLowerCase());
  assert.equal(viewer.role,'view');assert.equal(viewer.state,undefined);assert.equal(viewer.view.rounds[0].rows[0].ticket,undefined);
  assert.equal((await send('/api/manage',undefined,view)).status,404);
  assert.equal((await visitor(view,{})).status,403);
  const group=await owner({action:'mode',mode:'group',revision:1});
  const {code}=await owner({action:'link',revision:group.revision});
  const data={slot:'main-1-1',ticket:'ticket0',player:'person0',score:[21,17]};
  assert.equal((await visitor(code,{...data,player:'person6'})).status,403);
  assert.equal((await visitor(code,{...data,score:[-2,20]})).status,422);
  const submitted=[data,{...data,score:[22,16]}];
  const responses=await Promise.all(submitted.map(entry=>visitor(code,entry)));
  assert.deepEqual(responses.map(response=>response.status).sort(),[200,409]);
  const [t1,t2]=submitted[responses.findIndex(response=>response.status===200)].score;
  const master=await owner();assert.deepEqual(master.state.scores[data.slot],{t1,t2});
  const board=(await visitor(view)).view.boards[0].rows;assert.ok(board.some(r=>r[1]==='Emma' && r[2]===t1));
  assert.equal((await owner({action:'save',revision:group.revision,document:fixture()})).status,409);
  const personal=await owner({action:'mode',revision:master.revision,mode:'personal'});
  assert.equal((await visitor(code)).status,404);
  const link=await owner({action:'link',revision:personal.revision,player:'person4'});
  const selected=await visitor(link.code);assert.equal(selected.player,'person4');
  const second={slot:'main-2-1',ticket:'ticket1',player:'person4',score:[8,3]};
  assert.equal((await visitor(link.code,{...second,player:'person5'})).status,403);
  assert.equal((await visitor(link.code,second)).status,200);
  const current=await owner();const closed=await owner({action:'close',revision:current.revision});
  assert.equal(closed.closed,true);assert.equal((await visitor(view)).view.closed,true);
  assert.equal((await visitor(link.code,second)).status,409);
});
test('two different courts can finish together and pending tickets cannot overwrite a correction',async t=>{
  const {owner,visitor}=await setup(t);
  const {revision}=await owner({action:'mode',revision:1,mode:'group'});
  const {code}=await owner({action:'link',revision});
  const scores=await Promise.all([0,1].map(i=>visitor(code,{slot:'main-'+(i+1)+'-1',ticket:'ticket'+i,player:'person'+(4*i),score:[21,17]})));
  assert.deepEqual(scores.map(r=>r.status),[200,200]);
  const current=await owner();assert.equal(Object.keys(current.state.scores).length,2);
  const doc=fixture();doc.state.scores['main-1-1']={t1:16,t2:null};
  doc.view.rounds[0].rows[0].score=[16,null];delete doc.view.rounds[0].rows[0].ticket;
  assert.equal((await owner({action:'save',revision:current.revision,document:doc})).status,200);
  assert.equal((await visitor(code,{slot:'main-1-1',ticket:'ticket0',player:'person0',score:[28,12]})).status,409);
});
test('a visit and a repeated save do not renew seven-day expiry, cleanup removes links and counts',async t=>{
  const {app,created,owner,visitor,clock,cleanup}=await setup(t);
  const code=created.links[0].code;
  clock(week-100);
  assert.equal((await owner({action:'save',revision:1,document:fixture()})).revision,1);
  assert.equal((await visitor(code)).status,200);
  assert.equal((await visitor(code,undefined,{'If-None-Match':'1'})).status,304);
  clock(101);
  assert.equal((await visitor(code)).status,404);assert.equal((await owner()).status,404);
  await cleanup();assert.equal(app.sql.prepare('SELECT count(*) n FROM sessions').get().n,0);
  assert.equal(app.sql.prepare('SELECT count(*) n FROM links').get().n,0);
});
test('opening and closing extend the correct expiry and repeated invalid codes are throttled',async t=>{
  const {created,owner,visitor,clock}=await setup(t);
  clock(week-1);const closed=await owner({action:'close',revision:1});
  assert.equal(closed.expires-created.expires,week-1);
  clock(week-1);assert.equal((await visitor(created.links[0].code)).status,200);
  clock(1);assert.equal((await visitor(created.links[0].code)).status,404);
  let result;for(let i=0;i<31;i++)result=await visitor('invalid');assert.equal(result.status,429);
});
test('guided KOC accepts the current round only and needs a deciding rally',async t=>{
  const doc=fixture(),m={court:1,teams:[[0,1],[2,3]],score:[null,null],entryTicket:'ticket0'};
  doc.state.format='koc';doc.state.koc={guided:true,roundPlan:[{number:1,matches:[m]}]};
  doc.view.boards=[];doc.view.rounds[0].rows.splice(1);doc.view.rounds[0].rows[0].slot='koc-1-1';
  const {owner,visitor}=await setup(t,doc);const mode=await owner({action:'mode',revision:1,mode:'group'});
  const {code}=await owner({action:'link',revision:mode.revision});
  const base={slot:'koc-1-1',ticket:'ticket0',player:'person0'};
  assert.equal((await visitor(code,{...base,score:[20,20]})).status,422);
  assert.equal((await visitor(code,{...base,score:[21,20]})).status,200);
  assert.deepEqual((await owner()).state.koc.roundPlan[0].matches[0].score,[21,20]);
});

test('cold requests finish independently; a complete or warm D1 schema needs no schema writes',async()=>{
  const {schemaInitializer,needsSchema}=await import('../sessions/schema-init.mjs');
  const schema='CREATE TABLE IF NOT EXISTS sample (id TEXT); CREATE INDEX IF NOT EXISTS sample_id ON sample(id);';
  const initialize=schemaInitializer(schema),release=[];
  let written=0,complete=false,reads=0;
  const db={prepare(sql){
    return {bind:(...names)=>({first:async()=>{
      assert.deepEqual(names,['sample','sample_id']);reads++;
      if(!complete)await new Promise(resolve=>release.push(resolve));
      return {total:complete?2:0};
    }})};
  },batch:async items=>{assert.equal(items.length,2);written++;complete=true;}};
  const pending=initialize(db),next=initialize(db);
  assert.equal(release.length,2);
  release[1]();await next;assert.equal(written,1);
  release[0]();await pending;await initialize(db);assert.equal(reads,2);assert.equal(written,1);
  await schemaInitializer(schema)(db);assert.equal(reads,3);assert.equal(written,1);
  for(const path of ['/api/polls/mine','/api/polls/mine/status','/api/polls/hub/organizers']){
    assert.equal(needsSchema(new Request('https://club.test'+path),path),false);
    assert.equal(needsSchema(new Request('https://club.test'+path,{headers:{Cookie:'example=x'}}),path),true);
  }
  const path='/api/polls/mine/login';
  assert.equal(needsSchema(new Request('https://club.test'+path,{method:'POST'}),path),true);
  assert.equal(needsSchema(new Request('https://club.test/api/polls/00000000000000'),'/api/polls/00000000000000'),true);
});
