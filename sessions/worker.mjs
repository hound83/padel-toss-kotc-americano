import schema from './schema.sql';
import {serve} from './routes.mjs';
import {cleanup} from './api.mjs';
import {needsSchema,schemaInitializer} from './schema-init.mjs';

const initialize=schemaInitializer(schema);
export default {
  async fetch(request,env){
    if(needsSchema(request,new URL(request.url).pathname)){
      try{await initialize(env.DB);}
      catch{return Response.json({error:'unavailable'},{status:503,headers:{'Cache-Control':'private, no-store','Retry-After':'1'}});}
    }
    return serve(request,env);
  },
  async scheduled(event,env){await initialize(env.DB);await cleanup(env.DB);}
};
