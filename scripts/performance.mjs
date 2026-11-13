#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { getDb, REPO_ROOT } from './lib/db.mjs';
import { table } from './lib/format.mjs';
import { importDatadog } from './lib/import-datadog.mjs';

export const contracts={
 help:[],sources:[],hosts:[],queries:[],windows:[], 'slow-queries':[], 'regression-review':[], 'workload-review':[], 'coverage-review':[],actions:[],attention:[],compliance:[],imports:[],history:[],
 query:['ref'], 'add-source':['name','owner','purpose','access-review','retention-review','actor'],
 'review-source':['ref','access-review','retention-review','evidence','actor'],
 'assign-query':['ref','owner','label','actor'], 'add-action':['ref','title','owner','due','actor'], 'close-action':['ref','evidence','actor'],log:['ref','text','actor'],
 import:['source','file','expected-count','source-ref','actor','dry-run'],export:['file'], 'weekly-review':[], 'draft-tuning':['ref']
};
export function parse(argv){
 const verb=argv[0]||'help';if(!Object.hasOwn(contracts,verb))throw Error('Unknown command; run help');
 let rest=argv.slice(1);if(verb==='import'){if(rest.shift()!=='datadog')throw Error('Import requires datadog');}
 const flags={};
 for(const arg of rest){
  const match=arg.match(/^--([a-z-]+)(?:=(.*))?$/s);if(!match)throw Error('Unexpected argument; use --name=value');
  const [,k,v]=match;if(k!=='json'&&!contracts[verb].includes(k))throw Error('Unknown flag: '+k);if(k in flags)throw Error('Duplicate flag: '+k);
  if(['json','dry-run'].includes(k)){if(v!==undefined)throw Error(k+' takes no value');flags[k]=true;}else{if(v===undefined||!v.trim())throw Error(k+' needs a nonempty value');flags[k]=v;}
 }
 return {verb,flags};
}
const req=(f,k)=>{if(!String(f[k]??'').trim())throw Error('Required nonempty --'+k);return String(f[k]).trim();};
function date(s){if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||new Date(s+'T00:00:00Z').toISOString().slice(0,10)!==s)throw Error('Expected a real YYYY-MM-DD date');return s;}
const tables=['sources','hosts','queries','imports','observations','actions','notes','events'];
export async function resolve(db,kind,ref){
 const label={sources:'name',queries:'coalesce(label,signature)',actions:'title'}[kind];if(!label)throw Error('Unsupported lookup');
 const rows=await db.query(`SELECT id,${label} AS name FROM ${kind} ORDER BY name,id`);
 const exact=rows.filter(r=>r.id===ref);if(exact.length)return exact[0];
 const found=rows.filter(r=>r.id.toLowerCase().startsWith(ref.toLowerCase())||r.name.toLowerCase()===ref.toLowerCase());
 if(found.length!==1)throw Error((found.length?'Ambiguous':'No match')+': '+ref+'\n'+(found.length?found:rows).map(r=>r.id+'  '+r.name).join('\n'));
 return found[0];
}
async function record(db,kind,id,actor,details){await db.query('INSERT INTO events(kind,record_id,actor,details) VALUES($1,$2,$3,$4)',[kind,id,actor,details]);}
async function transaction(db,fn){await db.exec('BEGIN');try{const out=await fn();await db.exec('COMMIT');return out;}catch(e){await db.exec('ROLLBACK');throw e;}}
const readSql={
 sources:'SELECT id,name,owner,purpose,access_review,retention_review FROM sources ORDER BY name',
 hosts:'SELECT h.id,s.name AS source,h.name AS host FROM hosts h JOIN sources s ON s.id=h.source_id ORDER BY source,host',
 queries:'SELECT q.id,s.name AS source,h.name AS host,q.db_name,q.db_user,q.signature,q.label,q.owner FROM queries q JOIN hosts h ON h.id=q.host_id JOIN sources s ON s.id=h.source_id ORDER BY source,host,q.signature',
 windows:'SELECT source,host,query_name,window_start,window_end,executions,observed_seconds,mean_ms,missing_points FROM query_windows ORDER BY window_start,host,query_name',
 'slow-queries':'SELECT query_id,host,query_name,owner,mean_ms,observed_seconds,executions,missing_points,window_end FROM latest_queries ORDER BY mean_ms DESC NULLS LAST,host,query_name',
 'regression-review':'SELECT r.* FROM regressions r JOIN latest_queries l ON l.query_id=r.query_id AND l.window_end=r.window_end ORDER BY change_pct DESC NULLS LAST,host,query_name',
 'workload-review':'SELECT source,host,window_start,window_end,sum(executions) AS observed_executions,round(sum(total_ns)/1000000000,3) AS observed_seconds,sum(missing_points) AS missing_points FROM query_windows GROUP BY source,host,window_start,window_end ORDER BY window_end DESC,host',
 'coverage-review':'SELECT source,host,query_name,window_start,window_end,paired_points,missing_points,owner FROM latest_queries ORDER BY missing_points DESC,host,query_name',
 actions:'SELECT id,source,host,query_name,title,owner,due,status,overdue,closure_evidence FROM action_queue ORDER BY due,id',
 attention:"SELECT 'overdue-action' AS kind,id AS record_id,title AS record,owner FROM action_queue WHERE overdue UNION ALL SELECT rule,record_id,record,owner FROM compliance_findings ORDER BY kind,record",
 compliance:'SELECT * FROM compliance_findings ORDER BY rule,record',
 imports:'SELECT i.id,s.name AS source,i.source_ref,i.actor,i.digest,i.created_at FROM imports i JOIN sources s ON s.id=i.source_id ORDER BY i.created_at,i.id',
 history:'SELECT kind,record_id,actor,details,created_at FROM events ORDER BY created_at,id'
};
export async function run(db,{verb,flags:f}){
 if(verb==='help')return Object.entries(contracts).map(([command,flags])=>({command,flags:flags.map(x=>'--'+x).join(' ')}));
 if(readSql[verb])return db.query(readSql[verb]);
 if(verb==='query'){const q=await resolve(db,'queries',req(f,'ref'));return db.query('SELECT * FROM query_windows WHERE query_id=$1 ORDER BY window_end',[q.id]);}
 if(verb==='import'){
  const s=await resolve(db,'sources',req(f,'source'));const expected=Number(req(f,'expected-count'));if(!Number.isSafeInteger(expected)||expected<1)throw Error('Expected-count must be a positive integer');
  return importDatadog(db,{source:s.id,file:req(f,'file'),expected,sourceRef:req(f,'source-ref'),actor:req(f,'actor'),dryRun:!!f['dry-run']});
 }
 if(verb==='export'){
  const file=path.resolve(req(f,'file'));const records={};
  await db.exec('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  try{for(const t of tables)records[t]=await db.query(`SELECT * FROM ${t} ORDER BY id`);}finally{await db.exec('ROLLBACK');}
  fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});fs.writeFileSync(file,JSON.stringify({format:1,created_at:new Date().toISOString(),records},null,2)+'\n',{flag:'wx',mode:0o600});return [{file,record_types:tables.length}];
 }
 if(['weekly-review','draft-tuning'].includes(verb)){
  const sections=[];if(verb==='draft-tuning'){const q=await resolve(db,'queries',req(f,'ref'));sections.push(['Evidence',await db.query('SELECT * FROM query_windows WHERE query_id=$1 ORDER BY window_end',[q.id])],['Follow-up',await db.query('SELECT * FROM action_queue WHERE query_id=$1',[q.id])]);}
  else for(const name of ['slow-queries','regression-review','attention'])sections.push([name,await db.query(readSql[name])]);
  const dir=path.resolve(process.env.OUTPUT_DIR||REPO_ROOT,'drafts');fs.mkdirSync(dir,{recursive:true,mode:0o700});const file=path.join(dir,verb+'-'+randomUUID()+'.md');
  const body='# '+verb+'\n\nDraft. Saved observations only. No production change is authorised.\n\n'+sections.map(([title,rows])=>'## '+title+'\n\n```json\n'+JSON.stringify(rows,null,2)+'\n```').join('\n\n');fs.writeFileSync(file,body+'\n',{flag:'wx',mode:0o600});return [{file}];
 }
 const actor=req(f,'actor');
 return transaction(db,async()=>{
  let rows;
  if(verb==='add-source')rows=await db.query('INSERT INTO sources(name,owner,purpose,access_review,retention_review) VALUES($1,$2,$3,$4,$5) RETURNING *',[req(f,'name'),req(f,'owner'),req(f,'purpose'),date(req(f,'access-review')),date(req(f,'retention-review'))]);
  if(verb==='review-source'){const s=await resolve(db,'sources',req(f,'ref'));req(f,'evidence');rows=await db.query('UPDATE sources SET access_review=$2,retention_review=$3 WHERE id=$1 RETURNING *',[s.id,date(req(f,'access-review')),date(req(f,'retention-review'))]);}
  if(verb==='assign-query'){const q=await resolve(db,'queries',req(f,'ref'));rows=await db.query('UPDATE queries SET owner=$2,label=coalesce($3,label) WHERE id=$1 RETURNING *',[q.id,req(f,'owner'),f.label||null]);}
  if(verb==='add-action'){const q=await resolve(db,'queries',req(f,'ref'));rows=await db.query('INSERT INTO actions(query_id,title,owner,due) VALUES($1,$2,$3,$4) RETURNING *',[q.id,req(f,'title'),req(f,'owner'),date(req(f,'due'))]);}
  if(verb==='close-action'){const a=await resolve(db,'actions',req(f,'ref'));rows=await db.query("UPDATE actions SET status='closed',closure_evidence=$2,closed_at=now() WHERE id=$1 AND status='open' RETURNING *",[a.id,req(f,'evidence')]);if(!rows.length)throw Error('Action is already closed');}
  if(verb==='log'){const q=await resolve(db,'queries',req(f,'ref'));rows=await db.query('INSERT INTO notes(query_id,body,actor) VALUES($1,$2,$3) RETURNING *',[q.id,req(f,'text'),actor]);}
  if(!rows)throw Error('Unhandled command');await record(db,verb,rows[0].id,actor,f);return rows;
 });
}
const displayColumns={'slow-queries':['host','query_name','mean_ms','executions','missing_points'],'regression-review':['host','query_name','previous_ms','mean_ms','change_pct'],attention:['kind','record','owner']};
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 let db,failed=false;try{const parsed=parse(process.argv.slice(2));db=await getDb();const rows=await run(db,parsed);console.log(parsed.flags.json?JSON.stringify(rows,null,2):table(rows,(displayColumns[parsed.verb]||Object.keys(rows[0]||{})).map(key=>({key,label:key,width:90,format:v=>typeof v==='object'&&v!==null?JSON.stringify(v):v}))));}catch(e){console.error(e.message);failed=true;}finally{await db?.close();}if(failed)process.exitCode=1;
}
