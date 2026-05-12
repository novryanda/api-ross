import { ROSS_ROLES_KEY } from './decorators/roles.decorator.js';
import { UserRole } from '../generated/prisma/client.js';
import { BlastAttemptsController } from '../blast-attempts/blast-attempts.controller.js';
import { CampaignsController } from '../campaigns/campaigns.controller.js';
import { CommentCommandsController } from '../comment-commands/comment-commands.controller.js';
import { CommentTasksController } from '../comment-tasks/comment-tasks.controller.js';
import { SocialAccountsController } from '../social-accounts/social-accounts.controller.js';
import { ExportsController } from '../exports/exports.controller.js';
import { AuditLogsController } from '../audit-logs/audit-logs.controller.js';

function rolesFor(controller: object, methodName: string): UserRole[] {
  const handler = Object.getPrototypeOf(controller)[methodName];
  return Reflect.getMetadata(ROSS_ROLES_KEY, handler) as UserRole[];
}

describe('RBAC metadata', () => {
  it('requires ADMIN for campaign write endpoints so VIEWER cannot write', () => {
    const controller = new CampaignsController({} as never);

    expect(rolesFor(controller, 'create')).toEqual([UserRole.ADMIN]);
    expect(rolesFor(controller, 'update')).toEqual([UserRole.ADMIN]);
    expect(rolesFor(controller, 'archive')).toEqual([UserRole.ADMIN]);
  });

  it('requires ADMIN for SocialAccount management so BUZZER cannot manage accounts', () => {
    const controller = new SocialAccountsController({} as never);

    expect(rolesFor(controller, 'create')).toEqual([UserRole.ADMIN]);
    expect(rolesFor(controller, 'update')).toEqual([UserRole.ADMIN]);
    expect(rolesFor(controller, 'updateStatus')).toEqual([UserRole.ADMIN]);
  });

  it('allows only BUZZER to keep blast attempts', () => {
    const controller = new BlastAttemptsController({} as never, {} as never);

    expect(rolesFor(controller, 'keep')).toEqual([UserRole.BUZZER]);
  });

  it('requires ADMIN for comment command writes', () => {
    const controller = new CommentCommandsController({} as never);

    expect(rolesFor(controller, 'create')).toEqual([UserRole.ADMIN]);
    expect(rolesFor(controller, 'update')).toEqual([UserRole.ADMIN]);
    expect(rolesFor(controller, 'updateStatus')).toEqual([UserRole.ADMIN]);
    expect(rolesFor(controller, 'assign')).toEqual([UserRole.ADMIN]);
  });

  it('allows only BUZZER to keep and complete comment tasks', () => {
    const controller = new CommentTasksController({} as never);

    expect(rolesFor(controller, 'keep')).toEqual([UserRole.BUZZER]);
    expect(rolesFor(controller, 'start')).toEqual([UserRole.BUZZER]);
    expect(rolesFor(controller, 'complete')).toEqual([UserRole.BUZZER]);
    expect(rolesFor(controller, 'release')).toEqual([
      UserRole.ADMIN,
      UserRole.BUZZER,
    ]);
  });

  it('restricts export writes to ADMIN while allowing VIEWER to read and download', () => {
    const controller = new ExportsController({} as never);

    expect(rolesFor(controller, 'create')).toEqual([UserRole.ADMIN]);
    expect(rolesFor(controller, 'retry')).toEqual([UserRole.ADMIN]);
    expect(rolesFor(controller, 'findAll')).toEqual([
      UserRole.ADMIN,
      UserRole.VIEWER,
    ]);
    expect(rolesFor(controller, 'findOne')).toEqual([
      UserRole.ADMIN,
      UserRole.VIEWER,
    ]);
    expect(rolesFor(controller, 'download')).toEqual([
      UserRole.ADMIN,
      UserRole.VIEWER,
    ]);
  });

  it('restricts all audit log reads to ADMIN', () => {
    const controller = new AuditLogsController({} as never);

    expect(rolesFor(controller, 'findAll')).toEqual([UserRole.ADMIN]);
    expect(rolesFor(controller, 'findById')).toEqual([UserRole.ADMIN]);
    expect(rolesFor(controller, 'findByCampaign')).toEqual([UserRole.ADMIN]);
  });
});
