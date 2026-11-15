import {fileURLToPath} from 'node:url';

import {migrate} from 'drizzle-orm/node-postgres/migrator';

import {createDb} from './client';

const url = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/vidflow';
const {db, pool} = createDb(url, 1);
const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));

await migrate(db, {migrationsFolder});
console.log('Migrations applied');
await pool.end();
