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

  function estimateKocStrength(games, playerCount, fitStrength, hintedPlayers){
    if (hintedPlayers.length !== 2){
      return games.length ? fitStrength(games, playerCount) : new Float64Array(playerCount);
    }
    const played = new Uint32Array(playerCount);
    games.forEach(game => game.players.forEach(player => {played[player]++;}));
    const hint = new Float64Array(playerCount);
    hintedPlayers.forEach(player => {
      hint[player] = -.12 * Math.max(0, 1-played[player]/6);
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

  function makeRound(number, byCourt, waiting, history, playerCount, fitStrength, random, {crossed = false, hintedPlayers = []}){
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
    const strength = estimateKocStrength(games,playerCount,fitStrength,hintedPlayers);
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

  return {startKocRounds,nextKocRound,roundComplete,validKocRounds,createClock,remainingMillis,changeClock,summarizeSchedule,validScore};
});
