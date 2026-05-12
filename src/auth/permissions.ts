import { createAccessControl } from 'better-auth/plugins/access';
import { adminAc, defaultStatements } from 'better-auth/plugins/admin/access';

export const rossAccessControl = createAccessControl({
  ...defaultStatements,
  campaign: ['create', 'read', 'update', 'archive', 'assign'],
  user: ['create', 'read', 'update', 'delete'],
  socialAccount: ['create', 'read', 'update', 'delete'],
  blastTarget: ['create', 'read', 'update', 'suggest', 'reblast'],
  blastAttempt: ['read', 'keep', 'release', 'cancel', 'complete'],
  blastReport: ['create', 'read'],
  commentCommand: ['create', 'read', 'update', 'status'],
  commentTask: ['read', 'keep', 'release', 'start', 'complete'],
  dashboard: ['read'],
  exportReport: ['create', 'read'],
  auditLog: ['read'],
} as const);

export const adminRole = rossAccessControl.newRole({
  ...adminAc.statements,
  campaign: ['create', 'read', 'update', 'archive', 'assign'],
  user: ['create', 'read', 'update', 'delete'],
  socialAccount: ['create', 'read', 'update', 'delete'],
  blastTarget: ['create', 'read', 'update', 'suggest', 'reblast'],
  blastAttempt: ['read', 'keep', 'release', 'cancel', 'complete'],
  blastReport: ['create', 'read'],
  commentCommand: ['create', 'read', 'update', 'status'],
  commentTask: ['read', 'keep', 'release', 'start', 'complete'],
  dashboard: ['read'],
  exportReport: ['create', 'read'],
  auditLog: ['read'],
});

export const buzzerRole = rossAccessControl.newRole({
  campaign: ['read'],
  blastTarget: ['read', 'suggest'],
  blastAttempt: ['read', 'keep', 'release', 'complete'],
  blastReport: ['create', 'read'],
  commentTask: ['read', 'keep', 'release', 'start', 'complete'],
});

export const viewerRole = rossAccessControl.newRole({
  campaign: ['read'],
  blastTarget: ['read'],
  blastAttempt: ['read'],
  blastReport: ['read'],
  commentCommand: ['read'],
  commentTask: ['read'],
  dashboard: ['read'],
  exportReport: ['create', 'read'],
});
