(function(root,factory){
  if(typeof module==='object' && module.exports)module.exports=factory;
  else root.createPadelRanking=factory;
})(globalThis,function createPadelRanking(getState,scoreKey,activeRosterForPool){
  // A game's normalized margin estimates the sum of two player effects minus
  // the other two. Ridge shrinkage pulls poorly supported effects toward zero.
  function fitAmericanoStrength(games, playerCount){
    var matrix = Array.from({length:playerCount}, function(){return new Float64Array(playerCount);});
    var rhs = new Float64Array(playerCount);
    for (var i = 0; i < playerCount; i++) matrix[i][i] = 3;
    games.forEach(function(game){
      game.players.forEach(function(a, x){
        var sign = x < 2 ? 1 : -1;
        rhs[a] += sign * game.margin;
        game.players.forEach(function(b, y){matrix[a][b] += y < 2 ? sign : -sign;});
      });
    });
    // In-place Cholesky factorization and triangular solves. The positive
    // ridge penalty keeps the system solvable even with fixed pairings.
    for (var row = 0; row < playerCount; row++){
      for (var col = 0; col <= row; col++){
        var value = matrix[row][col];
        for (var k = 0; k < col; k++) value -= matrix[row][k] * matrix[col][k];
        matrix[row][col] = row === col ? Math.sqrt(value) : value / matrix[col][col];
      }
      for (var j = 0; j < row; j++) rhs[row] -= matrix[row][j] * rhs[j];
      rhs[row] /= matrix[row][row];
    }
    for (var row = playerCount - 1; row >= 0; row--){
      for (var j = row + 1; j < playerCount; j++) rhs[row] -= matrix[j][row] * rhs[j];
      rhs[row] /= matrix[row][row];
    }
    return rhs;
  }

  function amerImpact(game, strength, side){
    var p = game.players;
    return (strength[p[0]] + strength[p[1]] - strength[p[2]] - strength[p[3]]) * side;
  }

  function assessAmericanoStrength(games, playerCount){
    if (games.length < 12 || new Set(games.map(function(game){return game.round;})).size < 3){
      return {status:'few',model:null};
    }
    var baselineError = 0, neutralError = 0, modelError = 0, observations = 0, residuals = [];
    for (var fold = 0; fold < 3; fold++){
      var training = games.filter(function(game){return game.round % 3 !== fold;});
      var count = new Uint16Array(playerCount), margin = new Float64Array(playerCount);
      training.forEach(function(game){
        game.players.forEach(function(player, side){count[player]++; margin[player] += side < 2 ? game.margin : -game.margin;});
      });
      var strength = fitAmericanoStrength(training, playerCount);
      games.forEach(function(game){
        if (game.round % 3 !== fold || game.players.some(function(p){return count[p] < 2;})) return;
        var predicted = Math.max(-1, Math.min(1, amerImpact(game, strength, 1)));
        residuals.push(game.margin - predicted, predicted - game.margin);
        game.players.forEach(function(player, side){
          var sign = side < 2 ? 1 : -1;
          baselineError += Math.abs(game.margin * sign - margin[player] / count[player]);
          neutralError += Math.abs(game.margin);
          modelError += Math.abs(game.margin - predicted);
          observations++;
        });
      });
    }
    if (observations < 48) return {status:'few',model:null};
    if (modelError >= Math.min(baselineError,neutralError) * .95) return {status:'accuracy',model:null};
    return {status:'weighted',model:{strength:fitAmericanoStrength(games, playerCount),residuals:residuals,
      baselineError:baselineError / observations,modelError:modelError / observations}};
  }

  function neutralScoreRange(score, length, residuals){
    var seed = 82473, samples = [];
    for (var i = 0; i < 512; i++){
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      var error = residuals[Math.floor(seed / 4294967296 * residuals.length)];
      samples.push(Math.max(0, Math.min(length, Math.round(score + error * length / 2))));
    }
    samples.sort(function(a,b){return a-b;});
    return {low:samples[51], high:samples[460]};
  }

  var americanoStrengthCache = new Map();
  function computeTotals(poolFilter, applyWeighting = true){
    const state=getState();
    var totals = Object.create(null);
    var h2h = Object.create(null);
    var americano = state.format === 'americano' && applyWeighting;
    var games = [], scoreLengths = [], scheduled = 0, completed = 0, rosterOrder = 0;
    function bumpH2H(a, b, amount){
      if (!h2h[a]) h2h[a] = Object.create(null);
      h2h[a][b] = (h2h[a][b] || 0) + amount;
    }

    state.pools.forEach(function(pool){
      if (!pool.resultsEnabled) return;
      if (poolFilter && pool.id !== poolFilter) return;
      pool.players.forEach(function(name){
        if (!totals[name]) totals[name] = { name: name, order: rosterOrder++, points: 0, played: 0, scored: 0, forPts: 0, againstPts: 0, group: pool.id };
        else totals[name].group = pool.id;
      });
      pool.rounds.forEach(function(rd){
        rd.courts.forEach(function(court){
          var key = scoreKey(pool.id, court.courtIndex, rd.round);
          var sc = state.scores[key];
          scheduled++;
          court.team1.forEach(function(name){
            totals[name].played++;
            if (sc && typeof sc.t1 === 'number') totals[name].points += sc.t1;
          });
          court.team2.forEach(function(name){
            totals[name].played++;
            if (sc && typeof sc.t2 === 'number') totals[name].points += sc.t2;
          });
          if (sc && typeof sc.t1 === 'number' && typeof sc.t2 === 'number'){
            var diff = sc.t1 - sc.t2;
            completed++;
            var length = sc.t1 + sc.t2;
            if (americano && sc.t1 >= 0 && sc.t2 >= 0 && length > 0){
              games.push({round:rd.round,names:court.team1.concat(court.team2),margin:diff / length,length:length});
              scoreLengths.push(length);
            }
            court.team1.forEach(function(name){ totals[name].scored++; totals[name].forPts += sc.t1; totals[name].againstPts += sc.t2; });
            court.team2.forEach(function(name){ totals[name].scored++; totals[name].forPts += sc.t2; totals[name].againstPts += sc.t1; });
            court.team1.forEach(function(a){
              court.team2.forEach(function(b){
                bumpH2H(a, b, diff);
                bumpH2H(b, a, -diff);
              });
            });
          }
        });
      });
    });

    // mark players no longer in their pool's active roster
    Object.keys(totals).forEach(function(name){
      var roster = activeRosterForPool(totals[name].group);
      if (roster.indexOf(name) === -1) totals[name].group = 'out';
    });

    // Reference game count = the most common number of games played among
    // still-active players in this scope (ties broken toward the LARGER
    // value — ordinary fair rotation can easily produce an even split, e.g.
    // exactly half the group resting one extra time when the rounds don't
    // divide evenly; that's normal variance, not a disparity worth
    // correcting). Anyone who played MORE than this gets their points/diff
    // scaled down proportionally, for a fair comparison against players who
    // simply had more opportunities.
    //
    // Below the reference, direction depends on WHY: a player who left (out)
    // or joined later chose/was dealt that shorter run deliberately, so
    // extrapolating their score upward would just reward a lucky small
    // sample — they keep their raw points, unmarked. But a player who was
    // there the whole time and simply drew fewer games by the luck of the
    // rotation didn't do anything to deserve fewer chances to score — so
    // THEIR points get scaled UP to the reference too, marked distinctly
    // from a scale-down so it's clear which direction the adjustment went.
    var rowsArr = Object.keys(totals).map(function(k){ return totals[k]; });
    var model = null, nominalLength = 0, weightingStatus = 'few';
    if (americano && games.length){
      var playerNames = Object.keys(totals);
      var playerIndices = new Map(playerNames.map(function(name,i){return [name,i];}));
      games.forEach(function(game){game.players = game.names.map(function(name){return playerIndices.get(name);});});
      var signature = JSON.stringify([playerNames,games]);
      var cacheKey = poolFilter || 'main';
      var cached = americanoStrengthCache.get(cacheKey);
      if (!cached || cached.signature !== signature){
        cached = {signature:signature,assessment:assessAmericanoStrength(games,rowsArr.length)};
        americanoStrengthCache.set(cacheKey,cached);
      }
      model = cached.assessment.model;
      weightingStatus = cached.assessment.status;
      scoreLengths.sort(function(a,b){return a-b;});
      nominalLength = scoreLengths[Math.floor((scoreLengths.length - 1) / 2)];
      if (model){
        games.forEach(function(game){
          var margin = amerImpact(game, model.strength, 1);
          game.names.forEach(function(name, i){
            var row = totals[name], sign = i < 2 ? 1 : -1;
            var effect = (margin * sign - model.strength[game.players[i]]) * game.length;
            row.drawEffect = (row.drawEffect || 0) + effect;
          });
        });
      }
    }
    var activeRows = rowsArr.filter(function(r){ return r.group !== 'out'; });
    var refPool = activeRows.length ? activeRows : rowsArr;
    var freq = {};
    refPool.forEach(function(r){ freq[r.played] = (freq[r.played] || 0) + 1; });
    var referenceGames = 0, bestCount = -1;
    Object.keys(freq).forEach(function(k){
      var n = parseInt(k, 10);
      if (freq[k] > bestCount || (freq[k] === bestCount && n > referenceGames)){
        bestCount = freq[k]; referenceGames = n;
      }
    });

    var recalculated = false;
    rowsArr.forEach(function(row){
      var scale = function(){
        row.adjPoints = Math.round((row.points / row.played) * referenceGames);
        row.adjDiff = Math.round(((row.forPts - row.againstPts) / row.played) * referenceGames);
      };
      if (row.played <= 0 || row.played === referenceGames || row.group === 'out'){
        row.adjPoints = row.points;
        row.adjDiff = row.forPts - row.againstPts;
        row.recalcDir = 'none';
      } else if (row.played > referenceGames){
        scale();
        row.recalcDir = 'down';
        recalculated = true;
      } else if (!Object.prototype.hasOwnProperty.call(state.laterAdditions,row.name)){
        // Present the whole time, just drew fewer games by luck of the draw.
        scale();
        row.recalcDir = 'up';
        recalculated = true;
      } else {
        row.adjPoints = row.points;
        row.adjDiff = row.forPts - row.againstPts;
        row.recalcDir = 'none';
      }
      var factor = row.recalcDir === 'none' ? 1 : referenceGames / row.played;
      if (model && completed === scheduled && row.recalcDir === 'up' && row.scored >= 2){
        var missing = referenceGames - row.played;
        var rating = model.strength[playerIndices.get(row.name)];
        var estimate = Math.max(0, Math.min(nominalLength, Math.round(nominalLength * (1 + rating) / 2)));
        row.adjPoints = row.points + missing * estimate;
        row.adjDiff = row.forPts - row.againstPts + missing * (2 * estimate - nominalLength);
        row.projection = {count:missing,score:estimate,length:nominalLength,residuals:model.residuals};
        factor = 1;
      }
      row.drawEffect = Math.round((row.drawEffect || 0) * factor);
      row.rankDiff = row.adjDiff - row.drawEffect;
      row.referenceGames = referenceGames;
    });

    return { totals: totals, h2h: h2h, referenceGames: referenceGames, recalculated: recalculated,
      weighted: !!model, weightingStatus:weightingStatus };
  }

  function compareStanding(a, b){
    if (a.adjPoints !== b.adjPoints) return b.adjPoints - a.adjPoints;
    return b.rankDiff - a.rankDiff;
  }
  function compareHeadToHead(a,b,h2h){
    return -((h2h[a.name] && h2h[a.name][b.name]) || 0);
  }

  function rankPlayers(totals, h2h){
    const state=getState();
    var rows = Object.values(totals);
    if (state.format !== 'americano'){
      function compare(a,b){return compareStanding(a,b) || compareHeadToHead(a,b,h2h);}
      rows.sort(compare);
      var rank = 1;
      rows.forEach(function(row,i){
        if (i && compare(rows[i-1],row)) rank = i + 1;
        row.rank = rank;
      });
      return rows;
    }
    rows.sort(function(a,b){return compareStanding(a,b) || a.order - b.order;});
    for (var start = 0; start < rows.length;){
      var end = start + 1;
      while (end < rows.length && !compareStanding(rows[start],rows[end])) end++;
      // A pairwise comparator is not transitive for a three-way tie.
      var direct = end - start === 2 ? compareHeadToHead(rows[start],rows[start+1],h2h) : 0;
      if (direct > 0) [rows[start],rows[start+1]] = [rows[start+1],rows[start]];
      for (var i = start; i < end; i++) rows[i].rank = direct ? i + 1 : start + 1;
      start = end;
    }
    return rows;
  }

  return {computeTotals,rankPlayers,fitAmericanoStrength,assessAmericanoStrength,neutralScoreRange};
});
