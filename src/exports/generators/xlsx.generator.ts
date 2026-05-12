import ExcelJS from 'exceljs';
import { ExportScope } from '../../generated/prisma/client.js';
import type { ExportSnapshot } from './snapshot.js';

function platformRows(snapshot: ExportSnapshot) {
  return snapshot.platformBreakdown ?? [];
}

function buzzerRows(snapshot: ExportSnapshot) {
  return snapshot.topBuzzers ?? [];
}

function formatDate(value: Date | null | undefined): string {
  return value ? new Date(value).toISOString() : '';
}

function formatDateRange(from: Date | null, to: Date | null): string {
  if (!from && !to) return 'All time';
  if (from && to) return `${formatDate(from)} - ${formatDate(to)}`;
  if (from) return `${formatDate(from)} - present`;
  return `Until ${formatDate(to)}`;
}

function styleSheet(sheet: ExcelJS.Worksheet) {
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF0B3A75' },
  };
  header.alignment = { vertical: 'middle' };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  if (sheet.columnCount > 0 && sheet.rowCount > 0) {
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: sheet.columnCount },
    };
  }
  sheet.eachRow((row) => {
    row.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      };
      cell.alignment = { vertical: 'top', wrapText: true };
    });
  });
  sheet.columns.forEach((column) => {
    let max = String(column.header ?? '').length;
    column.eachCell?.({ includeEmpty: false }, (cell) => {
      max = Math.max(max, String(cell.value ?? '').length);
    });
    column.width = Math.min(Math.max(max + 2, column.width ?? 12), 52);
  });
}

function addEmptyRow(sheet: ExcelJS.Worksheet, message: string) {
  const row: Record<string, string> = {};
  const key = String(sheet.columns[0]?.key ?? 'message');
  row[key] = message;
  sheet.addRow(row);
}

function addCampaignOverview(workbook: ExcelJS.Workbook, snapshot: ExportSnapshot) {
  const sheet = workbook.addWorksheet('Campaign Overview');
  sheet.columns = [
    { header: 'Field', key: 'field', width: 28 },
    { header: 'Value', key: 'value', width: 70 },
  ];
  sheet.addRows([
    { field: 'Campaign', value: snapshot.campaign.name },
    { field: 'Campaign ID', value: snapshot.campaign.id },
    { field: 'Description', value: snapshot.campaign.description ?? '' },
    { field: 'Campaign Status', value: snapshot.campaign.status },
    { field: 'Campaign Period', value: formatDateRange(snapshot.campaign.startDate, snapshot.campaign.endDate) },
    { field: 'Export Scope', value: snapshot.meta.scope },
    { field: 'Export Format', value: snapshot.meta.format },
    { field: 'Date Filter', value: formatDateRange(snapshot.meta.dateFrom, snapshot.meta.dateTo) },
    { field: 'Generated At', value: formatDate(snapshot.meta.generatedAt) },
    { field: 'Requested By', value: `${snapshot.meta.requestedBy.name} <${snapshot.meta.requestedBy.email}>` },
  ]);
  styleSheet(sheet);
}

function addSummary(workbook: ExcelJS.Workbook, snapshot: ExportSnapshot) {
  const sheet = workbook.addWorksheet('Summary');
  sheet.columns = [
    { header: 'Metric', key: 'metric', width: 34 },
    { header: 'Value', key: 'value', width: 18 },
  ];
  sheet.addRows([
    { metric: 'Total blast targets', value: snapshot.summary.totalBlastTargets },
    { metric: 'Total attempts', value: snapshot.summary.totalAttempts },
    { metric: 'Completed attempts', value: snapshot.summary.completedAttempts },
    { metric: 'Available attempts', value: snapshot.summary.availableAttempts },
    { metric: 'Kept attempts', value: snapshot.summary.keptAttempts },
    { metric: 'Expired attempts', value: snapshot.summary.expiredAttempts },
    { metric: 'Total blast reports', value: snapshot.summary.totalBlastReports },
    { metric: 'Total views', value: snapshot.summary.totalViews },
    { metric: 'Total likes', value: snapshot.summary.totalLikes },
    { metric: 'Total comments', value: snapshot.summary.totalComments },
    { metric: 'Total shares', value: snapshot.summary.totalShares },
    { metric: 'Total reposts', value: snapshot.summary.totalReposts },
    { metric: 'Total engagement', value: snapshot.summary.totalEngagement },
    { metric: 'Comment commands count', value: snapshot.summary.commentCommandsCount },
    { metric: 'Total comment tasks', value: snapshot.summary.totalCommentTasks },
    { metric: 'Available comment tasks', value: snapshot.summary.availableCommentTasks },
    { metric: 'Kept comment tasks', value: snapshot.summary.keptCommentTasks },
    { metric: 'In progress comment tasks', value: snapshot.summary.inProgressCommentTasks },
    { metric: 'Completed comment tasks', value: snapshot.summary.totalCompletedCommentTasks },
    { metric: 'Expired comment tasks', value: snapshot.summary.expiredCommentTasks },
  ]);
  styleSheet(sheet);

  const platform = workbook.addWorksheet('Platform Breakdown');
  platform.columns = [
    { header: 'Platform', key: 'platform', width: 18 },
    { header: 'Blast Reports', key: 'blastReports', width: 16 },
    { header: 'Views', key: 'views', width: 14 },
    { header: 'Likes', key: 'likes', width: 14 },
    { header: 'Comments', key: 'comments', width: 14 },
    { header: 'Shares', key: 'shares', width: 14 },
    { header: 'Reposts', key: 'reposts', width: 14 },
    { header: 'Engagement', key: 'totalEngagement', width: 16 },
  ];
  const platforms = platformRows(snapshot);
  if (platforms.length) {
    platform.addRows(platforms);
  } else {
    addEmptyRow(platform, 'Belum ada platform breakdown pada scope/rentang tanggal ini.');
  }
  styleSheet(platform);
}

function addBlastReports(workbook: ExcelJS.Workbook, snapshot: ExportSnapshot) {
  const sheet = workbook.addWorksheet('Blast Reports');
  sheet.columns = [
    { header: 'No', key: 'no', width: 8 },
    { header: 'Report ID', key: 'id', width: 38 },
    { header: 'Platform', key: 'platform', width: 14 },
    { header: 'Source Account', key: 'sourceAccount', width: 24 },
    { header: 'Target Post URL', key: 'postUrl', width: 48 },
    { header: 'Attempt No', key: 'attemptNo', width: 12 },
    { header: 'Attempt Status', key: 'attemptStatus', width: 16 },
    { header: 'Submitted By', key: 'submittedByName', width: 24 },
    { header: 'Submitted At', key: 'submittedAt', width: 24 },
    { header: 'Views', key: 'views', width: 12 },
    { header: 'Likes', key: 'likes', width: 12 },
    { header: 'Comments', key: 'comments', width: 12 },
    { header: 'Shares', key: 'shares', width: 12 },
    { header: 'Reposts', key: 'reposts', width: 12 },
    { header: 'Engagement Total', key: 'totalEngagement', width: 18 },
    { header: 'Proof Link', key: 'proofLink', width: 48 },
    { header: 'Notes', key: 'notes', width: 40 },
  ];
  if (snapshot.blastReports.length) {
    snapshot.blastReports.forEach((row, index) =>
      sheet.addRow({
        no: index + 1,
        ...row,
        submittedAt: formatDate(row.submittedAt),
      }),
    );
  } else {
    addEmptyRow(sheet, 'Belum ada Blast Report pada scope/rentang tanggal ini.');
  }
  styleSheet(sheet);
}

function addCommentTasks(workbook: ExcelJS.Workbook, snapshot: ExportSnapshot) {
  const sheet = workbook.addWorksheet('Comment Tasks');
  sheet.columns = [
    { header: 'No', key: 'no', width: 8 },
    { header: 'Task ID', key: 'id', width: 38 },
    { header: 'Command ID', key: 'commandId', width: 38 },
    { header: 'Stance', key: 'stance', width: 12 },
    { header: 'Platform', key: 'platform', width: 14 },
    { header: 'Target URL', key: 'targetPostUrl', width: 48 },
    { header: 'Slot/Task No', key: 'taskNo', width: 14 },
    { header: 'Status', key: 'status', width: 16 },
    { header: 'Kept By', key: 'keptByName', width: 24 },
    { header: 'Completed At', key: 'completedAt', width: 24 },
    { header: 'Proof Link', key: 'proofLink', width: 48 },
    { header: 'Notes', key: 'notes', width: 40 },
  ];
  if (snapshot.commentTasks.length) {
    snapshot.commentTasks.forEach((row, index) =>
      sheet.addRow({
        no: index + 1,
        ...row,
        completedAt: formatDate(row.completedAt),
      }),
    );
  } else {
    addEmptyRow(sheet, 'Belum ada completed Comment Task pada scope/rentang tanggal ini.');
  }
  styleSheet(sheet);
}

function addTopBuzzers(workbook: ExcelJS.Workbook, snapshot: ExportSnapshot) {
  const sheet = workbook.addWorksheet('Top Buzzers');
  sheet.columns = [
    { header: 'No', key: 'no', width: 8 },
    { header: 'Buzzer', key: 'name', width: 26 },
    { header: 'Email', key: 'email', width: 34 },
    { header: 'Blast Reports', key: 'blastReports', width: 16 },
    { header: 'Comment Tasks Completed', key: 'commentTasks', width: 24 },
    { header: 'Total Engagement', key: 'totalEngagement', width: 18 },
  ];
  const buzzers = buzzerRows(snapshot);
  if (buzzers.length) {
    buzzers.forEach((row, index) => sheet.addRow({ no: index + 1, ...row }));
  } else {
    addEmptyRow(sheet, 'Belum ada top buzzer summary pada scope/rentang tanggal ini.');
  }
  styleSheet(sheet);
}

export async function renderSnapshotAsXlsx(
  snapshot: ExportSnapshot,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'ROSS/BuzzTrack Exports';
  workbook.created = snapshot.meta.generatedAt;

  if (snapshot.meta.scope === ExportScope.SUMMARY) {
    addSummary(workbook, snapshot);
    addCampaignOverview(workbook, snapshot);
  } else if (snapshot.meta.scope === ExportScope.BLAST_REPORTS) {
    addBlastReports(workbook, snapshot);
  } else if (snapshot.meta.scope === ExportScope.COMMENT_TASKS) {
    addCommentTasks(workbook, snapshot);
  } else {
    addSummary(workbook, snapshot);
    addBlastReports(workbook, snapshot);
    addCommentTasks(workbook, snapshot);
    addTopBuzzers(workbook, snapshot);
    addCampaignOverview(workbook, snapshot);
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
