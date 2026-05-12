import { SetMetadata } from '@nestjs/common';
import type { UserRole } from '../../generated/prisma/client.js';

export const CAMPAIGN_ACCESS_KEY = 'ross:campaign-access';

export type CampaignAccessOptions = {
  roles?: UserRole[];
  campaignIdParam?: string;
};

export const CampaignAccess = (options: CampaignAccessOptions = {}) =>
  SetMetadata(CAMPAIGN_ACCESS_KEY, options);
