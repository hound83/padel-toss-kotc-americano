import {invalid} from './poll-roster.mjs';

export async function registerUse(db,owner,now){
  const row=await db.prepare(`INSERT INTO poll_organizer_accounts(organizer,id,last_used)
    SELECT name_key,lower(hex(randomblob(16))),? FROM poll_organizers WHERE name_key=? AND salt=?
    ON CONFLICT(organizer) DO UPDATE SET last_used=MAX(poll_organizer_accounts.last_used,excluded.last_used)
    RETURNING id`).bind(now,owner.name_key,owner.salt).first();
  if(!row)invalid('organizer-login',401);
  return {...owner,accountId:row.id};
}

// Give legacy accounts a full first period starting at migration.
export async function includeOlderAccounts(db,now){
  await db.prepare(`INSERT OR IGNORE INTO poll_organizer_accounts(organizer,id,last_used)
    SELECT o.name_key,lower(hex(randomblob(16))),? FROM poll_organizers o
    WHERE NOT EXISTS(SELECT 1 FROM poll_organizer_accounts a WHERE a.organizer=o.name_key)`).bind(now).run();
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

export async function removeAccount(db,id){
  if(typeof id!=='string' || !/^[0-9a-f]{32}$/.test(id))invalid('field');
  const owner='SELECT organizer FROM poll_organizer_accounts WHERE id=?';
  const series='SELECT series FROM poll_organizer_series WHERE organizer IN ('+owner+')';
  const sql=(source,...args)=>db.prepare(source).bind(...args);
  // The opaque account ID also protects a newly reclaimed name from an old confirmation.
  const statements=[
    sql(`UPDATE signup_polls SET document=CASE WHEN json_extract(document,'$.creatorAccount')=?
      OR (json_extract(document,'$.creatorAccount') IS NULL AND json_extract(document,'$.createdBy')=
        (SELECT display_name FROM poll_organizers WHERE name_key IN (${owner})))
      THEN json_remove(document,'$.createdBy','$.creatorAccount') ELSE document END, revision=revision+1
      WHERE series IN (${series}) OR json_extract(document,'$.creatorAccount')=?`,id,id,id,id),
    sql(`DELETE FROM signup_logins WHERE series IN (${series})`,id),
    sql(`UPDATE signup_series SET salt=lower(hex(randomblob(16))),verifier=lower(hex(randomblob(32)))
      WHERE id IN (${series}) AND salt=(SELECT salt FROM poll_organizers WHERE name_key IN (${owner}))`,id,id),
    sql(`DELETE FROM poll_organizer_logins WHERE organizer IN (${owner})`,id),
    sql(`DELETE FROM poll_organizer_series WHERE organizer IN (${owner})`,id),
    sql(`DELETE FROM poll_organizers WHERE name_key IN (${owner})`,id)
  ];
  await db.batch(statements);
}
