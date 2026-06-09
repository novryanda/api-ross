-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'COMMENT_COMMAND_CREATED_FROM_PIC_SUBMISSION';

-- AlterTable
ALTER TABLE "comment_commands" ADD COLUMN "source_posting_submission_id" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "comment_commands_source_posting_submission_id_key" ON "comment_commands"("source_posting_submission_id");

-- CreateIndex
CREATE INDEX "comment_commands_source_posting_submission_id_idx" ON "comment_commands"("source_posting_submission_id");

-- AddForeignKey
ALTER TABLE "comment_commands" ADD CONSTRAINT "comment_commands_source_posting_submission_id_fkey" FOREIGN KEY ("source_posting_submission_id") REFERENCES "posting_submissions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
