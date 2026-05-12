-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'BUZZER', 'VIEWER');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'ACTIVE', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "CampaignMemberRole" AS ENUM ('ADMIN', 'BUZZER', 'VIEWER');

-- CreateEnum
CREATE TYPE "Platform" AS ENUM ('INSTAGRAM', 'TIKTOK', 'X', 'FACEBOOK');

-- CreateEnum
CREATE TYPE "SocialAccountCategory" AS ENUM ('MEDIA', 'INFLUENCER', 'COMMUNITY', 'BRAND', 'OTHER');

-- CreateEnum
CREATE TYPE "SocialAccountStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "BlastTargetSourceType" AS ENUM ('ADMIN', 'BUZZER_SUGGESTION');

-- CreateEnum
CREATE TYPE "BlastTargetReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "BlastTargetStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "BlastAttemptStatus" AS ENUM ('AVAILABLE', 'KEPT', 'COMPLETED', 'RELEASED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CommentStance" AS ENUM ('PRO', 'KONTRA');

-- CreateEnum
CREATE TYPE "CommentTaskStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'REJECTED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "ExportFormat" AS ENUM ('PDF', 'EXCEL');

-- CreateEnum
CREATE TYPE "ExportStatus" AS ENUM ('PROCESSING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'BUZZER',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "banned" BOOLEAN DEFAULT false,
    "ban_reason" TEXT,
    "ban_expires" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "user_id" UUID NOT NULL,
    "impersonated_by" TEXT,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" UUID NOT NULL,
    "account_id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "access_token" TEXT,
    "refresh_token" TEXT,
    "id_token" TEXT,
    "access_token_expires_at" TIMESTAMP(3),
    "refresh_token_expires_at" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verifications" (
    "id" UUID NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaigns" (
    "id" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "description" TEXT,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_members" (
    "id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "member_role" "CampaignMemberRole" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaign_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "social_accounts" (
    "id" UUID NOT NULL,
    "platform" "Platform" NOT NULL,
    "username" VARCHAR(150) NOT NULL,
    "display_name" VARCHAR(150) NOT NULL,
    "profile_url" TEXT NOT NULL,
    "category" "SocialAccountCategory" NOT NULL,
    "status" "SocialAccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "social_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blast_targets" (
    "id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "social_account_id" UUID NOT NULL,
    "post_url" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "instruction" TEXT,
    "submitted_by" UUID NOT NULL,
    "source_type" "BlastTargetSourceType" NOT NULL DEFAULT 'ADMIN',
    "review_status" "BlastTargetReviewStatus" NOT NULL DEFAULT 'APPROVED',
    "status" "BlastTargetStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "blast_targets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blast_attempts" (
    "id" UUID NOT NULL,
    "blast_target_id" UUID NOT NULL,
    "attempt_no" INTEGER NOT NULL,
    "status" "BlastAttemptStatus" NOT NULL DEFAULT 'AVAILABLE',
    "kept_by" UUID,
    "kept_at" TIMESTAMP(3),
    "keep_expires_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "blast_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blast_reports" (
    "id" UUID NOT NULL,
    "blast_attempt_id" UUID NOT NULL,
    "submitted_by" UUID NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "comments" INTEGER NOT NULL DEFAULT 0,
    "shares" INTEGER NOT NULL DEFAULT 0,
    "reposts" INTEGER NOT NULL DEFAULT 0,
    "proof_link" TEXT NOT NULL,
    "notes" TEXT,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blast_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comment_commands" (
    "id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "social_account_id" UUID,
    "target_post_url" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "stance" "CommentStance" NOT NULL,
    "narrative" TEXT NOT NULL,
    "instruction" TEXT,
    "deadline" TIMESTAMP(3),
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "comment_commands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comment_tasks" (
    "id" UUID NOT NULL,
    "command_id" UUID NOT NULL,
    "assigned_to" UUID NOT NULL,
    "assigned_by" UUID NOT NULL,
    "status" "CommentTaskStatus" NOT NULL DEFAULT 'PENDING',
    "proof_link" TEXT,
    "rejection_reason" TEXT,
    "blocked_reason" TEXT,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "comment_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "export_reports" (
    "id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "format" "ExportFormat" NOT NULL,
    "requested_by" UUID NOT NULL,
    "file_url" TEXT,
    "status" "ExportStatus" NOT NULL DEFAULT 'PROCESSING',
    "generated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "export_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "action" VARCHAR(100) NOT NULL,
    "entity_type" VARCHAR(100) NOT NULL,
    "entity_id" UUID NOT NULL,
    "old_value" JSONB,
    "new_value" JSONB,
    "ip_address" VARCHAR(45),
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "users_status_idx" ON "users"("status");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_key" ON "sessions"("token");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "accounts_user_id_idx" ON "accounts"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_provider_id_account_id_key" ON "accounts"("provider_id", "account_id");

-- CreateIndex
CREATE INDEX "verifications_identifier_idx" ON "verifications"("identifier");

-- CreateIndex
CREATE INDEX "campaigns_status_idx" ON "campaigns"("status");

-- CreateIndex
CREATE INDEX "campaigns_start_date_idx" ON "campaigns"("start_date");

-- CreateIndex
CREATE INDEX "campaigns_end_date_idx" ON "campaigns"("end_date");

-- CreateIndex
CREATE INDEX "campaigns_created_by_idx" ON "campaigns"("created_by");

-- CreateIndex
CREATE INDEX "campaign_members_campaign_id_idx" ON "campaign_members"("campaign_id");

-- CreateIndex
CREATE INDEX "campaign_members_user_id_idx" ON "campaign_members"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_members_campaign_id_user_id_key" ON "campaign_members"("campaign_id", "user_id");

-- CreateIndex
CREATE INDEX "social_accounts_platform_idx" ON "social_accounts"("platform");

-- CreateIndex
CREATE INDEX "social_accounts_status_idx" ON "social_accounts"("status");

-- CreateIndex
CREATE UNIQUE INDEX "social_accounts_platform_username_key" ON "social_accounts"("platform", "username");

-- CreateIndex
CREATE INDEX "blast_targets_campaign_id_idx" ON "blast_targets"("campaign_id");

-- CreateIndex
CREATE INDEX "blast_targets_social_account_id_idx" ON "blast_targets"("social_account_id");

-- CreateIndex
CREATE INDEX "blast_targets_submitted_by_idx" ON "blast_targets"("submitted_by");

-- CreateIndex
CREATE INDEX "blast_targets_platform_idx" ON "blast_targets"("platform");

-- CreateIndex
CREATE INDEX "blast_targets_status_idx" ON "blast_targets"("status");

-- CreateIndex
CREATE INDEX "blast_targets_review_status_idx" ON "blast_targets"("review_status");

-- CreateIndex
CREATE UNIQUE INDEX "blast_targets_campaign_id_post_url_key" ON "blast_targets"("campaign_id", "post_url");

-- CreateIndex
CREATE INDEX "blast_attempts_blast_target_id_idx" ON "blast_attempts"("blast_target_id");

-- CreateIndex
CREATE INDEX "blast_attempts_status_idx" ON "blast_attempts"("status");

-- CreateIndex
CREATE INDEX "blast_attempts_kept_by_idx" ON "blast_attempts"("kept_by");

-- CreateIndex
CREATE INDEX "blast_attempts_keep_expires_at_idx" ON "blast_attempts"("keep_expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "blast_attempts_blast_target_id_attempt_no_key" ON "blast_attempts"("blast_target_id", "attempt_no");

-- CreateIndex
CREATE UNIQUE INDEX "blast_reports_blast_attempt_id_key" ON "blast_reports"("blast_attempt_id");

-- CreateIndex
CREATE INDEX "blast_reports_submitted_by_idx" ON "blast_reports"("submitted_by");

-- CreateIndex
CREATE INDEX "blast_reports_submitted_at_idx" ON "blast_reports"("submitted_at");

-- CreateIndex
CREATE INDEX "comment_commands_campaign_id_idx" ON "comment_commands"("campaign_id");

-- CreateIndex
CREATE INDEX "comment_commands_social_account_id_idx" ON "comment_commands"("social_account_id");

-- CreateIndex
CREATE INDEX "comment_commands_platform_idx" ON "comment_commands"("platform");

-- CreateIndex
CREATE INDEX "comment_commands_stance_idx" ON "comment_commands"("stance");

-- CreateIndex
CREATE INDEX "comment_commands_created_by_idx" ON "comment_commands"("created_by");

-- CreateIndex
CREATE INDEX "comment_tasks_command_id_idx" ON "comment_tasks"("command_id");

-- CreateIndex
CREATE INDEX "comment_tasks_assigned_to_idx" ON "comment_tasks"("assigned_to");

-- CreateIndex
CREATE INDEX "comment_tasks_assigned_by_idx" ON "comment_tasks"("assigned_by");

-- CreateIndex
CREATE INDEX "comment_tasks_status_idx" ON "comment_tasks"("status");

-- CreateIndex
CREATE UNIQUE INDEX "comment_tasks_command_id_assigned_to_key" ON "comment_tasks"("command_id", "assigned_to");

-- CreateIndex
CREATE INDEX "export_reports_campaign_id_idx" ON "export_reports"("campaign_id");

-- CreateIndex
CREATE INDEX "export_reports_requested_by_idx" ON "export_reports"("requested_by");

-- CreateIndex
CREATE INDEX "export_reports_created_at_idx" ON "export_reports"("created_at");

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_idx" ON "audit_logs"("actor_id");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_idx" ON "audit_logs"("entity_type");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_members" ADD CONSTRAINT "campaign_members_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_members" ADD CONSTRAINT "campaign_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_accounts" ADD CONSTRAINT "social_accounts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blast_targets" ADD CONSTRAINT "blast_targets_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blast_targets" ADD CONSTRAINT "blast_targets_social_account_id_fkey" FOREIGN KEY ("social_account_id") REFERENCES "social_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blast_targets" ADD CONSTRAINT "blast_targets_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blast_attempts" ADD CONSTRAINT "blast_attempts_blast_target_id_fkey" FOREIGN KEY ("blast_target_id") REFERENCES "blast_targets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blast_attempts" ADD CONSTRAINT "blast_attempts_kept_by_fkey" FOREIGN KEY ("kept_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blast_reports" ADD CONSTRAINT "blast_reports_blast_attempt_id_fkey" FOREIGN KEY ("blast_attempt_id") REFERENCES "blast_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blast_reports" ADD CONSTRAINT "blast_reports_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comment_commands" ADD CONSTRAINT "comment_commands_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comment_commands" ADD CONSTRAINT "comment_commands_social_account_id_fkey" FOREIGN KEY ("social_account_id") REFERENCES "social_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comment_commands" ADD CONSTRAINT "comment_commands_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comment_tasks" ADD CONSTRAINT "comment_tasks_command_id_fkey" FOREIGN KEY ("command_id") REFERENCES "comment_commands"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comment_tasks" ADD CONSTRAINT "comment_tasks_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comment_tasks" ADD CONSTRAINT "comment_tasks_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "export_reports" ADD CONSTRAINT "export_reports_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "export_reports" ADD CONSTRAINT "export_reports_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
