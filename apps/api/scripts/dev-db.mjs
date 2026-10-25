// Local MongoDB for machines without Docker: `pnpm dev:db`. Data persists in apps/api/.mongo-data.
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { MongoMemoryServer } from 'mongodb-memory-server';

const dbPath = fileURLToPath(new URL('../.mongo-data/', import.meta.url));
mkdirSync(dbPath, { recursive: true });

const mongod = await MongoMemoryServer.create({
  instance: { port: 27017, dbPath, storageEngine: 'wiredTiger' },
});
console.log(`mongodb listening at ${mongod.getUri()} (data in ${dbPath})`);

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    await mongod.stop();
    process.exit(0);
  });
}
