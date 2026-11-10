const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Exercise the parser actually shipped with the one-file web app.
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const start = html.indexOf('function parseBulkNames(raw){');
const end = html.indexOf('\n  function installBulkNameTool(', start);
assert.ok(start >= 0 && end > start);
const parseBulkNames = new Function(html.slice(start, end) + '\nreturn parseBulkNames;')();

test('bulk names keep order and discard empty lines without changing names', () => {
  assert.deepEqual(parseBulkNames('  Anne\r\n\r\n Bas \nCleo\r  Dirk\n'),
    ['Anne', 'Bas', 'Cleo', 'Dirk']);
  assert.deepEqual(parseBulkNames('Jan van Dijk\nFatima El Idrissi'),
    ['Jan van Dijk', 'Fatima El Idrissi']);
});

test('empty and whitespace-only lists do not create placeholder players', () => {
  assert.deepEqual(parseBulkNames(' \n\r\n\t '), []);
});
