const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {performance} = require('node:perf_hooks');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const start = html.indexOf('  function fitAmericanoStrength(');
const end = html.indexOf('  function signedBalance(', start);
assert.ok(start >= 0 && end > start);
const ranking = new Function('state','scoreKey','activeRosterForPool',
  html.slice(start,end) + '\nreturn {computeTotals,rankPlayers,assessAmericanoStrength,neutralScoreRange};');
const scoreKey = (pool,court,round) => `${pool}-${court}-${round}`;

function fixture(playerCount=40,courts=9,rounds=12){
  const players = Array.from({length:playerCount},(_,i)=>`Speler ${i+1}`);
  const ability = Object.fromEntries(players.map((name,i)=>[name,(i / (playerCount - 1) - .5) * .45]));
  let seed = 30291;
  function random(){
    seed = (Math.imul(1664525,seed)+1013904223) >>> 0;
    return seed / 4294967296;
  }
  const pool={id:'main',players,resultsEnabled:true,rounds:[]};
  const state={format:'americano',pools:[pool],scores:{},laterAdditions:{}};
  for(let round=1;round<=rounds;round++){
    const order=players.slice();
    for(let i=order.length-1;i>0;i--){
      const j=Math.floor(random()*(i+1));
      [order[i],order[j]]=[order[j],order[i]];
    }
    const games=[];
    for(let court=1;court<=courts;court++){
      const names=order.slice((court-1)*4,court*4);
      const [a,b,c,d]=names.map(name=>ability[name]);
      const t1=Math.round(16*(1+a+b-c-d)+(random()-.5)*4);
      games.push({courtIndex:court,team1:names.slice(0,2),team2:names.slice(2)});
      state.scores[scoreKey('main',court,round)]={t1,t2:32-t1};
    }
    pool.rounds.push({round,courts:games});
  }
  return {state,pool,api:ranking(state,scoreKey,()=>players)};
}

test('held-out rounds favour a lineup-aware estimate on a structured 40-player competition',()=>{
  const {state,pool,api}=fixture();
  const games=pool.rounds.flatMap(rd=>rd.courts.map(court=>({round:rd.round,
    players:court.team1.concat(court.team2).map(name=>pool.players.indexOf(name)),
    margin:(state.scores[scoreKey('main',court.courtIndex,rd.round)].t1-16)/16})));
  const model=api.assessAmericanoStrength(games,pool.players.length);
  assert.ok(model);
  assert.ok(model.modelError < model.baselineError);
  console.log(`Held-out MAE at 32 points: average ${(16*model.baselineError).toFixed(2)}, weighted ${(16*model.modelError).toFixed(2)}`);
  const results=api.computeTotals();
  assert.equal(results.weighted,true);
  const projected=Object.values(results.totals).find(row=>row.projection);
  assert.ok(projected);
  const {count,score,length,residuals}=projected.projection;
  assert.equal(projected.adjPoints,projected.points+count*score);
  assert.equal(projected.adjDiff,projected.forPts-projected.againstPts+count*(2*score-length));
  assert.equal(projected.rankDiff,projected.adjDiff-projected.drawEffect);
  const range=api.neutralScoreRange(score,length,residuals);
  assert.deepEqual(api.neutralScoreRange(score,length,residuals),range);
  assert.ok(range.low>=0&&range.high<=length&&range.low<=range.high);
  state.laterAdditions[projected.name]=true;
  const late=api.computeTotals().totals[projected.name];
  assert.equal(late.projection,undefined);
  assert.equal(late.adjPoints,late.points);
  delete state.scores['main-1-12'];
  assert.ok(Object.values(api.computeTotals().totals).every(row=>!row.projection),'estimates wait for phase completion');
});

test('sparse or neutral evidence retains the proportional adjustment',()=>{
  const {state,api}=fixture(40,9,3);
  Object.values(state.scores).forEach(score=>{score.t1=score.t2=16;});
  const result=api.computeTotals();
  assert.equal(result.weighted,false);
  for(const row of Object.values(result.totals)){
    assert.equal(row.rankDiff,row.adjDiff);
    assert.equal(row.projection,undefined);
    if(row.recalcDir==='up') assert.equal(row.adjPoints,Math.round(row.points/row.played*result.referenceGames));
  }
});

test('ranking margin precedes head-to-head and three-way ties share rank',()=>{
  const {api}=fixture();
  const totals={A:{name:'A',adjPoints:60,rankDiff:3},B:{name:'B',adjPoints:60,rankDiff:4}};
  const h2h={A:{B:8},B:{A:-8}};
  assert.deepEqual(api.rankPlayers(totals,h2h).map(row=>row.name),['B','A']);
  totals.A.rankDiff=4;
  assert.deepEqual(api.rankPlayers(totals,h2h).map(row=>row.name),['A','B']);
  totals.C={name:'C',adjPoints:60,rankDiff:4};
  totals.D={name:'D',adjPoints:59,rankDiff:10};
  assert.deepEqual(api.rankPlayers(totals,h2h).map(row=>row.rank),[1,1,1,4]);
});

test('large competition recomputes and reuses the fit',()=>{
  const {api,state}=fixture(96,12,16);
  const start=performance.now();
  for(let i=0;i<10;i++){
    state.scores['main-1-1']={t1:10+i,t2:22-i};
    api.computeTotals();
  }
  const cold=(performance.now()-start)/10;
  const cachedStart=performance.now();
  for(let i=0;i<10;i++)api.computeTotals();
  const cached=(performance.now()-cachedStart)/10;
  console.log(`96 players, 192 matches: ${cold.toFixed(1)} ms recalculation; ${cached.toFixed(1)} ms cached`);
});
