// Each cold request owns its D1 work. Only a completed schema check is shared by the isolate.
export function schemaInitializer(schema){
  const statements=schema.split(';').map(sql=>sql.trim()).filter(Boolean);
  const names=statements.map(sql=>/^CREATE (?:UNIQUE )?(?:TABLE|INDEX) IF NOT EXISTS (\w+)/i.exec(sql)?.[1]);
  const probe=names.every(Boolean)?'SELECT COUNT(*) AS total FROM sqlite_master WHERE name IN ('+names.map(()=>'?').join(',')+')':null;
  let ready=false;
  async function check(db){
    if(probe && (await db.prepare(probe).bind(...names).first())?.total===names.length)return;
    await db.batch(statements.map(sql=>db.prepare(sql)));
  }
  return async function initialize(db){
    if(ready)return;
    for(let attempt=0;;attempt++){
      try{await check(db);ready=true;return;}
      catch(error){
        const message=String(error?.message)+' '+String(error?.cause?.message||'');
        if(attempt>=2 || !/retry|overload|temporar|connection|network|locked|reset|internal error/i.test(message))throw error;
        await new Promise(resolve=>setTimeout(resolve,50*2**attempt));
      }
    }
  };
}

// These GET routes perform their normal cookie check before their first database query.
export function needsSchema(request,path){
  if(!path.startsWith('/api/'))return false;
  return request.method!=='GET' || request.headers.has('Cookie') || !/^\/api\/polls\/(?:mine|hub)(?:\/|$)/.test(path);
}
