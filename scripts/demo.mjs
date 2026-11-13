import { getDb,loadEnv } from './lib/db.mjs';
import { migrate } from './migrate.mjs';
import { seed } from './seed.mjs';
loadEnv();if(process.env.DATABASE_URL)throw Error('Demo is local only; unset DATABASE_URL');
process.env.DATA_DIR=process.env.DATA_DIR||'.data/db';
const db=await getDb();try{await migrate(db);await seed(db);console.log('Demo ready. Run npm run performance -- slow-queries.');}finally{await db.close();}
