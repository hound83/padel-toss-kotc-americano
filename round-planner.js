(function(root, factory){
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PadelRounds = api;
})(globalThis, function(){
  'use strict';

  function chooseTeams(players, strength, partnerCounts, recentPartners, disadvantage, random){
    const [a,b,c,d] = players;
    const candidates = [[[a,b],[c,d]], [[a,c],[b,d]], [[a,d],[b,c]]].map(teams => {
      const margin = teams[0].reduce((n,p) => n + strength[p], 0)
        - teams[1].reduce((n,p) => n + strength[p], 0);
      const underdogs = teams[margin >= 0 ? 1 : 0];
      const accumulated = underdogs.reduce((n,p) => n + disadvantage[p], 0);
      const repeats = teams.reduce((n,pair) => {
        const key = pair.slice().sort((x,y) => x-y).join(':');
        return n + (recentPartners.has(key) ? 2 : 0) + Math.min(3, partnerCounts.get(key) || 0);
      }, 0);
      return {teams, gap:Math.abs(margin), cost: accumulated * Math.abs(margin) + .025 * repeats, random:random()};
    });
    const bestGap = Math.min(...candidates.map(candidate => candidate.gap));
    return candidates.filter(candidate => candidate.gap <= bestGap + .05)
      .sort((left,right) => left.cost-right.cost || left.gap-right.gap || left.random-right.random)[0].teams;
  }

  function validScore(value){
    return Number.isSafeInteger(value) && value >= 0;
  }

  function chooseCrossedTeams([a,b,c,d], strength, random){
    const firstGap = Math.abs(strength[a]+strength[c]-strength[b]-strength[d]);
    const secondGap = Math.abs(strength[a]+strength[d]-strength[b]-strength[c]);
    const first = Math.abs(firstGap-secondGap) > .025 ? firstGap < secondGap : random() < .5;
    return first ? [[a,c],[b,d]] : [[a,d],[b,c]];
  }

  function estimateKocStrength(games, playerCount, fitStrength, hintedPlayers, levels){
    if (hintedPlayers.length !== 2 && !levels.some(Boolean)){
      return games.length ? fitStrength(games, playerCount) : new Float64Array(playerCount);
    }
    const played = new Uint32Array(playerCount);
    games.forEach(game => game.players.forEach(player => {played[player]++;}));
    const hint = new Float64Array(playerCount);
    (hintedPlayers.length === 2 ? hintedPlayers : []).forEach(player => {
      hint[player] = -.12 * Math.max(0, 1-played[player]/6);
    });
    levels.forEach((value,player) => {
      if (value === -1 || value === 1) hint[player] = .15 * value * Math.max(0,1-played[player]/6);
    });
    // Fit the remaining score difference around the fading starting estimate.
    const adjusted = games.map(({players,margin}) => {
      const [a,b,c,d] = players;
      return {players, margin:margin-(hint[a]+hint[b]-hint[c]-hint[d])};
    });
    return fitStrength(adjusted,playerCount).map((strength,player) => strength+hint[player]);
  }

  function roundComplete(round){
    return round.matches.every(match => match.score.every(validScore) && match.score[0] !== match.score[1]);
  }

  function makeRound(number, byCourt, waiting, history, playerCount, fitStrength, random, {crossed = false, hintedPlayers = [], levels = []}){
    const crossArrivals = crossed && number > 1;
    const games = [];
    const partnerCounts = new Map();
    const recentPartners = new Set();
    history.forEach((round,index) => round.matches.forEach(match => {
      const players = match.teams.flat();
      const [left,right] = match.score;
      games.push({players, margin:(left-right)/Math.max(1,left+right)});
      if (crossArrivals) return;
      match.teams.forEach(pair => {
        const key = pair.slice().sort((a,b) => a-b).join(':');
        partnerCounts.set(key, (partnerCounts.get(key) || 0) + 1);
        if (index === history.length-1) recentPartners.add(key);
      });
    }));
    const strength = estimateKocStrength(games,playerCount,fitStrength,hintedPlayers,levels);
    const disadvantage = new Float64Array(playerCount);
    if (!crossArrivals) games.forEach(game => {
      const [a,b,c,d] = game.players;
      const gap = strength[a]+strength[b]-strength[c]-strength[d];
      (gap > 0 ? [c,d] : [a,b]).forEach(player => {disadvantage[player] += Math.abs(gap);});
    });
    const matches = byCourt.slice(1).map((players,index) => ({
      court:index+1, teams:crossArrivals ? chooseCrossedTeams(players,strength,random)
        : chooseTeams(players,strength,partnerCounts,recentPartners,disadvantage,random),
      score:[null,null]
    }));
    return {number,matches,waiting:waiting.slice()};
  }

  function startKocRounds(assignment, courts, playerCount, fitStrength, random = Math.random, options = {}){
    const byCourt = Array.from({length:courts+1}, () => []);
    Object.keys(assignment).forEach(key => byCourt[assignment[key]].push(Number(key)));
    if (byCourt.slice(1).some(players => players.length !== 4) || ![0,2].includes(byCourt[0].length)) return null;
    return makeRound(1,byCourt,byCourt[0],[],playerCount,fitStrength,random,options);
  }

  function nextKocRound(rounds, playerCount, fitStrength, random = Math.random, options = {}){
    const last = rounds.at(-1);
    if (!last || !roundComplete(last)) return null;
    const courts = last.matches.length;
    const byCourt = Array.from({length:courts+1}, () => []);
    last.matches.forEach(match => {
      const winner = match.score[0] > match.score[1] ? 0 : 1;
      byCourt[Math.min(courts,match.court+1)].push(...match.teams[winner]);
      const lower = match.court === 1 && last.waiting.length ? 0 : Math.max(1,match.court-1);
      byCourt[lower].push(...match.teams[1-winner]);
    });
    byCourt[1].push(...last.waiting);
    return makeRound(last.number+1,byCourt,byCourt[0],rounds,playerCount,fitStrength,random,options);
  }

  function validKocRounds(rounds,courts,rosterSize){
    if (!Array.isArray(rounds) || !rounds.length) return false;
    const firstRoundPlayers = new Set();
    return rounds.every((round,index) => {
      if (!round || round.number !== index+1 || !Array.isArray(round.waiting) ||
          ![0,2].includes(round.waiting.length) || !Array.isArray(round.matches) ||
          round.matches.length !== courts) return false;
      const validMatches = round.matches.every((match,i) => match && match.court === i+1 &&
        Array.isArray(match.teams) && match.teams.length === 2 &&
        match.teams.every(team => Array.isArray(team) && team.length === 2) &&
        Array.isArray(match.score) && match.score.length === 2 &&
        match.score.every(score => score === null || validScore(score)));
      if (!validMatches || (index < rounds.length-1 && !roundComplete(round))) return false;
      const players = [...round.matches.flatMap(match => match.teams.flat()),...round.waiting];
      if (!index) players.forEach(player => firstRoundPlayers.add(player));
      return new Set(players).size === players.length && players.length === firstRoundPlayers.size &&
        players.every(player => Number.isInteger(player) && player >= 0 && player < rosterSize && firstRoundPlayers.has(player));
    });
  }

  function createClock(seconds){
    return {initial:seconds, remaining:seconds*1000, deadline:null, started:false};
  }

  function remainingMillis(clock, now){
    return clock.deadline === null ? clock.remaining : Math.max(0,clock.deadline-now);
  }

  function changeClock(clock, action, now, seconds){
    const remaining = remainingMillis(clock,now);
    const running = clock.deadline !== null && remaining > 0;
    if (action === 'set' && !clock.started) return createClock(seconds);
    if (action === 'reset' && !running) return createClock(clock.initial);
    if (action === 'start' && !running && remaining > 0){
      return {...clock, remaining, deadline:now+remaining, started:true};
    }
    if (action === 'pause' && running) return {...clock, remaining, deadline:null};
    if (action === 'adjust'){
      const updated = Math.min(5999000,Math.max(0,remaining+seconds*1000));
      return {...clock, remaining:updated, deadline:running && updated ? now+updated : null};
    }
    return clock;
  }

  function summarizeSchedule(pools){
    const rounds = new Map();
    const partners = new Map();
    pools.forEach(pool => pool.rounds.forEach(round => {
      if (!rounds.has(round.round)) rounds.set(round.round,new Set());
      (round.resting || []).forEach(name => rounds.get(round.round).add(name));
      round.courts.forEach(match => [match.team1,match.team2].forEach(team => {
        const names = team.slice().sort();
        const key = JSON.stringify(names);
        if (!partners.has(key)) partners.set(key,{names,count:0});
        partners.get(key).count++;
      }));
    }));
    const rest = new Map();
    let previous = new Map(), previousRound = 0;
    [...rounds.keys()].sort((a,b) => a-b).forEach(number => {
      const current = new Map();
      rounds.get(number).forEach(name => {
        const streak = 1 + (number === previousRound+1 ? previous.get(name) || 0 : 0);
        current.set(name,streak);
        rest.set(name,Math.max(rest.get(name) || 0,streak));
      });
      previous = current;
      previousRound = number;
    });
    return {
      rest:[...rest].filter(([,count]) => count >= 2).sort((a,b) => b[1]-a[1]),
      repeats:[...partners.values()].filter(pair => pair.count >= 2).sort((a,b) => b.count-a.count)
    };
  }

  // Groups are indexed by court number. Group zero is the waiting list.
  function arrangeOpening(groups,pairs,priority=()=>0,{spread=false,previousAssignment}={}){
    const home=new Map(groups.flatMap((row,c)=>row.map(id=>[id,c])));
    const active=pairs.filter(([a,b])=>home.has(a) && home.has(b));
    if(!active.length)return groups.map(row=>row.slice());
    const used=new Set(active.flat());
    const units=[...active,...groups.flat().filter(id=>!used.has(id)).map(id=>[id])];
    const weight=unit=>Math.max(...unit.map(priority));
    units.sort((a,b)=>weight(b)-weight(a) || b.length-a.length);
    const space=groups.map(row=>row.length),allocated=groups.map(()=>[]);
    let remainingPairs=active.length;
    for(const unit of units){
      if(unit.length===2)remainingPairs--;
      const candidates=[];
      for(let c=0;c<space.length;c++){
        if(space[c]<unit.length)continue;
        if(spread && c===0 && !unit.some(id=>home.get(id)===0))continue;
        space[c]-=unit.length;
        const canFit=space.reduce((n,free)=>n+Math.floor(free/2),0)>=remainingPairs;
        space[c]+=unit.length;
        if(!canFit)continue;
        const atHome=unit.filter(id=>home.get(id)===c);
        const fixed=atHome.reduce((sum,id)=>sum+priority(id),0);
        const fit=10*atHome.length+fixed-unit.reduce((sum,id)=>sum+Math.abs(home.get(id)-c)*0.1,0);
        const spreadPair=spread && unit.length===2 && c!==0;
        candidates.push({court:c,fixed:spread?fixed:0,fit,
          duos:spreadPair?allocated[c].filter(other=>other.length===2).length:0,
          repeat:spreadPair && previousAssignment && unit.every(id=>previousAssignment[id]===c)?1:0});
      }
      if(!candidates.length)return null;
      // Waiting, seeded and entry places come first. Free duos then seek
      // separate courts, a fresh court on a redraw and finally their drawn seats.
      candidates.sort((a,b)=>b.fixed-a.fixed || a.duos-b.duos || a.repeat-b.repeat || b.fit-a.fit);
      const best=candidates[0].court;
      space[best]-=unit.length;allocated[best].push(unit);
    }
    return allocated.map((units,c)=>{
      const original=groups[c],rank=id=>original.includes(id)?original.indexOf(id):original.length;
      const ordered=units.sort((a,b)=>Math.min(...a.map(rank))-Math.min(...b.map(rank)));
      const duos=ordered.filter(unit=>unit.length===2),singles=ordered.filter(unit=>unit.length===1);
      // A chosen duo must occupy one side of the net, including when it is the second team.
      if(duos.length===1 && singles.length>=2 && rank(singles[1][0])<Math.min(...duos[0].map(rank)))return singles.slice(0,2).flat().concat(duos.flat(),singles.slice(2).flat());
      return duos.flat().concat(singles.flat());
    });
  }

  function openingMove(groups,pairs,from,to){
    const a=Number(from),vacant=String(to).startsWith('vacant-');
    const locate=id=>groups.findIndex(row=>row.includes(id));
    const src=locate(a),dest=vacant?Number(String(to).split('-')[1]):locate(Number(to));
    if(src<0 || dest<0 || !groups[dest] || String(from)===String(to))return null;
    const source=groups[src],target=groups[dest];
    const members=(id,row)=>pairs.find(pair=>pair.includes(id) && pair.every(p=>row.includes(p))) || [id];
    let take=members(a,source).slice();
    function finish(result){
      // Closing a gap must also keep a pair on one side of the net on the source court.
      for(const c of new Set([src,dest])){
        const row=result[c],paired=pairs.filter(pair=>pair.every(id=>row.includes(id)));
        if(paired.some(([x,y])=>Math.floor(row.indexOf(x)/2)!==Math.floor(row.indexOf(y)/2))){
          const grouped=arrangeOpening([row],paired);if(!grouped)return null;
          result[c]=grouped[0];
        }
      }
      const targets=take.map(id=>{
        const seat=result[dest].indexOf(id);return target[seat] ?? 'vacant-'+dest+'-'+seat;
      });
      return {groups:result,take,targets};
    }
    if(vacant){
      if(!src || !dest || src===dest || target.length+take.length>4)return null;
      const result=groups.map(row=>row.slice());
      result[src]=source.filter(id=>!take.includes(id));result[dest]=target.concat(take);
      return finish(result);
    }
    const b=Number(to);
    let give=members(b,target).slice();
    if(take.includes(b))return null;
    function complete(unit,row,excluded){
      if(unit.length===2)return unit;
      const start=row.indexOf(unit[0]);
      const first=row[start%2===0?start+1:start-1];
      const mate=[first,...row].find(id=>id!=null && id!==unit[0] && !excluded.includes(id) && members(id,row).length===1);
      if(mate==null)return null;
      return [unit[0],mate].sort((x,y)=>row.indexOf(x)-row.indexOf(y));
    }
    if(take.length!==give.length){
      if(take.length===1)take=complete(take,source,give);
      else give=complete(give,target,take);
      if(!take || !give)return null;
    }
    take.sort((x,y)=>source.indexOf(x)-source.indexOf(y));
    give.sort((x,y)=>target.indexOf(x)-target.indexOf(y));
    const exchange=new Map(take.flatMap((id,i)=>[[id,give[i]],[give[i],id]]));
    const changed=groups.map((row,c)=>c===src || c===dest?row.map(id=>exchange.get(id)??id):row.slice());
    return finish(changed);
  }

  function rosterMove(groups,pairs,a,b,insert=true){
    const src=groups.findIndex(row=>row.includes(a)),dest=groups.findIndex(row=>row.includes(b));
    if(src<0 || dest<0 || a===b)return null;
    const source=groups[src],target=groups[dest],result=groups.map(row=>row.slice());
    const unit=(id,row)=>row.filter(p=>(pairs.find(pair=>pair.includes(id)) || [id]).includes(p));
    let take=unit(a,source),give=unit(b,target);
    if(take.includes(b))return null;
    if(src===dest && insert){
      const remaining=source.filter(id=>!take.includes(id));
      const forward=source.indexOf(a)<source.indexOf(b);
      const at=forward?remaining.indexOf(give.at(-1))+1:remaining.indexOf(give[0]);
      remaining.splice(at,0,...take);result[src]=remaining;
    }else{
      const fill=(items,row,exclude)=>{
        if(items.length===2)return items;
        const i=row.indexOf(items[0]);
        const neighbor=[row[i+1],row[i-1]].find(id=>id!=null && !exclude.includes(id) && unit(id,row).length===1);
        return neighbor==null?null:row.filter(id=>items.includes(id) || id===neighbor);
      };
      if(take.length!==give.length){
        if(take.length===1)take=fill(take,source,give);
        else give=fill(give,target,take);
        if(!take || !give)return null;
      }
      const exchange=new Map(take.flatMap((id,i)=>[[id,give[i]],[give[i],id]]));
      for(const g of new Set([src,dest]))result[g]=groups[g].map(id=>exchange.get(id)??id);
    }
    const positions=take.map(id=>result[dest].indexOf(id));
    return {groups:result,take,positions,targets:positions.map(i=>target[i]),dest};
  }

  return {rosterMove,arrangeOpening,openingMove,startKocRounds,nextKocRound,roundComplete,validKocRounds,createClock,remainingMillis,changeClock,summarizeSchedule,validScore};
});
