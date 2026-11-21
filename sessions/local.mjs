import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {pathToFileURL} from 'node:url';
import {extname} from 'node:path';
import {cleanup} from './api.mjs';
import {serve,publicFiles} from './routes.mjs';

const root=new URL('../',import.meta.url);
const mime={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png'};
export async function localSessionApp(database=':memory:'){
  const sql=new DatabaseSync(database);
  sql.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;');
  sql.exec(await readFile(new URL('schema.sql',import.meta.url),'utf8'));
  function statement(source,values=[]){
    const stmt=sql.prepare(source);
    return {bind:(...args)=>statement(source,args), first:()=>stmt.get(...values),
      all:()=>({results:stmt.all(...values)}),run:()=>({meta:{changes:stmt.run(...values).changes}})};
  }
  const DB={prepare:statement,batch(statements){
    sql.exec('BEGIN IMMEDIATE');
    try{const results=statements.map(s=>s.run());sql.exec('COMMIT');return results;}
    catch(error){sql.exec('ROLLBACK');throw error;}
  }};
  const ASSETS={async fetch(request){
    const file=new URL(request.url).pathname.slice(1);
    if(!publicFiles.includes(file))return new Response(null,{status:404});
    const bytes=await readFile(new URL(file,root));
    return new Response(request.method==='HEAD'?null:bytes,{headers:{'Content-Type':mime[extname(file)]}});
  }};
  return {fetch:req=>serve(req,{DB,ASSETS}),DB,sql,close:()=>sql.close()};
}
if(process.argv[1] && pathToFileURL(process.argv[1]).href===import.meta.url){
  const app=await localSessionApp(process.env.SESSION_DB || 'sessions.sqlite');
  const server=createServer(async (req,res)=>{
    try{
      const url='http://'+(req.headers.host || 'localhost')+req.url;
      const headers=new Headers(req.headers);
      headers.set('CF-Connecting-IP',req.socket.remoteAddress || 'local');
      const body=['GET','HEAD'].includes(req.method)?null:req;
      const response=await app.fetch(new Request(url,{method:req.method,headers,body,duplex:'half'}));
      res.writeHead(response.status,Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
    }catch{res.writeHead(500).end();}
  });
  setInterval(()=>{cleanup(app.DB).catch(()=>{});},3600000).unref();
  server.listen(Number(process.env.PORT)||8787,process.env.HOST || '127.0.0.1');
}
