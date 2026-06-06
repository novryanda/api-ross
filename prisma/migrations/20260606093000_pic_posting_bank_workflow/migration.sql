ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'PIC';
ALTER TYPE "BlastTargetSourceType" ADD VALUE IF NOT EXISTS 'PIC_SUBMISSION';

CREATE TYPE "OrgUnitStatus" AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE "PostingOrderStatus" AS ENUM ('PUBLISHED_TO_QUEUE', 'CLAIMED', 'COMPLETED', 'CANCELLED');
CREATE TYPE "PostingSubmissionStatus" AS ENUM ('SUBMITTED', 'APPROVED_FOR_BLAST', 'REJECTED');

ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'USER_PIC_UNIT_ASSIGNED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'BLAST_TARGET_CREATED_FROM_PIC_SUBMISSION';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'ORG_UNIT_CREATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'ORG_UNIT_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'POSTING_ORDER_CREATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'POSTING_ORDER_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'POSTING_ORDER_CLAIMED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'POSTING_ORDER_RELEASED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'POSTING_ORDER_SUBMITTED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'POSTING_SUBMISSION_STATUS_UPDATED';

CREATE TABLE "org_units" (
    "id" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "code" VARCHAR(80),
    "status" "OrgUnitStatus" NOT NULL DEFAULT 'ACTIVE',
    "parent_id" UUID,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "org_units_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "users"
ADD COLUMN "pic_unit_id" UUID;

ALTER TABLE "blast_targets"
ADD COLUMN "source_posting_submission_id" UUID;

CREATE TABLE "posting_orders" (
    "id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "target_unit_id" UUID NOT NULL,
    "platform" "Platform" NOT NULL,
    "content_drive_url" TEXT NOT NULL,
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "caption" TEXT,
    "description" TEXT,
    "status" "PostingOrderStatus" NOT NULL DEFAULT 'PUBLISHED_TO_QUEUE',
    "created_by" UUID NOT NULL,
    "claimed_by" UUID,
    "claimed_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "posting_orders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "posting_submissions" (
    "id" UUID NOT NULL,
    "posting_order_id" UUID NOT NULL,
    "submitted_by" UUID NOT NULL,
    "social_account_id" UUID NOT NULL,
    "posted_url" TEXT NOT NULL,
    "proof_drive_url" TEXT NOT NULL,
    "notes" TEXT,
    "status" "PostingSubmissionStatus" NOT NULL DEFAULT 'SUBMITTED',
    "review_notes" TEXT,
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMP(3),
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "posting_submissions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "blast_targets_source_posting_submission_id_key" ON "blast_targets"("source_posting_submission_id");
CREATE INDEX "users_pic_unit_id_idx" ON "users"("pic_unit_id");
CREATE INDEX "org_units_parent_id_idx" ON "org_units"("parent_id");
CREATE INDEX "org_units_status_idx" ON "org_units"("status");
CREATE INDEX "org_units_created_by_idx" ON "org_units"("created_by");
CREATE INDEX "org_units_created_at_idx" ON "org_units"("created_at");
CREATE INDEX "posting_orders_campaign_id_idx" ON "posting_orders"("campaign_id");
CREATE INDEX "posting_orders_target_unit_id_idx" ON "posting_orders"("target_unit_id");
CREATE INDEX "posting_orders_status_idx" ON "posting_orders"("status");
CREATE INDEX "posting_orders_claimed_by_idx" ON "posting_orders"("claimed_by");
CREATE INDEX "posting_orders_scheduled_at_idx" ON "posting_orders"("scheduled_at");
CREATE INDEX "posting_orders_created_at_idx" ON "posting_orders"("created_at");
CREATE UNIQUE INDEX "posting_submissions_posting_order_id_key" ON "posting_submissions"("posting_order_id");
CREATE INDEX "posting_submissions_submitted_by_idx" ON "posting_submissions"("submitted_by");
CREATE INDEX "posting_submissions_social_account_id_idx" ON "posting_submissions"("social_account_id");
CREATE INDEX "posting_submissions_status_idx" ON "posting_submissions"("status");
CREATE INDEX "posting_submissions_reviewed_by_idx" ON "posting_submissions"("reviewed_by");
CREATE INDEX "posting_submissions_submitted_at_idx" ON "posting_submissions"("submitted_at");

ALTER TABLE "org_units"
ADD CONSTRAINT "org_units_parent_id_fkey"
FOREIGN KEY ("parent_id") REFERENCES "org_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "org_units"
ADD CONSTRAINT "org_units_created_by_fkey"
FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "users"
ADD CONSTRAINT "users_pic_unit_id_fkey"
FOREIGN KEY ("pic_unit_id") REFERENCES "org_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "blast_targets"
ADD CONSTRAINT "blast_targets_source_posting_submission_id_fkey"
FOREIGN KEY ("source_posting_submission_id") REFERENCES "posting_submissions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "posting_orders"
ADD CONSTRAINT "posting_orders_campaign_id_fkey"
FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "posting_orders"
ADD CONSTRAINT "posting_orders_target_unit_id_fkey"
FOREIGN KEY ("target_unit_id") REFERENCES "org_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "posting_orders"
ADD CONSTRAINT "posting_orders_created_by_fkey"
FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "posting_orders"
ADD CONSTRAINT "posting_orders_claimed_by_fkey"
FOREIGN KEY ("claimed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "posting_submissions"
ADD CONSTRAINT "posting_submissions_posting_order_id_fkey"
FOREIGN KEY ("posting_order_id") REFERENCES "posting_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "posting_submissions"
ADD CONSTRAINT "posting_submissions_submitted_by_fkey"
FOREIGN KEY ("submitted_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "posting_submissions"
ADD CONSTRAINT "posting_submissions_social_account_id_fkey"
FOREIGN KEY ("social_account_id") REFERENCES "social_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "posting_submissions"
ADD CONSTRAINT "posting_submissions_reviewed_by_fkey"
FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
