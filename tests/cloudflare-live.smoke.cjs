'use strict';
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const origin = 'https://padel.hound83.workers.dev';
const names = ['Test Alfa', 'Test Bravo', 'Test Charlie', 'Test Delta', 'Test Echo', 'Test Foxtrot', 'Test Golf', 'Test Hotel'];

async function closeFixture(secret) {
  const headers = { Authorization: 'Bearer ' + secret, 'Content-Type': 'application/json' };
  const status = await fetch(origin + '/api/manage', { headers, signal: AbortSignal.timeout(15000) });
  assert.equal(status.status, 200);
  const state = await status.json();
  if (state.closed) return;
  const close = await fetch(origin + '/api/manage', {
    method: 'POST', headers, signal: AbortSignal.timeout(15000),
    body: JSON.stringify({ action: 'close', revision: state.revision })
  });
  assert.equal(close.status, 200);
  assert.equal((await close.json()).closed, true);
}

async function verify() {
  const browser = await chromium.launch();
  let secret;
  try {
    const organizer = await browser.newPage();
    await organizer.goto(origin, { waitUntil: 'domcontentloaded' });
    assert.equal(await organizer.locator('#appVersion').innerText(), 'v3.1.0');
    console.log('The public Cloudflare root opened as v3.1.0 in a fresh Chromium session.');
    await organizer.locator('.format-btn[data-format=americano]').click();
    await organizer.locator('#continueTo2').click();
    const fields = organizer.getByRole('textbox').filter({ visible: true });
    assert.equal(await fields.count(), names.length);
    for (const [i, name] of names.entries()) await fields.nth(i).fill(name);
    await organizer.locator('#generateBtn').click();
    await organizer.getByRole('button', { name: 'Schema delen', exact: true }).filter({ visible: true }).click();
    const [created] = await Promise.all([
      organizer.waitForResponse(r => r.url() === origin + '/api/sessions' && r.request().method() === 'POST'),
      organizer.locator('#sharePublish').click()
    ]);
    assert.equal(created.status(), 201);
    secret = (await created.json()).secret;
    assert.ok(typeof secret === 'string' && /^[a-f0-9]{48}$/.test(secret));
    await organizer.locator('#ownerUrl:visible').waitFor();
    const poll = r => r.method() === 'GET' && r.url() === origin + '/api/manage';
    await organizer.waitForResponse(r => poll(r.request()) && r.status() === 304);
    await organizer.waitForRequest(poll);
    assert.ok(await organizer.locator('#entryMode').isEnabled());
    assert.ok(await organizer.locator('#shareEnd').isEnabled());
    console.log('The open sharing dialog kept score entry and session closure enabled after a real background poll.');

    await organizer.locator('#entryMode').selectOption('group');
    await organizer.locator('#entryUrl:visible').waitFor();
    const viewLink = await organizer.locator('#shareUrl').inputValue();
    const entryLink = await organizer.locator('#entryUrl').inputValue();
    assert.ok([viewLink, entryLink].every(link => new URL(link).origin === origin));
    const viewer = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
    const player = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
    await viewer.goto(viewLink);
    await viewer.locator('#rounds article').first().waitFor();
    const score = viewer.getByText('21–17', { exact: true }).first();
    assert.equal(await score.count(), 0);
    await player.goto(entryLink);
    const first = player.locator('article').first();
    const playerName = await first.locator('.person').first().innerText();
    assert.ok(names.includes(playerName.trim()));
    await player.locator('#player').selectOption({ label: playerName.trim() });
    await player.getByRole('button', { name: 'Uitslag invullen' }).first().tap();
    await player.locator('#entryScore0').fill('21');
    await player.locator('#entryScore1').fill('17');
    await player.locator('#entrySend').tap();
    await player.getByText('Uitslag opgeslagen', { exact: false }).waitFor();
    await viewer.bringToFront();
    await score.waitFor({ timeout: 50000 });
    assert.equal(await viewer.getByRole('button', { name: 'Uitslag invullen' }).count(), 0);
    console.log('The player submitted 21–17 and the separate read-only viewer displayed 21–17 without a manual reload.');

    organizer.once('dialog', d => d.accept());
    const [ended] = await Promise.all([
      organizer.waitForResponse(r => r.url() === origin + '/api/manage' &&
        r.request().method() === 'POST' && r.request().postDataJSON().action === 'close'),
      organizer.locator('#shareEnd').click()
    ]);
    assert.equal(ended.status(), 200);
    assert.equal((await ended.json()).closed, true);
    await viewer.reload();
    await viewer.getByText(/gesloten.*eindstand/i).first().waitFor();
    await score.waitFor();
    await player.reload();
    await player.getByText(/gesloten.*eindstand/i).first().waitFor();
    assert.equal(await player.getByRole('button', { name: 'Uitslag invullen' }).count(), 0);
    console.log('The organizer closed this test session. Its final score remained visible and player entry was closed.');
  } finally {
    try {
      await browser.close();
    } finally {
      if (secret) await closeFixture(secret);
    }
  }
}

verify().catch(error => {
  const message = String(error.message)
    .replace(/\/b\/[a-f0-9]{48}/gi, '/b/[redacted]')
    .replace(/\/s\/[a-z\d]{4}-?[a-z\d]{4}/gi, '/s/[redacted]')
    .replace(/\b[a-f0-9]{48}\b/gi, '[redacted]');
  console.error(message);
  process.exitCode = 1;
});
