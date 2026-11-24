import {listAccounts,removeAccount} from './poll-accounts.mjs';
import {invalid} from './poll-roster.mjs';

const cookieName = '__Host-padel-admin';
const lifetime = 12 * 60 * 60;
const encoder = new TextEncoder();
const hex = bytes => Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');

function cookie(token, age) {
  return cookieName+'='+token+'; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age='+age;
}

// The random cookie is never stored in D1. Changing the Worker secret immediately
// invalidates existing cookies, without storing a password verifier in the database.
async function sessionKey(password, token) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), {name:'HMAC', hash:'SHA-256'}, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, encoder.encode(token)));
}
async function matchesPassword(attempt, password) {
  if (typeof attempt !== 'string' || attempt.length > 256) return false;
  const [a,b] = await Promise.all([attempt,password].map(value => crypto.subtle.digest('SHA-256', encoder.encode(value))));
  const left = new Uint8Array(a), right = new Uint8Array(b);
  let difference = 0;
  for (let i=0; i<left.length; i++) difference |= left[i] ^ right[i];
  return difference === 0;
}
async function requestKey(request, password) {
  const token = request.headers.get('Cookie')?.match(/(?:^|;\s*)__Host-padel-admin=([a-f0-9]{64})(?:;|$)/)?.[1];
  return token && password ? sessionKey(password, token) : null;
}
export async function centralLogin(request, db, now, password) {
  const key = await requestKey(request, password);
  return Boolean(key && await db.prepare('SELECT 1 FROM organizer_logins WHERE token=? AND expires>?').bind(key, now).first());
}
async function listEvents(db, now, after, sessions) {
  // Select only the fields needed for each card. Large schedules and all private
  // entries remain in D1 until the organizer opens a particular event.
  const source = sessions ? `
    SELECT s.id, s.revision, s.closed, l.code AS viewCode,
      json_extract(s.document,'$.createdAt') AS createdAt, json_extract(s.document,'$.createdBy') AS createdBy,
      json_extract(s.document,'$.planning.date') AS date,
      json_extract(s.document,'$.state.format') AS format,
      json_extract(s.document,'$.view.title') AS title
    FROM sessions s JOIN links l ON l.session_id=s.id AND l.role='view'
    WHERE s.expires>? AND s.id>? AND json_extract(s.document,'$.planning.date') IS NOT NULL
      AND json_extract(s.document,'$.planning.pollId') IS NULL AND NOT EXISTS (
      SELECT 1 FROM signup_polls p WHERE p.expires>? AND json_extract(p.document,'$.viewCode')=l.code
    ) ORDER BY s.id LIMIT 65` : `
    WITH page AS (SELECT id, series, revision, document FROM signup_polls WHERE expires>? AND id>? ORDER BY id LIMIT 65)
    SELECT p.id, p.revision, json_extract(p.document,'$.settings') AS settings,
      json_extract(p.document,'$.phase') AS phase,
      json_extract(p.document,'$.createdAt') AS createdAt, json_extract(p.document,'$.createdBy') AS createdBy,
      o.display_name AS seriesOrganizer,
      COUNT(CASE WHEN json_extract(e.value,'$.place')='in' THEN 1 END) AS playing,
      COUNT(CASE WHEN json_extract(e.value,'$.place')='wait' THEN 1 END) AS waiting,
      COUNT(CASE WHEN json_extract(e.value,'$.place')='reserve' THEN 1 END) AS standby
    FROM page p LEFT JOIN poll_organizer_series m ON m.series=p.series
    LEFT JOIN poll_organizers o ON o.name_key=m.organizer
    LEFT JOIN json_each(p.document,'$.entries') e ON 1 GROUP BY p.id ORDER BY p.id`;
  const values = sessions ? [now,after,now] : [now,after];
  const {results} = await db.prepare(source).bind(...values).all();
  const items = results.slice(0,64);
  if (!sessions) for (const item of items) item.settings = JSON.parse(item.settings);
  return {items, next:results.length>items.length ? items.at(-1).id : null};
}
// Every destructive statement uses the revision shown in the confirmation. D1
// executes the batch as one transaction, including cascades to access links.
async function removePoll(db, id, revision, now) {
  const target = 'SELECT series FROM signup_polls WHERE id=? AND revision=? AND expires>?';
  const params = [id,revision,now];
  const row = await db.prepare('SELECT series FROM signup_polls WHERE id=? AND expires>?').bind(id,now).first();
  if (!row) return;
  const results = await db.batch([
    db.prepare(`DELETE FROM sessions WHERE id IN (
      SELECT l.session_id FROM signup_polls p JOIN links l ON l.code=json_extract(p.document,'$.viewCode') AND l.role='view'
      WHERE p.id=? AND p.revision=? AND p.expires>? AND NOT EXISTS (
        SELECT 1 FROM signup_polls other WHERE other.id<>p.id AND other.expires>?
        AND json_extract(other.document,'$.viewCode')=l.code))`).bind(...params,now),
    db.prepare(`UPDATE signup_polls SET document=json_remove(document,'$.next'), revision=revision+1
      WHERE series=(${target}) AND json_extract(document,'$.next')=?`).bind(...params,id),
    db.prepare('DELETE FROM signup_polls WHERE id=? AND revision=? AND expires>?').bind(...params),
    db.prepare(`DELETE FROM signup_series WHERE id=?
      AND NOT EXISTS (SELECT 1 FROM signup_polls WHERE series=signup_series.id)`).bind(row.series)
  ]);
  if (!results[2].meta.changes &&
      await db.prepare('SELECT 1 FROM signup_polls WHERE id=? AND expires>?').bind(id,now).first()) invalid('changed',409);
}

async function removeStandalone(db, id, revision, now) {
  const result = await db.prepare(`DELETE FROM sessions WHERE id=? AND revision=? AND expires>?
    AND NOT EXISTS (SELECT 1 FROM links l JOIN signup_polls p ON json_extract(p.document,'$.viewCode')=l.code
      WHERE l.session_id=sessions.id AND l.role='view' AND p.expires>?)`).bind(id,revision,now,now).run();
  if (!result.meta.changes &&
      await db.prepare('SELECT 1 FROM sessions WHERE id=? AND expires>?').bind(id,now).first()) invalid('changed',409);
}

export async function organizerApi(request, db, now, password, {json,requestJson,counter}) {
  const url = new URL(request.url), action = url.pathname.slice('/api/polls/hub'.length);
  if (action === '/login' && request.method === 'POST') {
    if (!password) invalid('hub-unconfigured',503);
    await counter(db,request,'central-organizer-login',now,8,true);
    const body = await requestJson(request);
    if (!await matchesPassword(body?.password,password)) invalid('login',401);
    const token = hex(crypto.getRandomValues(new Uint8Array(32)));
    await db.prepare('INSERT INTO organizer_logins (token,expires) VALUES (?,?)')
      .bind(await sessionKey(password,token),now+lifetime*1000).run();
    const response = json({ok:true});
    response.headers.set('Set-Cookie',cookie(token,lifetime));
    return response;
  }
  if (action === '/logout' && request.method === 'POST') {
    const key = await requestKey(request,password);
    if (key) await db.prepare('DELETE FROM organizer_logins WHERE token=?').bind(key).run();
    const response = json({ok:true});
    response.headers.set('Set-Cookie',cookie('',0));
    return response;
  }
  if (!await centralLogin(request,db,now,password)) invalid('login',401);
  if (action === '/organizers' && request.method === 'GET') return json(await listAccounts(db,now,url.searchParams.get('after')||''));
  if (action === '/organizers/remove' && request.method === 'POST') {
    const body=await requestJson(request);
    await removeAccount(db,body?.id);
    return json({ok:true});
  }
  if (action === '/remove' && request.method === 'POST') {
    const {kind,id,revision} = await requestJson(request) || {};
    if (!Number.isSafeInteger(revision) || revision<1 || typeof id!=='string') invalid('field');
    if (kind==='poll' && /^[a-f0-9]{14}$/.test(id)) await removePoll(db,id,revision,now);
    else if (kind==='session' && /^[a-f0-9-]{36}$/.test(id)) await removeStandalone(db,id,revision,now);
    else invalid('field');
    return json({ok:true});
  }
  if (request.method !== 'GET') invalid('method',405);
  if (action === '/status') return json({ok:true});
  if (action !== '' && action !== '/sessions') invalid('missing',404);
  const sessions = action === '/sessions', after = url.searchParams.get('after') || '';
  if (after && !(sessions ? /^[a-f0-9-]{36}$/ : /^[a-f0-9]{14}$/).test(after)) invalid('field');
  return json(await listEvents(db,now,after,sessions));
}
