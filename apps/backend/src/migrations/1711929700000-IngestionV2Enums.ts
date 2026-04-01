import { MigrationInterface, QueryRunner } from 'typeorm';

export class IngestionV2Enums1711929700000 implements MigrationInterface {
  name = 'IngestionV2Enums1711929700000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add new status enum values to both possible enum names (TypeORM naming varies)
    for (const enumName of ['files_status_enum', 'file_status_enum']) {
      await queryRunner.query(
        `DO $$ BEGIN ALTER TYPE "${enumName}" ADD VALUE IF NOT EXISTS 'extracting' AFTER 'processing'; EXCEPTION WHEN undefined_object THEN NULL; END $$`,
      );
      await queryRunner.query(
        `DO $$ BEGIN ALTER TYPE "${enumName}" ADD VALUE IF NOT EXISTS 'extracted' AFTER 'extracting'; EXCEPTION WHEN undefined_object THEN NULL; END $$`,
      );
      await queryRunner.query(
        `DO $$ BEGIN ALTER TYPE "${enumName}" ADD VALUE IF NOT EXISTS 'embedding' AFTER 'extracted'; EXCEPTION WHEN undefined_object THEN NULL; END $$`,
      );
    }

    // Add new file type enum values to both possible enum names
    for (const enumName of ['files_filetype_enum', 'file_type_enum']) {
      await queryRunner.query(
        `DO $$ BEGIN ALTER TYPE "${enumName}" ADD VALUE IF NOT EXISTS 'json'; EXCEPTION WHEN undefined_object THEN NULL; END $$`,
      );
      await queryRunner.query(
        `DO $$ BEGIN ALTER TYPE "${enumName}" ADD VALUE IF NOT EXISTS 'markdown'; EXCEPTION WHEN undefined_object THEN NULL; END $$`,
      );
    }

    // Add new columns to files table
    await queryRunner.query(
      `ALTER TABLE "files" ADD COLUMN IF NOT EXISTS "parsedText" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "files" ADD COLUMN IF NOT EXISTS "extractionMethod" varchar(20)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop the new columns
    await queryRunner.query(
      `ALTER TABLE "files" DROP COLUMN IF EXISTS "extractionMethod"`,
    );
    await queryRunner.query(
      `ALTER TABLE "files" DROP COLUMN IF EXISTS "parsedText"`,
    );

    // Postgres does not support removing individual enum values.
    // The added values (extracting, extracted, embedding, json, markdown)
    // will remain in their respective enums after rollback.
  }
}
