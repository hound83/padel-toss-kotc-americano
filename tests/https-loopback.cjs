const http=require('node:http');
const https=require('node:https');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {execFileSync}=require('node:child_process');

async function localCertificate(t){
  if(process.platform==='win32' && !process.env.OPENSSL_EXECUTABLE){
    const command=`$ErrorActionPreference='Stop'
$rsa=[System.Security.Cryptography.RSACng]::new(2048)
$req=[System.Security.Cryptography.X509Certificates.CertificateRequest]::new('CN=localhost',$rsa,[System.Security.Cryptography.HashAlgorithmName]::SHA256,[System.Security.Cryptography.RSASignaturePadding]::Pkcs1)
$now=[DateTimeOffset]::UtcNow
$cert=$req.CreateSelfSigned($now.AddMinutes(-1),$now.AddDays(1))
try { [Convert]::ToBase64String($cert.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Pfx)) } finally { $cert.Dispose(); $rsa.Dispose() }`;
    const pfx=execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',command],{encoding:'utf8',windowsHide:true});
    return {pfx:Buffer.from(pfx.trim(),'base64'),passphrase:''};
  }
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'padel-poll-tls-'));
  const key=path.join(dir,'key.pem'),cert=path.join(dir,'cert.pem');
  t.after(async()=>{
    await Promise.all([fs.rm(key,{force:true}),fs.rm(cert,{force:true})]);
    await fs.rmdir(dir);
  });
  execFileSync(process.env.OPENSSL_EXECUTABLE||'openssl',['req','-x509','-newkey','rsa:2048','-nodes','-days','1',
    '-subj','/CN=localhost','-addext','subjectAltName=IP:127.0.0.1,DNS:localhost','-keyout',key,'-out',cert],{stdio:'ignore'});
  return {key:await fs.readFile(key),cert:await fs.readFile(cert)};
}

// WebKit sends the production Secure cookie over HTTPS. Both test backends run on loopback.
module.exports=async function httpsLoopback(t,source){
  const backend=new URL(source);
  if(backend.protocol==='https:')return source;
  let origin;
  const server=https.createServer(await localCertificate(t),(req,res)=>{
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
