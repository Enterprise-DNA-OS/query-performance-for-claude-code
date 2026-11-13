import fs from 'node:fs';
import { createHash } from 'node:crypto';

const metrics = ['postgresql.queries.count','postgresql.queries.time'];
function timestamp(v) { if(!Number.isSafeInteger(v)||v<946684800000||v>4102444800000)throw Error('Expected a millisecond timestamp between 2000 and 2100'); return new Date(v).toISOString(); }
function amount(v) { if(v!==null&&(typeof v!=='number'||!Number.isFinite(v)||v<0||v>Number.MAX_SAFE_INTEGER))throw Error('Metric values must be finite nonnegative safe numbers or null'); return v; }
export function normalize(raw) {
 if(raw.status!=='ok'||!Array.isArray(raw.series)||!raw.series.length)throw Error('Expected a nonempty successful Datadog v1 query response');
 const start=timestamp(raw.from_date),end=timestamp(raw.to_date);
 if(end<=start)throw Error('Export window must have positive duration');
 const groups=new Map();
 for(const series of raw.series){
  if(!metrics.includes(series.metric))throw Error('Unsupported metric: only postgresql.queries.count and postgresql.queries.time');
  // Refuse arithmetic, rate conversions, missing dimensions, or aggregation other than SUM.
  const expression=String(series.expression||'').replace(/\s+/g,'');
  const re=/^sum:(postgresql\.queries\.(count|time))\{[^{}]*\}by\{([^{}]+)\}\.rollup\(sum,(\d+)\)\.as_count\(\)$/;
  const m=expression.match(re);
  if(!m||m[1]!==series.metric||m[3].split(',').sort().join(',')!=='db,host,query_signature,user'||Number(m[4])<1)throw Error('Use the documented sum, four-dimension, rollup(sum,seconds).as_count() export expression');
  const step=Number(m[4])*1000;
  if(raw.from_date%step!==0||raw.to_date%step!==0)throw Error('Window boundaries must align with the rollup interval');
  const tags=Array.isArray(series.tag_set)&&series.tag_set.length?series.tag_set:String(series.scope||'').split(',');
  const identity={};
  for(const tag of tags){const i=tag.indexOf(':');const k=tag.slice(0,i),v=tag.slice(i+1);if(['host','db','user','query_signature'].includes(k)){if(identity[k]!==undefined)throw Error('Duplicate identity tag');if(!v||v==='*')throw Error('Missing identity tag value');identity[k]=v;}}
  if(Object.keys(identity).length!==4)throw Error('Each series needs host, db, user and query_signature tags');
  if(series.unit?.[1]!=null)throw Error('Rate units are not accepted');
  const unit=series.unit?.[0]?.name;
  if(unit&&unit!==(series.metric.endsWith('.time')?'nanosecond':'query'))throw Error('Unexpected metric unit');
  const key=JSON.stringify(['host','db','user','query_signature'].map(k=>identity[k]));
  const group=groups.get(key)||{...identity,step,start,end,metrics:{}};
  if(group.step!==step)throw Error('Paired metrics must use the same rollup');
  if(group.metrics[series.metric])throw Error('Duplicate series for the same identity');
  if(!Array.isArray(series.pointlist)||!series.pointlist.length)throw Error('Empty pointlist');
  const points=new Map();
  for(const point of series.pointlist){
   if(!Array.isArray(point)||point.length!==2)throw Error('Invalid point');
   const [ts,v]=point;timestamp(ts);amount(v);
   if(ts<raw.from_date||ts>=raw.to_date||ts%step!==0)throw Error('Point is outside the half-open export window or rollup alignment');
   if(points.has(ts))throw Error('Duplicate point timestamp');
   if(series.metric.endsWith('.count')&&v!==null&&!Number.isSafeInteger(v))throw Error('Execution counts must be whole numbers');
   points.set(ts,v);
  }
  group.metrics[series.metric]=points;groups.set(key,group);
 }
 const out=[];
 for(const g of groups.values()){
  if(metrics.some(m=>!g.metrics[m]))throw Error('Every query requires paired count and time series');
  const expected=(raw.to_date-raw.from_date)/g.step;
  if(expected>100000)throw Error('Too many rollup buckets; split this export');
  let executions=0,total_ns=0,paired_points=0,missing_points=0;
  for(let ts=raw.from_date;ts<raw.to_date;ts+=g.step){
   const c=g.metrics[metrics[0]].get(ts),t=g.metrics[metrics[1]].get(ts);
   if(c==null||t==null){missing_points++;continue;}
   if(c===0&&t!==0)throw Error('Execution time without executions');
   executions+=c;total_ns+=t;paired_points++;
  }
  if(executions>Number.MAX_SAFE_INTEGER||total_ns>Number.MAX_SAFE_INTEGER)throw Error('Export total exceeds numeric precision; use a smaller window');
  out.push({host:g.host,db_name:g.db,db_user:g.user,signature:g.query_signature,window_start:start,window_end:end,executions,total_ns,paired_points,missing_points});
 }
 return out;
}
export async function importDatadog(db,{source,file,expected,sourceRef,actor,dryRun=false}){
 const bytes=fs.readFileSync(file);if(bytes.length>25*1024*1024)throw Error('Export exceeds 25 MB; split the window');
 const raw=JSON.parse(bytes),rows=normalize(raw);
 if(rows.length!==expected)throw Error(`Expected ${expected} query windows, found ${rows.length}`);
 const digest=createHash('sha256').update(bytes).digest('hex');
 let added=0,skipped=0;
 await db.exec('BEGIN');
 try{
  // Serialize overlapping imports, including two different file digests.
  await db.query('SELECT id FROM sources WHERE id=$1 FOR UPDATE',[source]);
  const existing=await db.query('SELECT id FROM imports WHERE source_id=$1 AND digest=$2',[source,digest]);
  let importId=existing[0]?.id;
  if(!importId){[ {id:importId} ]=await db.query('INSERT INTO imports(source_id,digest,source_ref,actor,raw) VALUES($1,$2,$3,$4,$5) RETURNING id',[source,digest,sourceRef,actor,raw]);}
  for(const row of rows){
   const [host]=await db.query('INSERT INTO hosts(source_id,name) VALUES($1,$2) ON CONFLICT(source_id,name) DO UPDATE SET name=excluded.name RETURNING id',[source,row.host]);
   const [query]=await db.query('INSERT INTO queries(host_id,db_name,db_user,signature) VALUES($1,$2,$3,$4) ON CONFLICT(host_id,db_name,db_user,signature) DO UPDATE SET signature=excluded.signature RETURNING id',[host.id,row.db_name,row.db_user,row.signature]);
   const overlaps=await db.query('SELECT * FROM observations WHERE query_id=$1 AND window_start<$3 AND window_end>$2',[query.id,row.window_start,row.window_end]);
   if(overlaps.length){
    const old=overlaps[0];const iso=v=>new Date(v).toISOString();
    if(overlaps.length===1&&iso(old.window_start)===row.window_start&&iso(old.window_end)===row.window_end&&['executions','total_ns','paired_points','missing_points'].every(k=>Number(old[k])===row[k])){skipped++;continue;}
    throw Error('Conflicting or overlapping window; original evidence is unchanged');
   }
   await db.query('INSERT INTO observations(query_id,import_id,window_start,window_end,executions,total_ns,paired_points,missing_points) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[query.id,importId,row.window_start,row.window_end,row.executions,row.total_ns,row.paired_points,row.missing_points]);added++;
  }
  if(!existing.length)await db.query('INSERT INTO events(kind,record_id,actor,details) VALUES($1,$2,$3,$4)',['import',importId,actor,{added,skipped,sourceRef}]);
  await db.exec(dryRun?'ROLLBACK':'COMMIT');
  return [{added,skipped,dry_run:dryRun,query_windows:rows.length}];
 }catch(e){await db.exec('ROLLBACK');throw e;}
}
