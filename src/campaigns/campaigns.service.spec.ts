import {
  CommentStance,
  CommentTaskStatus,
} from '../generated/prisma/client.js';
import { CampaignsService } from './campaigns.service.js';

describe('CampaignsService dashboard comment metrics', () => {
  it('builds comment metrics from grouped command and task counts', () => {
    const service = new CampaignsService({} as never, {} as never);
    const metrics = (
      service as unknown as {
        buildCommentMetrics: (
          commandCounts: Array<{
            stance: CommentStance;
            _count: { _all: number };
          }>,
          taskCounts: Array<{
            status: CommentTaskStatus;
            _count: { _all: number };
          }>,
          overdueCommentTasks: number,
        ) => Record<string, number>;
      }
    ).buildCommentMetrics(
      [
        { stance: CommentStance.PRO, _count: { _all: 2 } },
        { stance: CommentStance.KONTRA, _count: { _all: 1 } },
      ],
      [
        { status: CommentTaskStatus.AVAILABLE, _count: { _all: 3 } },
        { status: CommentTaskStatus.KEPT, _count: { _all: 4 } },
        { status: CommentTaskStatus.IN_PROGRESS, _count: { _all: 4 } },
        { status: CommentTaskStatus.COMPLETED, _count: { _all: 5 } },
        { status: CommentTaskStatus.RELEASED, _count: { _all: 1 } },
        { status: CommentTaskStatus.EXPIRED, _count: { _all: 2 } },
        { status: CommentTaskStatus.CANCELLED, _count: { _all: 1 } },
      ],
      6,
    );

    expect(metrics).toEqual({
      totalCommentCommands: 3,
      totalCommentTasks: 20,
      availableCommentTasks: 3,
      keptCommentTasks: 4,
      pendingCommentTasks: 3,
      inProgressCommentTasks: 4,
      completedCommentTasks: 5,
      releasedCommentTasks: 1,
      expiredCommentTasks: 2,
      cancelledCommentTasks: 1,
      rejectedCommentTasks: 0,
      blockedCommentTasks: 0,
      proCommandCount: 2,
      kontraCommandCount: 1,
      overdueCommentTasks: 6,
    });
  });
});
