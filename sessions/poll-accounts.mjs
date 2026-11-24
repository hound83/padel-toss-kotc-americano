import {invalid} from './poll-roster.mjs';

// Clamp the day when the third calendar month is shorter (January 31 → April 30).
export function retentionEnd(now){
  const date=new Date(now),day=date.getUTCDate();
  date.setUTCDate(1);date.setUTCMonth(date.getUTCMonth()+3);
  const lastDay=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate();
  date.setUTCDate(Math.min(day,lastDay));
  return date.getTime();
}
export async function registerUse(db,owner,now){
  const row=await db.prepare(`INSERT INTO poll_organizer_accounts(organizer,id,last_used,remove_after)
    SELECT name_key,lower(hex(randomblob(16))),?,? FROM poll_organizers WHERE name_key=? AND salt=?
    ON CONFLICT(organizer) DO UPDATE SET last_used=MAX(poll_organizer_accounts.last_used,excluded.last_used),
      remove_after=MAX(poll_organizer_accounts.remove_after,excluded.remove_after)
    RETURNING id`).bind(now,retentionEnd(now),owner.name_key,owner.salt).first();
  if(!row)invalid('organizer-login',401);
  return {...owner,accountId:row.id};
}

// Give legacy accounts a full first period starting at migration.
export async function includeOlderAccounts(db,now){
  await db.prepare(`INSERT OR IGNORE INTO poll_organizer_accounts(organizer,id,last_used,remove_after)
    SELECT o.name_key,lower(hex(randomblob(16))),?,? FROM poll_organizers o
    WHERE NOT EXISTS(SELECT 1 FROM poll_organizer_accounts a WHERE a.organizer=o.name_key)`).bind(now,retentionEnd(now)).run();
}

export async function listAccounts(db,now,after){
  if(after && !/^[0-9a-f]{32}$/.test(after))invalid('field');
  await includeOlderAccounts(db,now);
  const {results}=await db.prepare(`SELECT a.id,o.display_name AS name,a.last_used AS lastUsed,
    (SELECT COUNT(*) FROM poll_organizer_series m JOIN signup_polls p ON p.series=m.series
      WHERE m.organizer=a.organizer AND p.expires>?) AS polls
    FROM poll_organizer_accounts a JOIN poll_organizers o ON o.name_key=a.organizer
    WHERE a.id>? ORDER BY a.id LIMIT 65`).bind(now,after).all();
  const items=results.slice(0,64);
  return {items,next:results.length>items.length?items.at(-1).id:null};
}

const inactiveAccount=`a.remove_after<=? AND NOT EXISTS(
  SELECT 1 FROM poll_organizer_series m JOIN signup_polls p ON p.series=m.series
  WHERE m.organizer=a.organizer AND p.expires>? AND json_extract(p.document,'$.settings.date')>=?)`;

export async function removeAccount(db,id,expiryCheck){
  if(typeof id!=='string' || !/^[0-9a-f]{32}$/.test(id))invalid('field');
  const selection=`WITH target AS (SELECT a.id,a.organizer FROM poll_organizer_accounts a WHERE a.id=?
    ${expiryCheck?'AND '+inactiveAccount:''}),
    owned_series AS (SELECT series FROM poll_organizer_series WHERE organizer IN (SELECT organizer FROM target)) `;
  const values=expiryCheck?[id,expiryCheck.now,expiryCheck.now,expiryCheck.today]:[id];
  const sql=source=>db.prepare(selection+source).bind(...values);
  // Recheck eligibility inside the transaction. A renewed login or a newly planned evening wins.
  await db.batch([
    sql(`UPDATE signup_polls SET document=CASE WHEN json_extract(document,'$.creatorAccount') IN (SELECT id FROM target)
      OR (json_extract(document,'$.creatorAccount') IS NULL AND json_extract(document,'$.createdBy')=
        (SELECT display_name FROM poll_organizers JOIN target ON name_key=target.organizer))
      THEN json_set(json_remove(document,'$.createdBy','$.creatorAccount'),'$.creatorRemoved',1) ELSE document END, revision=revision+1
      WHERE series IN (SELECT series FROM owned_series) OR json_extract(document,'$.creatorAccount') IN (SELECT id FROM target)`),
    sql(`DELETE FROM signup_logins WHERE series IN (SELECT series FROM owned_series)`),
    sql(`UPDATE signup_series SET salt=lower(hex(randomblob(16))),verifier=lower(hex(randomblob(32)))
      WHERE id IN (SELECT series FROM owned_series) AND salt=(SELECT salt FROM poll_organizers JOIN target ON name_key=target.organizer)`),
    sql(`DELETE FROM poll_organizer_logins WHERE organizer IN (SELECT organizer FROM target)`),
    sql(`DELETE FROM poll_organizer_series WHERE organizer IN (SELECT organizer FROM target)`),
    sql(`DELETE FROM poll_organizers WHERE name_key IN (SELECT organizer FROM target)`)
  ]);
}

export async function expireAccounts(db,now){
  await includeOlderAccounts(db,now);
  const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Amsterdam'}).format(now);
  const {results}=await db.prepare(`SELECT a.id FROM poll_organizer_accounts a WHERE ${inactiveAccount}
    ORDER BY a.remove_after,a.id LIMIT 25`).bind(now,now,today).all();
  for(const {id} of results)await removeAccount(db,id,{now,today});
}
