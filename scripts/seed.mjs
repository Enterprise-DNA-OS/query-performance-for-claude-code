import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { getDb,REPO_ROOT } from './lib/db.mjs';
import { importDatadog } from './lib/import-datadog.mjs';
export async function seed(db){
 await db.exec(fs.readFileSync(path.join(REPO_ROOT,'supabase/seed.sql'),'utf8'));
 for(const part of ['before','after'])await importDatadog(db,{source:'10000000-0000-4000-8000-000000000001',file:path.join(REPO_ROOT,'examples/datadog-'+part+'.json'),expected:3,sourceRef:'Fictional '+part+' export',actor:'Demo seed'});
 await db.exec(`UPDATE queries SET label=CASE signature WHEN 'q-orders' THEN 'Order lookup' WHEN 'q-search' THEN 'Catalogue search' ELSE 'Billing summary' END,owner=CASE WHEN signature='q-billing' THEN NULL ELSE 'Morgan' END WHERE host_id IN(SELECT id FROM hosts WHERE source_id='10000000-0000-4000-8000-000000000001');
 INSERT INTO actions(id,query_id,title,owner,due) SELECT '20000000-0000-4000-8000-000000000001',q.id,'Investigate order lookup regression','Morgan','2026-11-01' FROM queries q JOIN hosts h ON h.id=q.host_id WHERE q.signature='q-orders' AND h.source_id='10000000-0000-4000-8000-000000000001' ON CONFLICT DO NOTHING;`);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1]))){const db=await getDb();try{await seed(db);console.log('Seed: fictional query windows and overdue work ready');}finally{await db.close();}}
