import {copyFile,mkdir} from 'node:fs/promises';
import {publicFiles} from '../sessions/routes.mjs';

const root=new URL('../',import.meta.url),out=new URL('sessions/.generated/public/',root);
for(const file of publicFiles){
  const destination=new URL(file,out);
  await mkdir(new URL('./',destination),{recursive:true});
  await copyFile(new URL(file,root),destination);
}
