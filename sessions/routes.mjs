import {api} from './api.mjs';

export const publicFiles = [
  'index.html','kijken.html','aanmelden.html','poll.js','poll-common.js','organizer-hub.js','poll.css','round-planner.js','ranking.js','session-admin.js','name-hint.js',
  'schedule-document.js','share-v3.js','sw.js','manifest.webmanifest','visual-theme.css',
  'icon.svg','icon-192.png','icon-512.png','assets/mode-toss.svg','assets/mode-koc.svg',
  'assets/mode-americano.svg','assets/mode-split.svg','assets/mode-split-en.svg'
];
export async function serve(request,env){
  const url=new URL(request.url),path=url.pathname;
  if(path.startsWith('/api/'))return api(request,env.DB,Date.now(),env.PADEL_ADMIN_PASSWORD);
  if(!['GET','HEAD'].includes(request.method))return new Response(null,{status:405});
  const guest=path.startsWith('/s/'),owner=path.startsWith('/b/') || /^\/beheer\/sessie\/[a-f0-9-]{36}\/?$/.test(path);
  const poll=/^\/(?:aanmaken\/?|beheer\/?|(?:aanmelden|beheer)\/[0-9a-f]{14}\/?)$/.test(path);
  const file=poll?'aanmelden.html':guest?'kijken.html':owner || path==='/'?'index.html':path.slice(1);
  if(!publicFiles.includes(file))return new Response(null,{status:404});
  const resource=new URL('/'+file,url);
  const asset=await env.ASSETS.fetch(new Request(resource,{method:request.method}));
  if(!file.endsWith('.html') || !asset.ok)return asset;
  const headers=new Headers(asset.headers);
  headers.delete('content-length');headers.delete('content-encoding');headers.delete('etag');
  headers.set('Cache-Control',guest || owner || poll?'private, no-store':'no-cache');
  headers.set('Referrer-Policy','no-referrer');headers.set('X-Robots-Tag','noindex, nofollow');
  headers.set('Content-Type','text/html; charset=utf-8');
  const body=request.method==='HEAD'?null:(await asset.text()).replace('<head>','<head><base href="/"><meta name="koriander-sessions" content="1"><meta name="referrer" content="no-referrer">');
  return new Response(body,{status:200,headers});
}
