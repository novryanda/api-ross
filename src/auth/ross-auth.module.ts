import { Module } from '@nestjs/common';
import { AuthModule } from '@thallesp/nestjs-better-auth';
import { auth } from './auth.js';
import { AuthController } from './auth.controller.js';
import { AuthSessionGuard } from './guards/auth-session.guard.js';
import { CampaignAccessGuard } from './guards/campaign-access.guard.js';
import { RolesGuard } from './guards/roles.guard.js';

@Module({
  imports: [
    AuthModule.forRoot({
      auth,
      bodyParser: {
        json: { limit: '2mb' },
        urlencoded: { limit: '2mb', extended: true },
      },
    }),
  ],
  controllers: [AuthController],
  providers: [RolesGuard, CampaignAccessGuard, AuthSessionGuard],
  exports: [RolesGuard, CampaignAccessGuard, AuthSessionGuard],
})
export class RossAuthModule {}
