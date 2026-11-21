import schema from './schema.sql';
import {serve} from './routes.mjs';
import {cleanup} from './api.mjs';

let initialized;
async function initialize(env){
  if(!initialized){
    const statements=schema.split(';').map(s=>s.trim()).filter(Boolean);
    initialized=env.DB.batch(statements.map(s=>env.DB.prepare(s))).catch(error=>{initialized=null;throw error;});
  }
  return initialized;
}
export default {
  async fetch(request,env){
    if(new URL(request.url).pathname.startsWith('/api/'))await initialize(env);
    return serve(request,env);
  },
  async scheduled(event,env){await initialize(env);await cleanup(env.DB);}
};
