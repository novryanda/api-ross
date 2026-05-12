import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { CommonModule } from './common/common.module.js';
import { RossAuthModule } from './auth/ross-auth.module.js';
import { AuditLogModule } from './audit-logs/audit-log.module.js';
import { UsersModule } from './users/users.module.js';
import { ProfileModule } from './profile/profile.module.js';
import { CampaignsModule } from './campaigns/campaigns.module.js';
import { CampaignMembersModule } from './campaign-members/campaign-members.module.js';
import { SocialAccountsModule } from './social-accounts/social-accounts.module.js';
import { BlastTargetsModule } from './blast-targets/blast-targets.module.js';
import { BlastAttemptsModule } from './blast-attempts/blast-attempts.module.js';
import { BlastReportsModule } from './blast-reports/blast-reports.module.js';
import { CommentCommandsModule } from './comment-commands/comment-commands.module.js';
import { CommentTasksModule } from './comment-tasks/comment-tasks.module.js';
import { ExportsModule } from './exports/exports.module.js';

@Module({
  imports: [
    CommonModule,
    RossAuthModule,
    AuditLogModule,
    UsersModule,
    ProfileModule,
    CampaignsModule,
    CampaignMembersModule,
    SocialAccountsModule,
    BlastTargetsModule,
    BlastAttemptsModule,
    BlastReportsModule,
    CommentCommandsModule,
    CommentTasksModule,
    ExportsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
