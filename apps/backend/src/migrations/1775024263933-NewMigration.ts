import { MigrationInterface, QueryRunner } from "typeorm";

export class NewMigration1775024263933 implements MigrationInterface {
    name = 'NewMigration1775024263933'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TYPE "public"."files_filetype_enum" RENAME TO "files_filetype_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."files_filetype_enum" AS ENUM('pdf', 'txt', 'json', 'markdown')`);
        await queryRunner.query(`ALTER TABLE "files" ALTER COLUMN "fileType" TYPE "public"."files_filetype_enum" USING "fileType"::"text"::"public"."files_filetype_enum"`);
        await queryRunner.query(`DROP TYPE "public"."files_filetype_enum_old"`);
        await queryRunner.query(`ALTER TYPE "public"."files_status_enum" RENAME TO "files_status_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."files_status_enum" AS ENUM('pending', 'processing', 'extracting', 'extracted', 'embedding', 'ready', 'failed')`);
        await queryRunner.query(`ALTER TABLE "files" ALTER COLUMN "status" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "files" ALTER COLUMN "status" TYPE "public"."files_status_enum" USING "status"::"text"::"public"."files_status_enum"`);
        await queryRunner.query(`ALTER TABLE "files" ALTER COLUMN "status" SET DEFAULT 'pending'`);
        await queryRunner.query(`DROP TYPE "public"."files_status_enum_old"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."files_status_enum_old" AS ENUM('pending', 'processing', 'ready', 'failed')`);
        await queryRunner.query(`ALTER TABLE "files" ALTER COLUMN "status" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "files" ALTER COLUMN "status" TYPE "public"."files_status_enum_old" USING "status"::"text"::"public"."files_status_enum_old"`);
        await queryRunner.query(`ALTER TABLE "files" ALTER COLUMN "status" SET DEFAULT 'pending'`);
        await queryRunner.query(`DROP TYPE "public"."files_status_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."files_status_enum_old" RENAME TO "files_status_enum"`);
        await queryRunner.query(`CREATE TYPE "public"."files_filetype_enum_old" AS ENUM('pdf', 'docx', 'txt')`);
        await queryRunner.query(`ALTER TABLE "files" ALTER COLUMN "fileType" TYPE "public"."files_filetype_enum_old" USING "fileType"::"text"::"public"."files_filetype_enum_old"`);
        await queryRunner.query(`DROP TYPE "public"."files_filetype_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."files_filetype_enum_old" RENAME TO "files_filetype_enum"`);
    }

}
