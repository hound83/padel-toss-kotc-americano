// Run with: node --test tests/koc.test.cjs
// The website currently ships as a single index.html. Exercise the *real*
// embedded assignment function without maintaining a duplicate algorithm here.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const begin = html.indexOf('function makeKocAssignment(attendees, k){');
const end = html.indexOf('\n  function rollKoc(){', begin);
assert.ok(begin !== -1 && end > begin, 'KOC assignment function was found');
const shuffle = values => {
  const output = values.slice();
  for (let i = output.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [output[i], output[j]] = [output[j], output[i]];
  }
  return output;
};
const makeAssignment = new Function('shuffle', html.slice(begin, end) + '\nreturn makeKocAssignment;')(shuffle);

function checkAssignment(courts, attendees, incoming = [], incomingEnabled = false) {
  const roster = Array.from({length: courts * 4}, (_, i) => ({incoming: incoming.includes(i)}));
  const assignment = makeAssignment(attendees, {courts, roster, incomingEnabled});
  const actual = Object.keys(assignment).map(Number).sort((a,b) => a-b);
  assert.deepEqual(actual, attendees.slice().sort((a,b) => a-b));
  const occupancy = Array.from({length: courts + 1}, () => 0);
  for (const value of Object.values(assignment)) {
    assert.ok(Number.isInteger(value) && value >= 1 && value <= courts);
    occupancy[value]++;
    assert.ok(occupancy[value] <= 4);
  }
  // The highest courts are filled before the lower courts are used.
  let remaining = attendees.length;
  for (let court = courts; court >= 1; court--) {
    assert.equal(occupancy[court], Math.min(4, remaining));
    remaining -= occupancy[court];
  }
  return assignment;
}

test('two courts: first player starts at the top, second on the court below if occupied', () => {
  for (const count of [5, 6, 7, 8]) {
    const attendees = Array.from({length: count}, (_, i) => i);
    for (let attempt = 0; attempt < 20; attempt++) {
      const assignment = checkAssignment(2, attendees);
      assert.equal(assignment[0], 2);
      assert.equal(assignment[1], 1);
    }
  }
  const onlyFour = checkAssignment(2, [0,1,2,3]);
  assert.equal(onlyFour[0], 2);
  assert.equal(onlyFour[1], 2, 'a court with no participants cannot take player 2');
});

test('first two players have fixed highest and penultimate courts when available', () => {
  for (const courts of [3, 4, 5, 8]) {
    const attendees = Array.from({length: courts * 4}, (_, i) => i);
    for (let attempt = 0; attempt < 20; attempt++) {
      const assignment = checkAssignment(courts, attendees);
      assert.equal(assignment[0], courts);
      assert.equal(assignment[1], courts - 1);
    }
  }
});

test('two absences leave vacancies only on the lowest court', () => {
  for (const courts of [2, 3, 4, 5, 8]) {
    const attendees = Array.from({length: courts * 4}, (_, i) => i)
      .filter(i => i !== 4 && i !== 5);
    for (let attempt = 0; attempt < 20; attempt++) {
      const assignment = checkAssignment(courts, attendees);
      assert.equal(assignment[0], courts);
      assert.equal(assignment[1], courts - 1);
    }
  }
});

test('all player counts from 4 to 32 produce valid compact court assignments', () => {
  for (let courts = 2; courts <= 8; courts++) {
    for (let count = 4; count <= courts * 4; count++) {
      const attendees = Array.from({length: count}, (_, i) => i);
      for (let attempt = 0; attempt < 6; attempt++) checkAssignment(courts, attendees);
    }
  }
});

test('absence patterns do not create duplicates, gaps or overfilled courts', () => {
  for (let courts = 2; courts <= 8; courts++) {
    const all = Array.from({length: courts * 4}, (_, i) => i);
    for (let attempt = 0; attempt < 100; attempt++) {
      const attendees = shuffle(all).slice(0, 4 + Math.floor(Math.random() * (all.length - 3)));
      checkAssignment(courts, attendees);
    }
  }
});

test('100,000 draws: unmarked players (including 13-16) are shuffled without old guest bias', () => {
  const courts = 4;
  const attendees = Array.from({length: 16}, (_, i) => i);
  const distribution = Array.from({length: 16}, () => [0,0,0,0,0]);
  const draws = 100000;
  for (let i = 0; i < draws; i++) {
    const assignment = makeAssignment(attendees, {courts});
    for (const player of attendees) distribution[player][assignment[player]]++;
  }
  assert.equal(distribution[0][4], draws, 'organiser always on court 4');
  assert.equal(distribution[1][3], draws, 'second player always on court 3');
  const expected = {1:4/14, 2:4/14, 3:3/14, 4:3/14};
  for (const player of [2, 12, 13, 14, 15]) {
    for (let court=1; court<=4; court++){
      const share = distribution[player][court] / draws;
      assert.ok(Math.abs(share - expected[court]) < .015,
        'player ' + (player+1) + ' court ' + court + ' distribution');
    }
  }

  const percent = n => (100 * n / draws).toFixed(2) + '%';
  console.log('KOC 4 courts / 16 players / 100,000 unmarked draws:');
  for (const player of [0, 1, 2, 12, 14, 15]) {
    console.log('  player ' + (player + 1) + ': ' + [1,2,3,4]
      .map(c => 'court ' + c + ' ' + percent(distribution[player][c])).join(', '));
  }
});

test('incoming players use the lowest available court after reserved first/second slots', () => {
  for (const courts of [2, 3, 4, 5, 8]){
    const attendees = Array.from({length:courts*4}, (_, i) => i);
    const lastFour = attendees.slice(-4);
    for(let count=1; count<=4; count++){
      const marked = lastFour.slice(0,count);
      for(let attempt=0; attempt<40; attempt++){
        const assignment=checkAssignment(courts, attendees, marked, true);
        const bottomSpace = courts === 2 ? 3 : 4;
        assert.equal(marked.filter(idx=>assignment[idx]===1).length,Math.min(count,bottomSpace));
        for(const idx of marked) assert.ok([1,2].includes(assignment[idx]));
        assert.equal(assignment[0],courts);
        assert.equal(assignment[1],courts-1);
      }
    }
  }
});

test('incoming flags have no effect when the global option is off', () => {
  const attendees = Array.from({length:16}, (_, i)=>i);
  let court1Only = 0;
  for(let attempt=0;attempt<200;attempt++){
    const assignment=checkAssignment(4,attendees,[12,13,14,15],false);
    if([12,13,14,15].every(i=>assignment[i]===1)) court1Only++;
  }
  assert.ok(court1Only < 20,'the marked players are not secretly reserved without enabling the mode');
});

test('with 15 players, 4 marked entrants use 3 slots on court 1 and 1 on court 2', () => {
  const attendees=Array.from({length:16},(_,i)=>i).filter(i=>i!==5);
  const incoming=[12,13,14,15];
  const overflowCounts=new Map(incoming.map(i=>[i,0]));
  for(let attempt=0;attempt<4000;attempt++){
    const assignment=checkAssignment(4,attendees,incoming,true);
    assert.equal(incoming.filter(i=>assignment[i]===1).length,3);
    const overflow=incoming.filter(i=>assignment[i]===2);
    assert.equal(overflow.length,1);
    overflowCounts.set(overflow[0],overflowCounts.get(overflow[0])+1);
  }
  for(const count of overflowCounts.values()){
    assert.ok(Math.abs(count/4000-.25)<.04,'overflow is shared fairly between entrants');
  }
});

test('absent entrants and flags on other roster positions are ignored', () => {
  const attendees=Array.from({length:16},(_,i)=>i).filter(i=>i!==14);
  for(let attempt=0;attempt<50;attempt++){
    const assignment=checkAssignment(4,attendees,[3,12,14],true);
    assert.equal(assignment[12],1);
    assert.equal(assignment[14],undefined);
    assert.equal(assignment[0],4);
  }
});

test('all court sizes and random absences remain valid with 0-4 incoming players', () => {
  for(let courts=2;courts<=8;courts++){
    const all=Array.from({length:courts*4},(_,i)=>i);
    const eligible=all.slice(-4);
    for(let attempt=0;attempt<500;attempt++){
      const count=4+Math.floor(Math.random()*(all.length-3));
      const attendees=shuffle(all).slice(0,count);
      const marked=shuffle(eligible).slice(0,Math.floor(Math.random()*5));
      const assignment=checkAssignment(courts,attendees,marked,true);
      if(attendees.includes(0)) assert.equal(assignment[0],courts);
      if(attendees.includes(1) && count>4) assert.equal(assignment[1],courts-1);
    }
  }
});


const duplicateStart = html.indexOf('function kocDuplicateIndices(){');
const duplicateEnd = html.indexOf('\n  function renderKocResult(){', duplicateStart);
assert.ok(duplicateStart !== -1 && duplicateEnd > duplicateStart, 'KOC duplicate-name validator was found');
const duplicateFactory = new Function('kocAttendees', 'kocPlayerName',
  html.slice(duplicateStart, duplicateEnd) + '\nreturn kocDuplicateIndices;');

function duplicateIndices(names, absent = []) {
  const attending = names.map((_, i) => i).filter(i => !absent.includes(i));
  const checker = duplicateFactory(
    () => attending,
    i => names[i].trim() || 'Speler ' + (i + 1)
  );
  return checker();
}

test('duplicate-name validation ignores case, spacing and Unicode-width differences', () => {
  assert.deepEqual(duplicateIndices(['Anna', '  ANNA  ', 'Kees', 'Piet']), [0, 1]);
  assert.deepEqual(duplicateIndices(['Jan  van  Dijk', 'jan van dijk', 'Kees', 'Piet']), [0, 1]);
  assert.deepEqual(duplicateIndices(['Marc', 'Ｍａｒｃ', 'Kees', 'Piet']), [0, 1]);
  assert.deepEqual(duplicateIndices(['Jan', 'JAN', 'jan', 'Piet']), [0, 1, 2]);
});

test('absent players are excluded; placeholder names cannot duplicate named attendees', () => {
  assert.deepEqual(duplicateIndices(['Anna', 'Anna', 'Kees', 'Piet'], [1]), []);
  assert.deepEqual(duplicateIndices(['Speler 2', '', 'Kees', 'Piet']), [0, 1]);
  assert.deepEqual(duplicateIndices(['Anna', 'Bob', 'Kees', 'Piet']), []);
});

test('KOC validation disables sharing and generating until a duplicate is fixed', () => {
  const validationStart = html.indexOf('function renderKocCount(){');
  const validationEnd = html.indexOf('\n  function kocSignature(', validationStart);
  assert.ok(validationStart !== -1 && validationEnd > validationStart);

  const people = ['Anna', 'ANNA', 'Kees', 'Piet'];
  const controls = {};
  for (const id of ['kocCount', 'kocRoll', 'kocCopy', 'kocSave', 'kocPresent', 'kocDupError']) {
    controls[id] = {disabled: false, hidden: true, textContent: ''};
  }
  const rows = people.map(() => {
    const flags = new Set();
    const attributes = {};
    return {
      flags, attributes,
      classList: {toggle: (name, set) => set ? flags.add(name) : flags.delete(name)},
      querySelector: () => ({
        setAttribute: (name, value) => { attributes[name] = value; },
        removeAttribute: name => { delete attributes[name]; }
      })
    };
  });
  const doc = {
    getElementById: id => controls[id],
    querySelectorAll: () => rows
  };
  const check = new Function('ensureKocRoster', 'kocAttendees', 'kocDuplicateIndices',
    'document', 't', 'tf', html.slice(validationStart, validationEnd) +
    '\nreturn renderKocCount;')(
      () => ({courts: 2, assignment: {0:1, 1:1, 2:2, 3:2}}),
      () => [0,1,2,3],
      duplicateFactory(() => [0,1,2,3], i => people[i]),
      doc, key => key, (_, vars) => vars.active + '/' + vars.total
    );

  assert.equal(check(), true);
  assert.equal(controls.kocRoll.disabled, true);
  assert.equal(controls.kocCopy.disabled, true);
  assert.equal(controls.kocSave.disabled, true);
  assert.equal(controls.kocPresent.disabled, true);
  assert.equal(controls.kocDupError.hidden, false);
  assert.equal(rows[0].attributes['aria-invalid'], 'true');
  assert.equal(rows[1].attributes['aria-invalid'], 'true');

  people[1] = 'Ben';
  assert.equal(check(), false);
  assert.equal(controls.kocRoll.disabled, false);
  assert.equal(controls.kocCopy.disabled, false);
  assert.equal(controls.kocSave.disabled, false);
  assert.equal(controls.kocPresent.disabled, false);
  assert.equal(controls.kocDupError.hidden, true);
  assert.equal(rows[0].attributes['aria-invalid'], undefined);
  assert.equal(rows[1].attributes['aria-invalid'], undefined);
});

