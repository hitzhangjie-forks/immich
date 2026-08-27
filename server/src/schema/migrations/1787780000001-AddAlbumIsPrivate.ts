import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE "album" ADD "isPrivate" boolean NOT NULL DEFAULT false;`.execute(db);
  await sql`CREATE INDEX "album_isPrivate_idx" ON "album" ("isPrivate") WHERE "isPrivate" = true AND "deletedAt" IS NULL;`.execute(
    db,
  );
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP INDEX "album_isPrivate_idx";`.execute(db);
  await sql`ALTER TABLE "album" DROP COLUMN "isPrivate";`.execute(db);
}
