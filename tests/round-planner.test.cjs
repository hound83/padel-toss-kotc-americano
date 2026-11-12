const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const rounds = require('../round-planner.js');

const source = fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const start = source.indexOf('  function fitAmericanoStrength(');
const end = source.indexOf('  function amerImpact(',start);
const fit = new Function(source.slice(start,end)+'\nreturn fitAmericanoStrength;')();
const random = () => .5;

function ids(n){return Array.from({length:n},(_,i)=>i);}
function sort(players){return players.slice().sort((a,b)=>a-b);}

test('guided KOC sends the losing pair on court 1 to the waiting place',()=>{
  const first = rounds.startKocRounds({0:1,1:1,2:1,3:1,4:2,5:2,6:2,7:2,8:0,9:0},2,10,fit,random);
  assert.equal(rounds.nextKocRound([first],10,fit,random),null);
  first.matches[0].score = [16,16];
  first.matches[1].score = [20,12];
  assert.equal(rounds.nextKocRound([first],10,fit,random),null);
  first.matches[0].score = [17,16];
  const next = rounds.nextKocRound([first],10,fit,random);
  assert.deepEqual(sort(next.waiting),sort(first.matches[0].teams[1]));
  assert.deepEqual(sort(next.matches[0].teams.flat()),[6,7,8,9]);
  assert.deepEqual(sort(next.matches[1].teams.flat()),[0,1,4,5]);
  assert.ok(rounds.validKocRounds([first,next],2,10));
  assert.ok(!rounds.validKocRounds([first,{...next,waiting:[8,9]}],2,10));
});

test('all players keep a unique place across rounds and repeat partners are avoidable when balanced',()=>{
  for(const courts of [2,4,12]){
    const assignment = Object.fromEntries(ids(courts*4).map(i=>[i,Math.floor(i/4)+1]));
    const history = [rounds.startKocRounds(assignment,courts,courts*4,fit,random)];
    for(let i=0;i<10;i++){
      history.at(-1).matches.forEach((match,index)=>{match.score = index%2 ? [19,18] : [15,17];});
      history.push(rounds.nextKocRound(history,courts*4,fit,random));
      assert.ok(rounds.validKocRounds(history,courts,courts*4));
    }
  }
  const assignment = {0:1,1:1,2:1,3:1,4:2,5:2,6:2,7:2};
  assert.equal(rounds.startKocRounds({...assignment,7:0},2,8,fit,random),null);
  const first = rounds.startKocRounds(assignment,2,8,fit,random);
  first.matches.forEach(match=>{match.score=[17,16];});
  const next = rounds.nextKocRound([first],8,()=>new Float64Array(8),random);
  assert.notDeepEqual(next.matches[0].teams,first.matches[0].teams);
  assert.ok(next.matches.every(match=>match.teams.every(pair=>pair[0]<4 !== pair[1]<4)));
  const uneven = rounds.nextKocRound([first],8,()=>[.6,.6,0,0,-.6,-.6,0,0],random);
  assert.ok(uneven.matches[1].teams.every(pair=>pair[0]<4 !== pair[1]<4));
});

test('manual clock can be adjusted while running and resets to the start duration',()=>{
  let clock = rounds.createClock(720);
  clock = rounds.changeClock(clock,'set',1000,500);
  assert.equal(clock.deadline,null);
  clock = rounds.changeClock(clock,'start',2000);
  clock = rounds.changeClock(clock,'adjust',22000,-60);
  assert.equal(rounds.remainingMillis(clock,22000),420000);
  clock = rounds.changeClock(clock,'adjust',23000,60);
  assert.equal(rounds.remainingMillis(clock,24000),478000);
  clock = rounds.changeClock(clock,'pause',24000);
  assert.equal(rounds.remainingMillis(clock,900000),478000);
  clock = rounds.changeClock(clock,'reset',900000);
  assert.equal(rounds.remainingMillis(clock,910000),500000);
  assert.equal(clock.started,false);
  clock = rounds.changeClock(clock,'start',1000000);
  assert.equal(rounds.remainingMillis(clock,1500000),0);
  clock = rounds.changeClock(clock,'adjust',1500000,60);
  assert.equal(clock.deadline,null);
  assert.equal(rounds.remainingMillis(clock,1600000),60000);
});

test('schedule preview counts consecutive breaks and partnership repeats',()=>{
  const match = {team1:['Ada','Bo'],team2:['Cem','Dee']};
  const summary = rounds.summarizeSchedule([{rounds:[
    {round:1,courts:[match],resting:['Evi','Fay']},
    {round:2,courts:[match],resting:['Evi']},
    {round:4,courts:[match],resting:['Evi']}
  ]}]);
  assert.deepEqual(summary.rest,[['Evi',2]]);
  assert.deepEqual(summary.repeats,[{names:['Ada','Bo'],count:3},{names:['Cem','Dee'],count:3}]);
});
