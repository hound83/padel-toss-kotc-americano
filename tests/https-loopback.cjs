const http=require('node:http');
const https=require('node:https');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {execFileSync}=require('node:child_process');

// WebKit only sends the production Secure cookie over HTTPS. Keep both test backends
// on loopback and expose them to the browser with a short-lived test certificate.
module.exports=async function httpsLoopback(t,source){
  const backend=new URL(source);
  if(backend.protocol==='https:')return source;
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'padel-poll-tls-'));
  const key=path.join(dir,'key.pem'),cert=path.join(dir,'cert.pem');
  t.after(async()=>{
    await Promise.all([fs.rm(key,{force:true}),fs.rm(cert,{force:true})]);
    await fs.rmdir(dir);
  });
  const openssl=process.env.OPENSSL_EXECUTABLE || (process.platform==='win32'?
    path.join(process.env.ProgramFiles,'Git','usr','bin','openssl.exe'):'openssl');
  execFileSync(openssl,['req','-x509','-newkey','rsa:2048','-nodes','-days','1',
    '-subj','/CN=localhost','-addext','subjectAltName=IP:127.0.0.1,DNS:localhost','-keyout',key,'-out',cert],{stdio:'ignore'});
  let origin;
  const server=https.createServer({key:await fs.readFile(key),cert:await fs.readFile(cert)},(req,res)=>{
    const headers={...req.headers,host:backend.host};
    if(headers.origin===origin)headers.origin=backend.origin;
    const upstream=http.request(backend,{path:req.url,method:req.method,headers},result=>{
      res.writeHead(result.statusCode,result.headers);result.pipe(res);
    });
    upstream.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end();});
    req.pipe(upstream);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  origin='https://127.0.0.1:'+server.address().port;
  t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
  return origin;
};
