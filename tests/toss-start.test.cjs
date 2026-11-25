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
test('opening pairs spread across courts, team sides and opponents on a new draw',()=>{
  const roster=players(20), pairs=[roster.slice(0,2),roster.slice(2,4),roster.slice(4,6),roster.slice(6,8)];
  const places=new Set(), opponents=new Set(), otherPairs=new Set();
  for(let seed=1;seed<=120;seed++){
    for(const [courts,count] of [[4,1],[4,2],[3,3],[2,3],[2,4],[1,2]]){
      const chosen=pairs.slice(0,count);
      const [opening]=scheduler(seed)(roster,1,0,[courts],null,{firstRoundPairs:chosen});
      const teams=opening.courts.flatMap(court=>[court.team1,court.team2]);
      const positions=chosen.map(pair=>teams.findIndex(team=>pair.every(name=>team.includes(name))));
      assert.ok(positions.every(i=>i>=0),'every opening pair plays together');
      const usedCourts=new Set(positions.map(i=>Math.floor(i/2)));
      assert.equal(usedCourts.size,Math.min(courts,count),'use each available court before placing a second pair');
      check([opening],roster,4*courts);
      const opponent=teams[positions[0]%2===0?positions[0]+1:positions[0]-1];
      if(courts===4 && count===2){
        places.add(positions[0]);
        opponents.add(opponent.slice().sort().join('|'));
      }
      if(courts===2 && count===4)otherPairs.add(pairs.findIndex(pair=>pair.every(name=>opponent.includes(name))));
    }
  }
  assert.equal(places.size,8,'a pair can start on either side of every court');
  assert.ok(opponents.size>1,'the opposing singles vary between draws');
  assert.deepEqual([...otherPairs].sort(),[1,2,3],'when every team is linked the opponents still vary');
});

test('redrawing two starting duos moves each to another available court',()=>{
  const roster=players(16),firstRoundPairs=[roster.slice(0,2),roster.slice(2,4)];
  for(const courts of [2,3,4]){
    let previous;
    for(let i=1;i<=30;i++){
      const [next]=scheduler(i)(roster,1,0,courts,null,{firstRoundPairs,previousOpeningCourts:previous?.courts});
      const place=(round,duo)=>round.courts.findIndex(c=>[c.team1,c.team2].some(team=>duo.every(name=>team.includes(name))));
      if(previous)for(const duo of firstRoundPairs)assert.notEqual(place(previous,duo),place(next,duo));
      previous=next;
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
  assert.equal(settings.time(1),'11:00\u201311:20');
  assert.equal(settings.court(1),2);
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

test('final rest is a preference, courts stay full and waiting twice takes priority',()=>{
  const names=players(12),duo=[names[0],names[1]];
  for(let seed=1;seed<=60;seed++){
    const rounds=scheduler(seed)(names,7,0,2,null,{avoidConsecutiveRest:true,lastRest:names.slice(6),firstRoundPairs:[duo]});
    const counts=check(rounds,names,8);
    assert.ok(rounds.at(-1).resting.every(n=>names.slice(6).includes(n)));
    assert.ok(Math.max(...counts)-Math.min(...counts)<=2);
  }
  const seed={previousRest:[names[0],names[1],names[2],names[3]]};
  const [last]=scheduler(4)(names,1,6,2,seed,{avoidConsecutiveRest:true,lastRest:names.slice(0,4)});
  assert.ok(seed.previousRest.every(n=>playing(last).includes(n)));
});
test('paired players share attendance where feasible and optional levels balance equal-history doubles',()=>{
  const names=players(12), duo=names.slice(0,2);
  for(let seed=1;seed<=50;seed++){
    const rounds=scheduler(seed)(names,7,0,2,null,{avoidConsecutiveRest:true,firstRoundPairs:[duo]});
    check(rounds,names,8);
    assert.ok(rounds.every(r=>r.resting.includes(duo[0])===r.resting.includes(duo[1])));
    const four=names.slice(0,4), levels=Object.fromEntries(four.map((name,i)=>[name,i<2?-1:1]));
    const [opening]=scheduler(seed)(four,1,0,1,null,{levels});
    assert.equal(opening.courts[0].team1.reduce((sum,n)=>sum+levels[n],0),0);
  }
});
