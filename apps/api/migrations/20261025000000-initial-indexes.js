// Indexes Mongoose also declares, created here so a fresh database is correct before the API boots.
export async function up(db) {
  await db.collection('users').createIndex({ email: 1 }, { unique: true });
  await db.collection('refreshtokens').createIndex({ tokenHash: 1 }, { unique: true });
  await db.collection('refreshtokens').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
}

export async function down(db) {
  await db.collection('users').dropIndex('email_1');
  await db.collection('refreshtokens').dropIndex('tokenHash_1');
  await db.collection('refreshtokens').dropIndex('expiresAt_1');
}
