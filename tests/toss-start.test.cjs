const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
function rng(seed) {
  return () => ((seed = Math.imul(seed,1664525)+1013904223 >>> 0) / 4294967296);
}
function scheduler(seed) {
  const random = rng(seed);
  const shuffle = list => {
    const result = list.slice();
    for (let i=result.length-1;i>0;i--) {
      const j=Math.floor(random()*(i+1));
      [result[i],result[j]]=[result[j],result[i]];
    }
    return result;
  };
  const source = html.slice(html.indexOf('  function usableCourts('),html.indexOf('  function splitCourtsBetween('));
  return new Function('shuffle',source+'\nreturn generateGlobalSchedule;')(shuffle);
}
const historySource=html.slice(html.indexOf('  function computeHistorySeed('),html.indexOf('  function findCutRound('));
const history=new Function(historySource+'\nreturn computeHistorySeed;')();
function players(n) { return Array.from({length:n},(_,i)=>'Player '+i); }
function playing(round) { return round.courts.flatMap(c=>c.team1.concat(c.team2)); }
function check(rounds, names, slots, previousRest=[]) {
  const counts=new Map(names.map(name=>[name,0]));
  for (const round of rounds) {
    const active=playing(round);
    assert.equal(active.length,slots);
    assert.deepEqual([...active,...round.resting].sort(),names.slice().sort());
    const repeated=round.resting.filter(name=>previousRest.includes(name));
    assert.equal(repeated.length,Math.max(0,previousRest.length-slots));
    active.forEach(name=>counts.set(name,counts.get(name)+1));
    previousRest=round.resting;
  }
  return [...counts.values()];
}
test('Toss fills each court and prevents consecutive rests across supported participant counts',()=>{
  for (let courts=2;courts<=12;courts++) {
    for (let n=4;n<=96;n++) {
      const names=players(n),slots=Math.min(courts,Math.floor(n/4))*4;
      for (let seed=1;seed<=4;seed++) {
        const rounds=scheduler(seed)(names,16,0,courts,null,{avoidConsecutiveRest:true});
        const counts=check(rounds,names,slots);
        assert.ok(Math.max(...counts)-Math.min(...counts)<=1,JSON.stringify({courts,n,seed,counts}));
      }
    }
  }
});
test('selected starters and multiple duos are guaranteed only for the first round',()=>{
  const names=players(24);
  for (let seed=1;seed<=80;seed++) {
    const options={avoidConsecutiveRest:true,firstRoundPlayers:[names[23],names[22]],
      firstRoundPairs:[[names[0],names[1]],[names[2],names[3]],[names[4],names[5]]]};
    const rounds=scheduler(seed)(names,7,0,3,null,options);
    const first=playing(rounds[0]);
    [...options.firstRoundPlayers,...options.firstRoundPairs.flat()].forEach(name=>assert.ok(first.includes(name)));
    for (const pair of options.firstRoundPairs) {
      assert.ok(rounds[0].courts.some(c=>[c.team1,c.team2].some(team=>pair.every(name=>team.includes(name)))));
    }
    const counts=check(rounds,names,12);
    assert.ok(Math.max(...counts)-Math.min(...counts)<=1);
    for (const pair of options.firstRoundPairs) {
      assert.ok(rounds[2].courts.every(c=>![c.team1,c.team2].some(team=>pair.every(name=>team.includes(name)))));
    }
  }
});
test('seeded regeneration respects the last frozen waiting list',()=>{
  const names=players(24);
  const before=scheduler(13)(names,3,0,3,null,{avoidConsecutiveRest:true});
  const frozen=before.slice(0,1);
  const seed=history(frozen,names);
  const after=scheduler(19)(names,7,1,3,seed,{avoidConsecutiveRest:true});
  check(after,names,12,frozen[0].resting);
  const total=new Map(names.map(name=>[name,seed.played[name]]));
  after.flatMap(playing).forEach(name=>total.set(name,total.get(name)+1));
  assert.equal(Math.max(...total.values())-Math.min(...total.values()),0);
});
test('roster changes do not bench a continuing player straight after a frozen rest',()=>{
  const old=players(24);
  const frozen=scheduler(4)(old,2,0,3,null,{avoidConsecutiveRest:true});
  const names=old.slice(0,20).concat(['New A','New B']);
  const seed=history(frozen,old.slice(0,20));
  const after=scheduler(17)(names,10,2,3,seed,{avoidConsecutiveRest:true});
  check(after,names,12,seed.previousRest.filter(name=>names.includes(name)));
});
test('impossible and overlapping first-round selections are rejected',()=>{
  const names=players(24),generate=scheduler(8);
  assert.throws(()=>generate(names,7,0,2,null,{firstRoundPlayers:names.slice(0,9)}),RangeError);
  assert.throws(()=>generate(names,7,0,2,null,{firstRoundPairs:[[names[0],names[1]],[names[1],names[2]]]}),RangeError);
  assert.throws(()=>generate(names,7,0,2,null,{firstRoundPairs:[[names[0],names[0]]]}),RangeError);
});
test('other formats keep their existing scheduler selection path',()=>{
  const names=players(18);
  const a=scheduler(25)(names,7,0,2);
  const b=scheduler(25)(names,7,0,2,null,{});
  assert.deepEqual(a,b);
});

const settingsSource=html.slice(html.indexOf('  function tossSessionSettings('),html.indexOf('  function renderTossSessionSettings('));
const settingsFor=state=>new Function('state',settingsSource+'\nreturn {error:tossSessionError,time:roundTimeText,court:displayedCourtNumber,settings:tossSessionSettings};')(state);

test('Toss times use exact duration and cross midnight explicitly',()=>{
  const settings=settingsFor({format:'toss',courts:2,tossPlan:{startTime:'23:50',roundMinutes:20,courtNumbers:[2,3]}});
  assert.equal(settings.time(1),'23:50\u201300:10 (+1)');
  assert.equal(settings.time(2),'00:10 (+1)\u201300:30 (+1)');
  assert.equal(settings.court(1),2);
  assert.equal(settings.court(2),3);
  assert.equal(settings.error(),'');
});
test('older Toss sessions keep default court numbers and hide times',()=>{
  const state={format:'toss',courts:2};
  const settings=settingsFor(state);
  assert.equal(settings.time(1),'');
  assert.equal(settings.court(2),2);
  assert.equal(settings.settings().roundMinutes,20);
  state.format='americano';
  state.tossPlan={startTime:'11:00',roundMinutes:20,courtNumbers:[2,3]};
  assert.equal(settings.time(1),'');
  assert.equal(settings.court(1),1);
});
test('Toss validates time, duration and duplicate court numbers',()=>{
  const state={format:'toss',courts:2,tossPlan:{startTime:'24:00',roundMinutes:20,courtNumbers:[2,3]}};
  const settings=settingsFor(state);
  assert.equal(settings.error(),'tossStartTimeError');
  state.tossPlan.startTime='11:00';
  state.tossPlan.roundMinutes=0;
  assert.equal(settings.error(),'tossRoundMinutesError');
  state.tossPlan.roundMinutes=20;
  state.tossPlan.courtNumbers=[3,3];
  assert.equal(settings.error(),'tossCourtNumbersError');
  assert.equal(settings.time(1),'');
});
