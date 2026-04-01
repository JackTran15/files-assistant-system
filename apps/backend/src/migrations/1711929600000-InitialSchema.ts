import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1711929600000 implements MigrationInterface {
  name = 'InitialSchema1711929600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DO $$ BEGIN CREATE TYPE "file_type_enum" AS ENUM('pdf', 'docx', 'txt'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    );
    await queryRunner.query(
      `DO $$ BEGIN CREATE TYPE "file_status_enum" AS ENUM('pending', 'processing', 'ready', 'failed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    );
    await queryRunner.query(
      `DO $$ BEGIN CREATE TYPE "chat_role_enum" AS ENUM('user', 'assistant', 'system'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "files" (
        "id"            uuid DEFAULT gen_random_uuid() NOT NULL,
        "name"          character varying NOT NULL,
        "mimeType"      character varying NOT NULL,
        "fileType"      "file_type_enum" NOT NULL,
        "size"          bigint NOT NULL,
        "status"        "file_status_enum" NOT NULL DEFAULT 'pending',
        "storagePath"   character varying NOT NULL,
        "tenantId"      character varying NOT NULL,
        "chunkCount"    integer NOT NULL DEFAULT 0,
        "errorMessage"  character varying,
        "errorStage"    character varying,
        "createdAt"     TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt"     TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_files" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "chunks" (
        "id"        uuid DEFAULT gen_random_uuid() NOT NULL,
        "content"   text NOT NULL,
        "index"     integer NOT NULL,
        "fileId"    uuid NOT NULL,
        "metadata"  jsonb,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_chunks" PRIMARY KEY ("id"),
        CONSTRAINT "FK_chunks_file" FOREIGN KEY ("fileId")
          REFERENCES "files"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "conversations" (
        "id"        uuid DEFAULT gen_random_uuid() NOT NULL,
        "title"     character varying,
        "tenantId"  character varying NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_conversations" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "messages" (
        "id"              uuid DEFAULT gen_random_uuid() NOT NULL,
        "conversationId"  uuid NOT NULL,
        "role"            "chat_role_enum" NOT NULL,
        "content"         text NOT NULL,
        "sources"         jsonb,
        "confidenceScore" double precision,
        "createdAt"       TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_messages" PRIMARY KEY ("id"),
        CONSTRAINT "FK_messages_conversation" FOREIGN KEY ("conversationId")
          REFERENCES "conversations"("id") ON DELETE CASCADE
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "messages"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "conversations"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "chunks"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "files"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "chat_role_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "file_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "file_type_enum"`);
  }
}
