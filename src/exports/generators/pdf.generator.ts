import PDFDocument from 'pdfkit';
import type PDFKit from 'pdfkit';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ExportScope } from '../../generated/prisma/client.js';
import type {
  ExportSnapshot,
  SnapshotBlastReportRow,
  SnapshotCommentTaskRow,
  SnapshotPlatformBreakdownRow,
} from './snapshot.js';

const COLORS = {
  navy: '#0B1E3A',
  darkText: '#101828',
  mutedText: '#667085',
  border: '#D9E2EC',
  cardBg: '#FFFFFF',
  softBg: '#F8FAFC',
  headerBg: '#EEF4FF',
  accentBlue: '#2563EB',
  cyan: '#06B6D4',
  green: '#16A34A',
  red: '#DC2626',
  amber: '#D97706',
  violet: '#7C3AED',
  pink: '#DB2777',
};

const FONT = {
  coverTitle: 24,
  pageTitle: 16,
  sectionTitle: 12,
  body: 8,
  small: 7,
  kpiValue: 14,
  kpiLabel: 7,
};

const PAGE = {
  margin: 30,
  width: 841.89,
  height: 595.28,
  contentTop: 58,
  contentBottom: 520,
  footerY: 538,
  contentWidth: 781.89,
  radius: 8,
};

type PdfContext = {
  doc: PDFKit.PDFDocument;
  snapshot: ExportSnapshot;
};

type Align = 'left' | 'center' | 'right';

type Kpi = {
  label: string;
  value: string;
  sub?: string;
  tone?: keyof typeof TONE_COLORS;
};

type TableColumn<T> = {
  header: string;
  width: number;
  get: (row: T, index: number) => string;
  align?: Align;
  link?: (row: T) => string | null | undefined;
  color?: (row: T) => string;
};

type TableOptions<T> = {
  emptyTitle: string;
  emptyDescription: string;
  totalRow?: string[];
  repeatHeader?: boolean;
  width?: number;
  compact?: boolean;
  containerRightBoundary?: number;
};

type ChartItem = {
  label: string;
  value: number;
  color?: string;
  sub?: string;
};

type HorizontalBarChartOptions = {
  x: number;
  y: number;
  width: number;
  height?: number;
  title?: string;
  maxValue?: number;
  showValue?: boolean;
  showPercent?: boolean;
  drawContainer?: boolean;
};

type DonutChartOptions = {
  x: number;
  y: number;
  radius: number;
  thickness: number;
  segments: ChartItem[];
  legendX?: number;
  legendY?: number;
  legendWidth?: number;
  title?: string;
  cardX?: number;
  cardY?: number;
  cardWidth?: number;
  cardHeight?: number;
  showPercent?: boolean;
  drawContainer?: boolean;
};

const TONE_COLORS = {
  blue: COLORS.accentBlue,
  cyan: COLORS.cyan,
  green: COLORS.green,
  red: COLORS.red,
  amber: COLORS.amber,
  violet: COLORS.violet,
  pink: COLORS.pink,
};

const ROSS_LOGO_PATHS = [
  join(process.cwd(), 'asset', 'ross1.jpg-removebg-preview.png'),
  join(process.cwd(), 'api', 'asset', 'ross1.jpg-removebg-preview.png'),
];

function rossLogoPath(): string | null {
  return ROSS_LOGO_PATHS.find((path) => existsSync(path)) ?? null;
}

function safeText(value: unknown, fallback = '-'): string {
  if (value === null || value === undefined || value === '') return fallback;
  return String(value).replace(/\s+/g, ' ').trim() || fallback;
}

function formatDate(value: Date | null | undefined): string {
  if (!value) return '-';
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Jakarta',
  }).format(new Date(value));
}

function formatDateTime(value: Date | null | undefined): string {
  if (!value) return '-';
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Jakarta',
  }).format(new Date(value));
}

function formatDateRange(from: Date | null, to: Date | null): string {
  if (!from && !to) return 'All time';
  if (from && to) return `${formatDate(from)} - ${formatDate(to)}`;
  if (from) return `${formatDate(from)} - present`;
  return `Until ${formatDate(to)}`;
}

function formatNumber(value: number | null | undefined): string {
  return Number(value || 0).toLocaleString('en-US');
}

function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return '0%';
  return `${value.toFixed(value % 1 === 0 ? 0 : 1)}%`;
}

function formatStatus(value: string): string {
  return safeText(value).replace(/_/g, ' ');
}

function scopeTitle(scope: ExportScope): string {
  const titles: Record<ExportScope, string> = {
    SUMMARY: 'Summary Report',
    BLAST_REPORTS: 'Blast Reports',
    COMMENT_TASKS: 'Comment Tasks',
    FULL: 'Full Campaign Report',
  };
  return titles[scope];
}

function wrapUrl(value: string | null | undefined, maxLength = 58): string {
  const text = safeText(value, '');
  if (!text) return '-';
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

function completionRate(snapshot: ExportSnapshot): number {
  const denominator =
    snapshot.summary.totalAttempts + snapshot.summary.totalCommentTasks;
  const numerator =
    snapshot.summary.completedAttempts +
    snapshot.summary.totalCompletedCommentTasks;
  return denominator > 0 ? (numerator / denominator) * 100 : 0;
}

function measureText(
  doc: PDFKit.PDFDocument,
  text: string,
  width: number,
  fontSize = FONT.body,
  font = 'Helvetica',
) {
  const previousX = doc.x;
  const previousY = doc.y;
  doc.font(font).fontSize(fontSize);
  const height = doc.heightOfString(text, { width });
  doc.x = previousX;
  doc.y = previousY;
  return height;
}

function drawPageHeader(doc: PDFKit.PDFDocument, snapshot: ExportSnapshot) {
  const y = 24;
  doc
    .font('Helvetica')
    .fontSize(FONT.small)
    .fillColor(COLORS.mutedText)
    .text(snapshot.campaign.name, PAGE.margin, y, { width: 310 })
    .text(
      formatDateRange(snapshot.meta.dateFrom, snapshot.meta.dateTo),
      PAGE.width - PAGE.margin - 230,
      y,
      { width: 230, align: 'right' },
    );
  doc
    .moveTo(PAGE.margin, y + 18)
    .lineTo(PAGE.width - PAGE.margin, y + 18)
    .strokeColor(COLORS.border)
    .lineWidth(0.6)
    .stroke();
}

function drawPageFooter(doc: PDFKit.PDFDocument, page: number, total: number) {
  doc
    .moveTo(PAGE.margin, PAGE.footerY - 10)
    .lineTo(PAGE.width - PAGE.margin, PAGE.footerY - 10)
    .strokeColor(COLORS.border)
    .lineWidth(0.5)
    .stroke();
  const logoPath = rossLogoPath();
  if (logoPath) {
    doc.image(logoPath, PAGE.margin, PAGE.footerY - 5, { width: 28 });
  } else {
    doc
      .font('Helvetica-Bold')
      .fontSize(FONT.small)
      .fillColor(COLORS.accentBlue)
      .text('ROSS', PAGE.margin, PAGE.footerY, { width: 28 });
  }
  doc
    .font('Helvetica')
    .fontSize(FONT.small)
    .fillColor(COLORS.mutedText)
    .text('BuzzTrack Command', PAGE.margin + 34, PAGE.footerY, {
      width: 150,
    })
    .text(
      `Page ${page} of ${total}`,
      PAGE.width - PAGE.margin - 80,
      PAGE.footerY,
      {
        width: 80,
        align: 'right',
      },
    );
}

function drawFinalPageFrames(ctx: PdfContext) {
  const range = ctx.doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i += 1) {
    ctx.doc.switchToPage(i);
    if (i !== range.start) {
      drawPageHeader(ctx.doc, ctx.snapshot);
    }
    drawPageFooter(ctx.doc, i - range.start + 1, range.count);
  }
}

function addPage(ctx: PdfContext) {
  ctx.doc.addPage();
  ctx.doc.y = PAGE.contentTop;
}

function addPageIfNeeded(ctx: PdfContext, requiredHeight: number) {
  if (ctx.doc.y + requiredHeight > PAGE.contentBottom) addPage(ctx);
}

function drawSectionTitle(ctx: PdfContext, title: string) {
  const { doc } = ctx;
  doc
    .font('Helvetica-Bold')
    .fontSize(FONT.pageTitle)
    .fillColor(COLORS.darkText)
    .text(title, PAGE.margin, doc.y, { width: PAGE.contentWidth });
  doc.y += 22;
}

function drawCard(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  w: number,
  h: number,
  fill = COLORS.cardBg,
) {
  doc.roundedRect(x, y, w, h, PAGE.radius).fillAndStroke(fill, COLORS.border);
}

function drawBadge(
  doc: PDFKit.PDFDocument,
  text: string,
  x: number,
  y: number,
  color = COLORS.green,
) {
  const width = Math.max(44, text.length * 4.6 + 18);
  const fill =
    color === COLORS.green
      ? '#ECFDF3'
      : color === COLORS.red
        ? '#FEF2F2'
        : color === COLORS.accentBlue
          ? '#EFF6FF'
          : '#FFFBEB';
  doc.roundedRect(x, y, width, 15, 7).fillAndStroke(fill, color);
  doc
    .font('Helvetica-Bold')
    .fontSize(6)
    .fillColor(color)
    .text(text, x + 8, y + 4, { width: width - 16, align: 'center' });
}

function drawMetricCard(
  doc: PDFKit.PDFDocument,
  kpi: Kpi,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const tone = TONE_COLORS[kpi.tone ?? 'blue'];
  drawCard(doc, x, y, w, h);
  doc.circle(x + 18, y + 18, 5).fill(`${tone}`);
  doc
    .font('Helvetica-Bold')
    .fontSize(FONT.kpiLabel)
    .fillColor(COLORS.mutedText)
    .text(kpi.label, x + 34, y + 11, { width: w - 44 });
  doc
    .font('Helvetica-Bold')
    .fontSize(FONT.kpiValue)
    .fillColor(COLORS.darkText)
    .text(kpi.value, x + 12, y + 30, { width: w - 24 });
  if (kpi.sub) {
    doc
      .font('Helvetica')
      .fontSize(6.5)
      .fillColor(COLORS.mutedText)
      .text(kpi.sub, x + 12, y + 49, { width: w - 24 });
  }
}

function drawKpiGrid(
  doc: PDFKit.PDFDocument,
  kpis: Kpi[],
  x: number,
  y: number,
  w: number,
  columns = 4,
  cardH = 54,
) {
  const gap = 10;
  const cardW = (w - gap * (columns - 1)) / columns;
  kpis.forEach((kpi, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    drawMetricCard(
      doc,
      kpi,
      x + col * (cardW + gap),
      y + row * (cardH + gap),
      cardW,
      cardH,
    );
  });
  return y + Math.ceil(kpis.length / columns) * (cardH + gap) - gap;
}

function drawKeyValueGrid(
  doc: PDFKit.PDFDocument,
  items: Array<[string, string]>,
  x: number,
  y: number,
  w: number,
  columns = 2,
) {
  const gap = 12;
  const colW = (w - gap * (columns - 1)) / columns;
  let cursorY = y;
  for (let index = 0; index < items.length; index += columns) {
    const row = items.slice(index, index + columns);
    const rowH =
      Math.max(
        ...row.map(
          ([, value]) => measureText(doc, value, colW, FONT.body) + 18,
        ),
      ) + 2;
    row.forEach(([label, value], col) => {
      const cellX = x + col * (colW + gap);
      doc
        .font('Helvetica-Bold')
        .fontSize(FONT.small)
        .fillColor(COLORS.mutedText)
        .text(label, cellX, cursorY, { width: colW });
      doc
        .font('Helvetica')
        .fontSize(FONT.body)
        .fillColor(COLORS.darkText)
        .text(value, cellX, cursorY + 11, { width: colW });
    });
    cursorY += rowH;
  }
  return cursorY;
}

function drawEmptyState(
  doc: PDFKit.PDFDocument,
  title: string,
  description: string,
  x: number,
  y: number,
  w: number,
  h = 72,
) {
  drawCard(doc, x, y, w, h, COLORS.softBg);
  doc
    .font('Helvetica-Bold')
    .fontSize(9)
    .fillColor(COLORS.darkText)
    .text(title, x + 14, y + 18, { width: w - 28 });
  doc
    .font('Helvetica')
    .fontSize(FONT.body)
    .fillColor(COLORS.mutedText)
    .text(description, x + 14, y + 34, { width: w - 28 });
}

function drawMiniLegend(
  doc: PDFKit.PDFDocument,
  items: ChartItem[],
  x: number,
  y: number,
  w = 130,
  showPercent = false,
) {
  const total = items.reduce((sum, item) => sum + item.value, 0);
  items.forEach((item, index) => {
    const color = item.color ?? TONE_COLORS.blue;
    const rowY = y + index * 18;
    const valueText =
      showPercent && total > 0
        ? `${formatPercent((item.value / total) * 100)} / ${formatNumber(
            item.value,
          )}`
        : (item.sub ?? formatNumber(item.value));
    doc.circle(x + 4, rowY + 5, 3).fill(color);
    doc
      .font('Helvetica')
      .fontSize(FONT.small)
      .fillColor(COLORS.darkText)
      .text(item.label, x + 14, rowY, { width: w - 72, ellipsis: true })
      .fillColor(COLORS.mutedText)
      .text(valueText, x + w - 68, rowY, {
        width: 68,
        align: 'right',
        ellipsis: true,
      });
  });
}

function drawDonutChart(
  doc: PDFKit.PDFDocument,
  segmentsOrOptions: ChartItem[] | DonutChartOptions,
  legacyX?: number,
  legacyY?: number,
  legacyRadius?: number,
) {
  const options: DonutChartOptions = Array.isArray(segmentsOrOptions)
    ? {
        segments: segmentsOrOptions,
        x: legacyX ?? 0,
        y: legacyY ?? 0,
        radius: legacyRadius ?? 44,
        thickness: 18,
      }
    : segmentsOrOptions;
  const {
    x,
    y,
    radius,
    thickness,
    segments,
    legendX,
    legendY,
    legendWidth = 150,
    title,
    cardX,
    cardY,
    cardWidth,
    cardHeight,
    showPercent = true,
    drawContainer = false,
  } = options;
  if (
    drawContainer &&
    cardX !== undefined &&
    cardY !== undefined &&
    cardWidth
  ) {
    drawCard(doc, cardX, cardY, cardWidth, cardHeight ?? radius * 2 + 48);
    if (title) {
      doc
        .font('Helvetica-Bold')
        .fontSize(9)
        .fillColor(COLORS.navy)
        .text(title, cardX + 14, cardY + 14, { width: cardWidth - 28 });
    }
  }
  const total = segments.reduce((sum, item) => sum + item.value, 0);
  if (total <= 0) {
    doc
      .circle(x, y, radius)
      .lineWidth(thickness)
      .strokeColor('#EEF2F7')
      .stroke();
    doc
      .font('Helvetica-Bold')
      .fontSize(FONT.small)
      .fillColor(COLORS.mutedText)
      .text('No data', x - radius, y - 4, {
        width: radius * 2,
        align: 'center',
      });
    return Math.max(radius * 2, 72);
  }
  let start = -90;
  segments.forEach((segment, index) => {
    const degrees = (segment.value / total) * 360;
    const end = start + degrees;
    doc
      .save()
      .lineWidth(thickness)
      .strokeColor(segment.color ?? Object.values(TONE_COLORS)[index % 7]);
    if (degrees >= 359.9) {
      doc.circle(x, y, radius).stroke();
    } else if (degrees > 0) {
      doc.path(describeArc(x, y, radius, start, end)).stroke();
    }
    doc.restore();
    start = end;
  });
  doc.circle(x, y, Math.max(1, radius - thickness / 2)).fill(COLORS.cardBg);
  if (legendX !== undefined && legendY !== undefined) {
    drawMiniLegend(doc, segments, legendX, legendY, legendWidth, showPercent);
  }
  return Math.max(radius * 2, segments.length * 18);
}

function polarToCartesian(
  centerX: number,
  centerY: number,
  radius: number,
  angleInDegrees: number,
) {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;
  return {
    x: centerX + radius * Math.cos(angleInRadians),
    y: centerY + radius * Math.sin(angleInRadians),
  };
}

function describeArc(
  x: number,
  y: number,
  radius: number,
  startAngle: number,
  endAngle: number,
) {
  const start = polarToCartesian(x, y, radius, endAngle);
  const end = polarToCartesian(x, y, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';
  return [
    'M',
    start.x,
    start.y,
    'A',
    radius,
    radius,
    0,
    largeArcFlag,
    0,
    end.x,
    end.y,
  ].join(' ');
}

function drawHorizontalBarChart(
  doc: PDFKit.PDFDocument,
  items: ChartItem[],
  optionsOrX: HorizontalBarChartOptions | number,
  legacyY?: number,
  legacyW?: number,
  legacyMax?: number,
) {
  const options: HorizontalBarChartOptions =
    typeof optionsOrX === 'number'
      ? {
          x: optionsOrX,
          y: legacyY ?? 0,
          width: legacyW ?? 160,
          maxValue: legacyMax,
          drawContainer: false,
        }
      : optionsOrX;
  const {
    x,
    y,
    width,
    title,
    showValue = true,
    showPercent = false,
    drawContainer = true,
  } = options;
  const rowGap = 24;
  const padding = drawContainer ? 14 : 0;
  const chartX = x + padding;
  const chartY = y + padding + (title ? 24 : 0);
  const chartW = width - padding * 2;
  const computedHeight =
    options.height ??
    padding * 2 + (title ? 24 : 0) + Math.max(62, items.length * rowGap);
  if (drawContainer) {
    drawCard(doc, x, y, width, computedHeight);
    if (title) {
      doc
        .font('Helvetica-Bold')
        .fontSize(9)
        .fillColor(COLORS.navy)
        .text(title, x + 14, y + 14, { width: width - 28 });
    }
  }
  const total = items.reduce((sum, item) => sum + item.value, 0);
  const max =
    options.maxValue ?? Math.max(...items.map((item) => item.value), 0);
  if (!items.length || max <= 0 || total <= 0) {
    doc
      .roundedRect(chartX, chartY + 8, chartW, 34, 6)
      .fillAndStroke(COLORS.softBg, COLORS.border);
    doc
      .font('Helvetica-Bold')
      .fontSize(FONT.body)
      .fillColor(COLORS.mutedText)
      .text('No chart data available', chartX, chartY + 20, {
        width: chartW,
        align: 'center',
      });
    return computedHeight;
  }
  items.forEach((item, index) => {
    const rowY = chartY + index * rowGap;
    const labelW = Math.min(96, Math.max(58, chartW * 0.32));
    const valueW = showValue ? 58 : 0;
    const barX = chartX + labelW + 8;
    const barW = Math.max(24, chartW - labelW - valueW - 16);
    const fillW = Math.max(2, (item.value / max) * barW);
    const valueText = showPercent
      ? `${formatPercent((item.value / total) * 100)}`
      : formatNumber(item.value);
    doc
      .font('Helvetica')
      .fontSize(FONT.small)
      .fillColor(COLORS.darkText)
      .text(item.label, chartX, rowY + 1, { width: labelW, ellipsis: true });
    doc.roundedRect(barX, rowY + 4, barW, 9, 4).fill('#EEF2F7');
    doc
      .roundedRect(barX, rowY + 4, fillW, 9, 4)
      .fill(item.color ?? COLORS.accentBlue);
    if (showValue) {
      doc
        .font('Helvetica-Bold')
        .fontSize(FONT.small)
        .fillColor(COLORS.darkText)
        .text(valueText, barX + barW + 8, rowY, {
          width: valueW,
          align: 'right',
          ellipsis: true,
        });
    }
  });
  return computedHeight;
}

function drawTableHeader<T>(
  doc: PDFKit.PDFDocument,
  columns: TableColumn<T>[],
  x: number,
  y: number,
  w: number,
  compact = false,
) {
  const headerH = compact ? 22 : 24;
  doc.rect(x, y, w, headerH).fillAndStroke(COLORS.headerBg, COLORS.border);
  let cursorX = x;
  columns.forEach((column) => {
    doc
      .font('Helvetica-Bold')
      .fontSize(compact ? 6.4 : 6.8)
      .fillColor(COLORS.navy)
      .text(column.header, cursorX + 4, y + (compact ? 7 : 8), {
        width: column.width - 8,
        align: column.align ?? 'left',
        ellipsis: true,
      });
    cursorX += column.width;
  });
}

function compactHeader(header: string): string {
  const labels: Record<string, string> = {
    Completed: 'Done',
    'In Progress': 'In Prog.',
    Available: 'Avail.',
  };
  return labels[header] ?? header;
}

function normalizeTableColumns<T>(
  columns: TableColumn<T>[],
  availableWidth: number,
  compact = false,
): TableColumn<T>[] {
  const normalized = columns.map((column) => ({
    ...column,
    header: compact ? compactHeader(column.header) : column.header,
  }));
  const totalConfiguredWidth = normalized.reduce(
    (sum, column) => sum + column.width,
    0,
  );
  if (totalConfiguredWidth <= availableWidth) return normalized;

  const scaleFactor = availableWidth / totalConfiguredWidth;
  let usedWidth = 0;
  const scaled = normalized.map((column, index) => {
    const isLast = index === normalized.length - 1;
    const minWidth =
      column.align === 'right' || column.align === 'center'
        ? compact
          ? 34
          : 40
        : compact
          ? 46
          : 54;
    const width = isLast
      ? Math.max(minWidth, Math.floor(availableWidth - usedWidth))
      : Math.max(minWidth, Math.floor(column.width * scaleFactor));
    usedWidth += width;
    return { ...column, width };
  });

  const scaledTotal = scaled.reduce((sum, column) => sum + column.width, 0);
  if (scaledTotal <= availableWidth) return scaled;
  const overflowScale = availableWidth / scaledTotal;
  return scaled.map((column) => ({
    ...column,
    width: Math.max(28, Math.floor(column.width * overflowScale)),
  }));
}

function drawTable<T>(
  ctx: PdfContext,
  columns: TableColumn<T>[],
  rows: T[],
  x: number,
  y: number,
  options: TableOptions<T>,
) {
  const { doc } = ctx;
  const pageRightBoundary = PAGE.width - PAGE.margin;
  const requestedWidth = options.width ?? pageRightBoundary - x;
  const containerRightBoundary =
    options.containerRightBoundary ?? x + requestedWidth;
  const availableWidth = Math.max(
    80,
    Math.min(requestedWidth, pageRightBoundary - x, containerRightBoundary - x),
  );
  const compact =
    options.compact ||
    columns.reduce((sum, column) => sum + column.width, 0) > availableWidth;
  const tableColumns = normalizeTableColumns(columns, availableWidth, compact);
  const tableW = Math.min(
    availableWidth,
    tableColumns.reduce((sum, column) => sum + column.width, 0),
  );
  if (x + tableW > pageRightBoundary || x + tableW > containerRightBoundary) {
    console.warn('PDF_TABLE_OVERFLOW_PREVENTED', {
      tableX: x,
      tableWidth: tableW,
      pageRightBoundary,
      containerRightBoundary,
    });
  }
  if (!rows.length) {
    drawEmptyState(
      doc,
      options.emptyTitle,
      options.emptyDescription,
      x,
      y,
      tableW,
    );
    return y + 86;
  }

  let cursorY = y;
  const headerH = compact ? 22 : 24;
  const fontSize = compact ? 6.2 : 6.8;
  drawTableHeader(doc, tableColumns, x, cursorY, tableW, compact);
  cursorY += headerH;

  rows.forEach((row, rowIndex) => {
    const values = tableColumns.map((column) =>
      safeText(column.get(row, rowIndex)),
    );
    const rowH = Math.max(
      compact ? 24 : 28,
      ...values.map(
        (value, index) =>
          Math.min(
            compact ? 22 : 48,
            measureText(doc, value, tableColumns[index].width - 8, fontSize),
          ) + 12,
      ),
    );
    if (cursorY + rowH > PAGE.contentBottom) {
      addPage(ctx);
      cursorY = PAGE.contentTop;
      if (options.repeatHeader ?? true) {
        drawTableHeader(doc, tableColumns, x, cursorY, tableW, compact);
        cursorY += headerH;
      }
    }
    doc
      .rect(x, cursorY, tableW, rowH)
      .fillAndStroke(
        rowIndex % 2 === 0 ? COLORS.cardBg : COLORS.softBg,
        COLORS.border,
      );
    let cursorX = x;
    tableColumns.forEach((column, colIndex) => {
      const link = column.link?.(row);
      doc
        .font('Helvetica')
        .fontSize(fontSize)
        .fillColor(
          link ? COLORS.accentBlue : (column.color?.(row) ?? COLORS.darkText),
        )
        .text(values[colIndex], cursorX + 4, cursorY + 8, {
          width: column.width - 8,
          height: rowH - 12,
          align: column.align ?? 'left',
          link: link || undefined,
          underline: Boolean(link),
          ellipsis: true,
        });
      cursorX += column.width;
    });
    cursorY += rowH;
  });

  if (options.totalRow) {
    if (cursorY + 26 > PAGE.contentBottom) {
      addPage(ctx);
      cursorY = PAGE.contentTop;
    }
    doc
      .rect(x, cursorY, tableW, 26)
      .fillAndStroke(COLORS.headerBg, COLORS.border);
    let cursorX = x;
    tableColumns.forEach((column, index) => {
      doc
        .font('Helvetica-Bold')
        .fontSize(compact ? 6.4 : 7)
        .fillColor(COLORS.navy)
        .text(options.totalRow?.[index] ?? '', cursorX + 4, cursorY + 8, {
          width: column.width - 8,
          align: column.align ?? 'left',
          ellipsis: true,
        });
      cursorX += column.width;
    });
    cursorY += 26;
  }

  return cursorY + 12;
}

function drawCoverPage(ctx: PdfContext) {
  const { doc, snapshot } = ctx;
  doc.addPage();
  doc.rect(0, 0, PAGE.width, PAGE.height).fill(COLORS.cardBg);

  const sidebarW = 132;
  doc.rect(0, 0, sidebarW, PAGE.height).fill(COLORS.navy);
  const logoPath = rossLogoPath();
  if (logoPath) {
    doc.image(logoPath, sidebarW / 2 - 34, 78, { width: 68 });
  } else {
    doc
      .circle(sidebarW / 2, 108, 25)
      .fillAndStroke('#123A6F', COLORS.cyan)
      .font('Helvetica-Bold')
      .fontSize(18)
      .fillColor(COLORS.cardBg)
      .text('R', sidebarW / 2 - 8, 97, { width: 16, align: 'center' });
  }
  doc
    .font('Helvetica-Bold')
    .fontSize(24)
    .fillColor(COLORS.cardBg)
    .text('ROSS', 28, 152, { width: 76, align: 'center' })
    .font('Helvetica')
    .fontSize(8)
    .fillColor('#B8D7FF')
    .text('BuzzTrack Command', 20, 182, { width: 92, align: 'center' });
  for (let i = 0; i < 12; i += 1) {
    const waveY = 330 + i * 7;
    doc
      .moveTo(0, waveY)
      .bezierCurveTo(35, waveY - 28, 80, waveY + 28, sidebarW, waveY - 12)
      .strokeColor(i % 2 === 0 ? '#145EA8' : '#0F467D')
      .lineWidth(0.35)
      .stroke();
  }
  doc
    .font('Helvetica-Bold')
    .fontSize(6.5)
    .fillColor('#D6E8FF')
    .text('CONFIDENTIAL REPORT', 18, PAGE.height - 40, {
      width: 96,
      align: 'center',
    });

  const x = sidebarW + 28;
  doc
    .font('Helvetica-Bold')
    .fontSize(FONT.coverTitle)
    .fillColor(COLORS.navy)
    .text('ROSS', x, 58, { width: 260 })
    .text('Campaign Report', x, 88, { width: 300 })
    .font('Helvetica-Bold')
    .fontSize(11)
    .fillColor(COLORS.accentBlue)
    .text(scopeTitle(snapshot.meta.scope), x, 122, { width: 260 });
  doc
    .moveTo(x, 152)
    .lineTo(PAGE.width - PAGE.margin, 152)
    .strokeColor(COLORS.border)
    .lineWidth(0.8)
    .stroke();

  doc.y = 174;
  const status = formatStatus(snapshot.campaign.status);
  drawKeyValueGrid(
    doc,
    [
      ['Campaign', snapshot.campaign.name],
      [
        'Period',
        formatDateRange(snapshot.campaign.startDate, snapshot.campaign.endDate),
      ],
      ['Scope', scopeTitle(snapshot.meta.scope)],
      ['Format', snapshot.meta.format],
      ['Generated At', `${formatDateTime(snapshot.meta.generatedAt)} WIB`],
      [
        'Requested By',
        `${snapshot.meta.requestedBy.name} <${snapshot.meta.requestedBy.email}>`,
      ],
    ],
    x,
    174,
    PAGE.width - PAGE.margin - x,
    2,
  );
  drawBadge(
    doc,
    status,
    x + 212,
    174,
    status === 'ACTIVE' ? COLORS.green : COLORS.amber,
  );

  doc
    .font('Helvetica-Bold')
    .fontSize(FONT.sectionTitle)
    .fillColor(COLORS.darkText)
    .text('Executive Summary', x, 324, { width: 240 });
  drawKpiGrid(
    doc,
    executiveKpis(snapshot),
    x,
    348,
    PAGE.width - PAGE.margin - x,
    4,
    62,
  );
}

function executiveKpis(snapshot: ExportSnapshot): Kpi[] {
  return [
    {
      label: 'Total Views',
      value: formatNumber(snapshot.summary.totalViews),
      tone: 'blue',
    },
    {
      label: 'Total Engagement',
      value: formatNumber(snapshot.summary.totalEngagement),
      tone: 'green',
    },
    {
      label: 'Completion Rate',
      value: formatPercent(completionRate(snapshot)),
      sub: `${formatNumber(snapshot.summary.completedAttempts + snapshot.summary.totalCompletedCommentTasks)} completed`,
      tone: 'cyan',
    },
    {
      label: 'Active Buzzers / Members',
      value: formatNumber(snapshot.campaign.memberCount ?? 0),
      tone: 'violet',
    },
  ];
}

function overviewKpis(snapshot: ExportSnapshot): Kpi[] {
  return [
    {
      label: 'Total Views',
      value: formatNumber(snapshot.summary.totalViews),
      tone: 'blue',
    },
    {
      label: 'Likes',
      value: formatNumber(snapshot.summary.totalLikes),
      tone: 'pink',
    },
    {
      label: 'Comments',
      value: formatNumber(snapshot.summary.totalComments),
      tone: 'cyan',
    },
    {
      label: 'Shares',
      value: formatNumber(snapshot.summary.totalShares),
      tone: 'blue',
    },
    {
      label: 'Reposts',
      value: formatNumber(snapshot.summary.totalReposts),
      tone: 'violet',
    },
    {
      label: 'Total Engagement',
      value: formatNumber(snapshot.summary.totalEngagement),
      tone: 'green',
    },
    {
      label: 'Completion Rate',
      value: formatPercent(completionRate(snapshot)),
      sub: `${formatNumber(snapshot.summary.completedAttempts + snapshot.summary.totalCompletedCommentTasks)} / ${formatNumber(snapshot.summary.totalAttempts + snapshot.summary.totalCommentTasks)}`,
      tone: 'cyan',
    },
    {
      label: 'Total Members',
      value: formatNumber(snapshot.campaign.memberCount ?? 0),
      tone: 'violet',
    },
  ];
}

function drawCampaignOverviewPage(ctx: PdfContext, sectionNo = 1) {
  addPage(ctx);
  const { doc, snapshot } = ctx;
  drawSectionTitle(ctx, `${sectionNo}. Campaign Overview & KPI`);
  doc
    .font('Helvetica-Bold')
    .fontSize(FONT.small)
    .fillColor(COLORS.accentBlue)
    .text('Performance Summary', PAGE.margin, 92, { width: 180 });
  drawKpiGrid(
    doc,
    overviewKpis(snapshot),
    PAGE.margin,
    112,
    PAGE.contentWidth,
    4,
    58,
  );

  const cardY = 248;
  const cardW = (PAGE.contentWidth - 12) / 2;
  drawCard(doc, PAGE.margin, cardY, cardW, 236);
  doc
    .font('Helvetica-Bold')
    .fontSize(9)
    .fillColor(COLORS.accentBlue)
    .text('Campaign Information', PAGE.margin + 14, cardY + 14, {
      width: cardW - 28,
    });
  drawKeyValueGrid(
    doc,
    [
      [
        'Description',
        safeText(snapshot.campaign.description, 'No campaign description.'),
      ],
      [
        'Platforms',
        snapshot.campaign.platforms?.length
          ? snapshot.campaign.platforms.join(', ')
          : '-',
      ],
      ['Status', formatStatus(snapshot.campaign.status)],
      [
        'Period',
        formatDateRange(snapshot.campaign.startDate, snapshot.campaign.endDate),
      ],
      ['Blast Targets', formatNumber(snapshot.summary.totalBlastTargets)],
      ['Comment Commands', formatNumber(snapshot.summary.commentCommandsCount)],
    ],
    PAGE.margin + 14,
    cardY + 42,
    cardW - 28,
    2,
  );

  const chartX = PAGE.margin + cardW + 12;
  drawCard(doc, chartX, cardY, cardW, 236);
  doc
    .font('Helvetica-Bold')
    .fontSize(9)
    .fillColor(COLORS.accentBlue)
    .text('Platform Breakdown (Engagement)', chartX + 14, cardY + 14, {
      width: cardW - 28,
    });
  drawPlatformChart(
    doc,
    normalizedPlatformBreakdown(snapshot),
    chartX + 36,
    cardY + 70,
    cardW - 72,
  );
}

function platformChartItems(rows: SnapshotPlatformBreakdownRow[]): ChartItem[] {
  const colors = [COLORS.pink, COLORS.cyan, COLORS.accentBlue, COLORS.violet];
  return rows.slice(0, 4).map((row, index) => ({
    label: row.platform,
    value: row.totalEngagement,
    color: colors[index % colors.length],
    sub: formatNumber(row.totalEngagement),
  }));
}

function normalizedPlatformBreakdown(
  snapshot: ExportSnapshot,
): SnapshotPlatformBreakdownRow[] {
  if (snapshot.platformBreakdown.length) return snapshot.platformBreakdown;
  const map = new Map<string, SnapshotPlatformBreakdownRow>();
  snapshot.blastReports.forEach((report) => {
    const current = map.get(report.platform) ?? {
      platform: report.platform,
      blastReports: 0,
      views: 0,
      likes: 0,
      comments: 0,
      shares: 0,
      reposts: 0,
      totalEngagement: 0,
    };
    current.blastReports += 1;
    current.views += report.views;
    current.likes += report.likes;
    current.comments += report.comments;
    current.shares += report.shares;
    current.reposts += report.reposts;
    current.totalEngagement += report.totalEngagement;
    map.set(report.platform, current);
  });
  return Array.from(map.values()).sort(
    (a, b) => b.totalEngagement - a.totalEngagement,
  );
}

function topPlatformItems(snapshot: ExportSnapshot): ChartItem[] {
  const rows = normalizedPlatformBreakdown(snapshot);
  const rowMap = new Map(rows.map((row) => [row.platform, row]));
  const platforms = Array.from(
    new Set([
      ...rows.map((row) => row.platform),
      ...(snapshot.campaign.platforms ?? []),
    ]),
  );
  const source = platforms.length
    ? platforms.map((platform) => ({
        platform,
        totalEngagement: rowMap.get(platform)?.totalEngagement ?? 0,
      }))
    : rows;
  const colors = [COLORS.pink, COLORS.cyan, COLORS.accentBlue, COLORS.violet];
  return source.slice(0, 4).map((row, index) => ({
    label: row.platform,
    value: row.totalEngagement,
    color: colors[index % colors.length],
  }));
}

function drawPlatformChart(
  doc: PDFKit.PDFDocument,
  rows: SnapshotPlatformBreakdownRow[],
  x: number,
  y: number,
  w: number,
) {
  const items = platformChartItems(rows);
  if (!items.length) {
    drawEmptyState(
      doc,
      'No platform data',
      'Belum ada platform breakdown pada campaign dan rentang tanggal yang dipilih.',
      x - 12,
      y,
      w,
      96,
    );
    return;
  }
  drawDonutChart(doc, {
    segments: items,
    x: x + 80,
    y: y + 72,
    radius: 54,
    thickness: 18,
    legendX: x + 178,
    legendY: y + 28,
    legendWidth: w - 178,
    showPercent: true,
  });
}

function blastStatusItems(snapshot: ExportSnapshot): ChartItem[] {
  return [
    {
      label: 'Completed',
      value: snapshot.summary.completedAttempts,
      color: COLORS.accentBlue,
    },
    {
      label: 'Kept / Claimed',
      value: snapshot.summary.keptAttempts,
      color: COLORS.violet,
    },
    {
      label: 'Available',
      value: snapshot.summary.availableAttempts,
      color: COLORS.cyan,
    },
    {
      label: 'Expired',
      value: snapshot.summary.expiredAttempts,
      color: COLORS.red,
    },
  ];
}

function drawBlastSummaryPage(ctx: PdfContext, sectionNo = 2) {
  addPage(ctx);
  const { doc, snapshot } = ctx;
  drawSectionTitle(ctx, `${sectionNo}. Blast Reports Summary`);
  drawKpiGrid(
    doc,
    [
      {
        label: 'Total Targets',
        value: formatNumber(snapshot.summary.totalBlastTargets),
        tone: 'blue',
      },
      {
        label: 'Total Attempts',
        value: formatNumber(snapshot.summary.totalAttempts),
        tone: 'violet',
      },
      {
        label: 'Completed',
        value: formatNumber(snapshot.summary.completedAttempts),
        tone: 'green',
      },
      {
        label: 'Available',
        value: formatNumber(snapshot.summary.availableAttempts),
        tone: 'cyan',
      },
      {
        label: 'Kept / Claimed',
        value: formatNumber(snapshot.summary.keptAttempts),
        tone: 'amber',
      },
      {
        label: 'Expired',
        value: formatNumber(snapshot.summary.expiredAttempts),
        tone: 'red',
      },
    ],
    PAGE.margin,
    94,
    PAGE.contentWidth,
    6,
    58,
  );

  const y = 174;
  const leftW = 480;
  const rightW = PAGE.contentWidth - leftW - 12;
  addPageIfNeeded(ctx, 164);
  drawHorizontalBarChart(doc, blastStatusItems(snapshot), {
    x: PAGE.margin,
    y,
    width: leftW,
    height: 164,
    title: 'Blast Target Status',
    showValue: true,
  });

  const chartX = PAGE.margin + leftW + 12;
  drawHorizontalBarChart(doc, topPlatformItems(snapshot), {
    x: chartX,
    y,
    width: rightW,
    height: 164,
    title: 'Top Platform by Engagement',
    showValue: true,
  });

  doc
    .font('Helvetica-Bold')
    .fontSize(9)
    .fillColor(COLORS.accentBlue)
    .text('Recent Blast Attempts', PAGE.margin, 360, { width: 180 });
  drawTable(
    ctx,
    [
      {
        header: 'No',
        width: 32,
        get: (_r, i) => String(i + 1),
        align: 'center',
      },
      { header: 'Platform', width: 86, get: (r) => r.platform },
      {
        header: 'Source Account',
        width: 130,
        get: (r) => safeText(r.sourceAccount),
      },
      {
        header: 'Target Post',
        width: 150,
        get: (r) => wrapUrl(r.postUrl, 34),
        link: (r) => r.postUrl,
      },
      {
        header: 'Attempt',
        width: 70,
        get: (r) => `#${r.attemptNo}`,
        align: 'center',
      },
      { header: 'Submitted By', width: 112, get: (r) => r.submittedByName },
      {
        header: 'Submitted At',
        width: 112,
        get: (r) => formatDateTime(r.submittedAt),
      },
      {
        header: 'Engagement',
        width: 89.89,
        get: (r) => formatNumber(r.totalEngagement),
        align: 'right',
      },
    ],
    snapshot.blastReports.slice(0, 4),
    PAGE.margin,
    380,
    {
      emptyTitle: 'No recent blast attempts',
      emptyDescription:
        'Belum ada Blast Report pada campaign dan rentang tanggal yang dipilih.',
      repeatHeader: false,
      width: PAGE.contentWidth,
    },
  );
}

function drawBlastDetailPage(ctx: PdfContext, sectionNo = 3) {
  addPage(ctx);
  const { doc, snapshot } = ctx;
  drawSectionTitle(ctx, `${sectionNo}. Blast Reports Detail`);
  const total = snapshot.blastReports.reduce(
    (sum, row) => ({
      views: sum.views + row.views,
      likes: sum.likes + row.likes,
      comments: sum.comments + row.comments,
      shares: sum.shares + row.shares,
      reposts: sum.reposts + row.reposts,
      engagement: sum.engagement + row.totalEngagement,
    }),
    { views: 0, likes: 0, comments: 0, shares: 0, reposts: 0, engagement: 0 },
  );
  drawTable(
    ctx,
    [
      {
        header: 'No',
        width: 36,
        get: (_r, i) => String(i + 1),
        align: 'center',
      },
      { header: 'Platform', width: 54, get: (r) => r.platform },
      {
        header: 'Source Account',
        width: 74,
        get: (r) => safeText(r.sourceAccount),
      },
      {
        header: 'Target Post URL',
        width: 100,
        get: (r) => wrapUrl(r.postUrl),
        link: (r) => r.postUrl,
      },
      {
        header: 'Attempt',
        width: 48,
        get: (r) => `#${r.attemptNo}`,
        align: 'center',
      },
      { header: 'Submitted By', width: 68, get: (r) => r.submittedByName },
      {
        header: 'Submitted At',
        width: 74,
        get: (r) => formatDateTime(r.submittedAt),
      },
      {
        header: 'Views',
        width: 42,
        get: (r) => formatNumber(r.views),
        align: 'right',
      },
      {
        header: 'Likes',
        width: 40,
        get: (r) => formatNumber(r.likes),
        align: 'right',
      },
      {
        header: 'Comments',
        width: 52,
        get: (r) => formatNumber(r.comments),
        align: 'right',
      },
      {
        header: 'Shares',
        width: 44,
        get: (r) => formatNumber(r.shares),
        align: 'right',
      },
      {
        header: 'Reposts',
        width: 48,
        get: (r) => formatNumber(r.reposts),
        align: 'right',
      },
      {
        header: 'Eng.',
        width: 48,
        get: (r) => formatNumber(r.totalEngagement),
        align: 'right',
      },
      {
        header: 'Proof',
        width: 55.89,
        get: () => 'Proof',
        link: (r) => r.proofLink,
      },
    ],
    snapshot.blastReports,
    PAGE.margin,
    92,
    {
      emptyTitle: 'No blast reports',
      emptyDescription:
        'Belum ada Blast Report pada campaign dan rentang tanggal yang dipilih.',
      totalRow: [
        'TOTAL',
        '',
        '',
        '',
        '',
        '',
        '',
        formatNumber(total.views),
        formatNumber(total.likes),
        formatNumber(total.comments),
        formatNumber(total.shares),
        formatNumber(total.reposts),
        formatNumber(total.engagement),
        '',
      ],
      width: PAGE.contentWidth,
      compact: true,
    },
  );
}

function drawCommentSummaryPage(ctx: PdfContext, sectionNo = 4) {
  addPage(ctx);
  const { doc, snapshot } = ctx;
  drawSectionTitle(ctx, `${sectionNo}. Comment Tasks Summary`);
  drawKpiGrid(
    doc,
    [
      {
        label: 'Total Commands',
        value: formatNumber(snapshot.summary.commentCommandsCount),
        tone: 'blue',
      },
      {
        label: 'Total Slots',
        value: formatNumber(snapshot.summary.totalCommentTasks),
        tone: 'violet',
      },
      {
        label: 'Completed',
        value: formatNumber(snapshot.summary.totalCompletedCommentTasks),
        tone: 'green',
      },
      {
        label: 'In Progress',
        value: formatNumber(snapshot.summary.inProgressCommentTasks),
        tone: 'amber',
      },
      {
        label: 'Available',
        value: formatNumber(snapshot.summary.availableCommentTasks),
        tone: 'cyan',
      },
      {
        label: 'Expired',
        value: formatNumber(snapshot.summary.expiredCommentTasks),
        tone: 'red',
      },
    ],
    PAGE.margin,
    94,
    PAGE.contentWidth,
    6,
    58,
  );

  const y = 190;
  const leftW = 300;
  const rightW = PAGE.contentWidth - leftW - 12;
  drawCard(doc, PAGE.margin, y, leftW, 240);
  doc
    .font('Helvetica-Bold')
    .fontSize(9)
    .fillColor(COLORS.accentBlue)
    .text('Slots Overview', PAGE.margin + 14, y + 14, { width: leftW - 28 });
  const slotItems = [
    {
      label: 'Completed',
      value: snapshot.summary.totalCompletedCommentTasks,
      color: COLORS.green,
    },
    {
      label: 'In Progress',
      value:
        snapshot.summary.inProgressCommentTasks +
        snapshot.summary.keptCommentTasks,
      color: COLORS.amber,
    },
    {
      label: 'Available',
      value: snapshot.summary.availableCommentTasks,
      color: COLORS.cyan,
    },
    {
      label: 'Expired',
      value: snapshot.summary.expiredCommentTasks,
      color: COLORS.red,
    },
  ];
  drawDonutChart(doc, {
    segments: slotItems,
    x: PAGE.margin + 92,
    y: y + 125,
    radius: 58,
    thickness: 18,
    legendX: PAGE.margin + 170,
    legendY: y + 72,
    legendWidth: 110,
    showPercent: true,
  });

  const cardX = PAGE.margin + leftW + 12;
  drawCard(doc, cardX, y, rightW, 240);
  doc
    .font('Helvetica-Bold')
    .fontSize(9)
    .fillColor(COLORS.accentBlue)
    .text('Command Breakdown', cardX + 14, y + 14, { width: rightW - 28 });
  drawTable(
    ctx,
    [
      { header: 'Stance', width: 70, get: (r) => r.label },
      { header: 'Platform', width: 90, get: (r) => r.platform },
      {
        header: 'Slots',
        width: 55,
        get: (r) => formatNumber(r.slots),
        align: 'center',
      },
      {
        header: 'Completed',
        width: 70,
        get: (r) => formatNumber(r.completed),
        align: 'center',
      },
      {
        header: 'In Progress',
        width: 75,
        get: (r) => formatNumber(r.progress),
        align: 'center',
      },
      {
        header: 'Available',
        width: 70,
        get: (r) => formatNumber(r.available),
        align: 'center',
      },
      {
        header: 'Expired',
        width: 60,
        get: (r) => formatNumber(r.expired),
        align: 'center',
      },
    ],
    commentBreakdownRows(snapshot),
    cardX + 14,
    y + 44,
    {
      emptyTitle: 'No comment commands',
      emptyDescription:
        'Belum ada Comment Task yang sesuai dengan scope dan filter export.',
      repeatHeader: false,
      width: rightW - 28,
      compact: true,
      containerRightBoundary: cardX + rightW - 14,
    },
  );
}

function commentBreakdownRows(snapshot: ExportSnapshot) {
  const map = new Map<
    string,
    {
      label: string;
      platform: string;
      slots: number;
      completed: number;
      progress: number;
      available: number;
      expired: number;
    }
  >();
  snapshot.commentTasks.forEach((task) => {
    const key = `${task.stance}-${task.platform}`;
    const row = map.get(key) ?? {
      label: task.stance,
      platform: task.platform,
      slots: 0,
      completed: 0,
      progress: 0,
      available: 0,
      expired: 0,
    };
    row.slots += 1;
    if (task.status === 'COMPLETED') row.completed += 1;
    else if (task.status === 'IN_PROGRESS' || task.status === 'KEPT')
      row.progress += 1;
    else if (task.status === 'AVAILABLE') row.available += 1;
    else if (task.status === 'EXPIRED') row.expired += 1;
    map.set(key, row);
  });
  if (map.size === 0 && snapshot.summary.totalCommentTasks > 0) {
    return [
      {
        label: 'ALL',
        platform: snapshot.campaign.platforms?.join(', ') || '-',
        slots: snapshot.summary.totalCommentTasks,
        completed: snapshot.summary.totalCompletedCommentTasks,
        progress:
          snapshot.summary.inProgressCommentTasks +
          snapshot.summary.keptCommentTasks,
        available: snapshot.summary.availableCommentTasks,
        expired: snapshot.summary.expiredCommentTasks,
      },
    ];
  }
  return Array.from(map.values());
}

function drawCommentTasksPage(ctx: PdfContext, sectionNo = 5) {
  addPage(ctx);
  const { snapshot } = ctx;
  drawSectionTitle(ctx, `${sectionNo}. Completed Comment Tasks`);
  const endY = drawTable(
    ctx,
    [
      {
        header: 'No',
        width: 28,
        get: (_r, i) => String(i + 1),
        align: 'center',
      },
      { header: 'Stance', width: 56, get: (r) => r.stance },
      { header: 'Platform', width: 62, get: (r) => r.platform },
      {
        header: 'Target URL',
        width: 138,
        get: (r) => wrapUrl(r.targetPostUrl),
        link: (r) => r.targetPostUrl,
      },
      { header: 'Slot / Task No', width: 72, get: (r) => `Task #${r.taskNo}` },
      { header: 'Buzzer', width: 94, get: (r) => safeText(r.keptByName) },
      {
        header: 'Completed At',
        width: 92,
        get: (r) => formatDateTime(r.completedAt),
      },
      {
        header: 'Proof Link',
        width: 68,
        get: () => 'Proof',
        link: (r) => r.proofLink,
      },
      { header: 'Notes', width: 171.89, get: (r) => safeText(r.notes, '-') },
    ],
    snapshot.commentTasks,
    PAGE.margin,
    92,
    {
      emptyTitle: 'No comment tasks',
      emptyDescription:
        'Belum ada Comment Task yang sesuai dengan scope dan filter export.',
      width: PAGE.contentWidth,
      compact: true,
    },
  );
  ctx.doc
    .font('Helvetica-Bold')
    .fontSize(FONT.body)
    .fillColor(COLORS.navy)
    .text(
      `Total Completed Tasks: ${formatNumber(snapshot.commentTasks.length)}`,
      PAGE.margin,
      Math.min(endY + 4, PAGE.contentBottom - 12),
      {
        width: 240,
      },
    );
}

function drawTopBuzzersPage(ctx: PdfContext, sectionNo = 6) {
  addPage(ctx);
  drawSectionTitle(ctx, `${sectionNo}. Top Buzzers Performance`);
  drawTable(
    ctx,
    [
      {
        header: 'No',
        width: 36,
        get: (_r, i) => String(i + 1),
        align: 'center',
      },
      { header: 'Buzzer', width: 145, get: (r) => r.name },
      { header: 'Role', width: 92, get: () => 'BUZZER', align: 'center' },
      {
        header: 'Blast Reports Completed',
        width: 140,
        get: (r) => formatNumber(r.blastReports),
        align: 'right',
      },
      {
        header: 'Comment Tasks Completed',
        width: 145,
        get: (r) => formatNumber(r.commentTasks),
        align: 'right',
      },
      {
        header: 'Total Engagement',
        width: 120,
        get: (r) => formatNumber(r.totalEngagement),
        align: 'right',
      },
      {
        header: 'Engagement Score',
        width: 103.89,
        get: (r) => formatPercent(Math.min(100, r.totalEngagement / 1000)),
        align: 'right',
        color: () => COLORS.accentBlue,
      },
    ],
    ctx.snapshot.topBuzzers.slice(0, 12),
    PAGE.margin,
    92,
    {
      emptyTitle: 'No buzzer performance',
      emptyDescription:
        'Belum ada aktivitas buzzer pada campaign dan rentang tanggal yang dipilih.',
      width: PAGE.contentWidth,
    },
  );
}

function drawAppendixPage(ctx: PdfContext, sectionNo = 7) {
  addPage(ctx);
  const { doc, snapshot } = ctx;
  drawSectionTitle(ctx, `${sectionNo}. Appendix & Export Metadata`);
  const cardW = (PAGE.contentWidth - 12) / 2;
  drawCard(doc, PAGE.margin, 104, cardW, 250);
  doc
    .font('Helvetica-Bold')
    .fontSize(9)
    .fillColor(COLORS.accentBlue)
    .text('Export Information', PAGE.margin + 14, 120, { width: cardW - 28 });
  drawKeyValueGrid(
    doc,
    [
      ['Export ID', snapshot.meta.exportId ?? '-'],
      ['Format', snapshot.meta.format],
      ['Scope', scopeTitle(snapshot.meta.scope)],
      ['Status', 'COMPLETED'],
      ['Generated At', `${formatDateTime(snapshot.meta.generatedAt)} WIB`],
      [
        'Requested By',
        `${snapshot.meta.requestedBy.name} <${snapshot.meta.requestedBy.email}>`,
      ],
      [
        'File Size',
        snapshot.meta.fileSize
          ? `${formatNumber(snapshot.meta.fileSize)} bytes`
          : '-',
      ],
      ['File Name', snapshot.meta.fileName ?? '-'],
    ],
    PAGE.margin + 14,
    150,
    cardW - 28,
    2,
  );

  const legendX = PAGE.margin + cardW + 12;
  drawCard(doc, legendX, 104, cardW, 250);
  doc
    .font('Helvetica-Bold')
    .fontSize(9)
    .fillColor(COLORS.accentBlue)
    .text('Legend', legendX + 14, 120, { width: cardW - 28 });
  const legend = [
    ['COMPLETED', 'Report successfully generated', COLORS.green],
    ['PROCESSING', 'Report is being generated', COLORS.accentBlue],
    ['PENDING', 'Waiting to be processed', COLORS.amber],
    ['FAILED', 'Failed to generate', COLORS.red],
    ['EXPIRED', 'Needs reblast / retry', COLORS.amber],
  ] as const;
  legend.forEach(([label, desc, color], index) => {
    const rowY = 154 + index * 34;
    drawBadge(doc, label, legendX + 18, rowY, color);
    doc
      .font('Helvetica')
      .fontSize(FONT.body)
      .fillColor(COLORS.darkText)
      .text(desc, legendX + 130, rowY + 4, { width: cardW - 150 });
  });
  doc
    .font('Helvetica')
    .fontSize(FONT.body)
    .fillColor(COLORS.mutedText)
    .text(
      'Catatan: Laporan ini bersifat rahasia dan hanya untuk penggunaan internal.',
      PAGE.margin,
      392,
      { width: PAGE.contentWidth },
    );
}

function renderSummaryScope(ctx: PdfContext) {
  drawCampaignOverviewPage(ctx, 1);
  addPage(ctx);
  drawSectionTitle(ctx, '2. Platform Breakdown & Top Buzzers');
  const y = 104;
  const leftW = 360;
  drawCard(ctx.doc, PAGE.margin, y, leftW, 260);
  ctx.doc
    .font('Helvetica-Bold')
    .fontSize(9)
    .fillColor(COLORS.accentBlue)
    .text('Platform Breakdown', PAGE.margin + 14, y + 14, {
      width: leftW - 28,
    });
  drawPlatformChart(
    ctx.doc,
    normalizedPlatformBreakdown(ctx.snapshot),
    PAGE.margin + 30,
    y + 64,
    leftW - 60,
  );
  drawCard(ctx.doc, PAGE.margin, 382, leftW, 92, COLORS.softBg);
  ctx.doc
    .font('Helvetica-Bold')
    .fontSize(9)
    .fillColor(COLORS.accentBlue)
    .text('Export Metadata', PAGE.margin + 14, 396, { width: leftW - 28 });
  drawKeyValueGrid(
    ctx.doc,
    [
      ['Scope', scopeTitle(ctx.snapshot.meta.scope)],
      ['Generated At', `${formatDateTime(ctx.snapshot.meta.generatedAt)} WIB`],
      ['Requested By', ctx.snapshot.meta.requestedBy.email],
      ['File Name', ctx.snapshot.meta.fileName ?? '-'],
    ],
    PAGE.margin + 14,
    418,
    leftW - 28,
    2,
  );
  drawTable(
    ctx,
    [
      {
        header: 'No',
        width: 36,
        get: (_r, i) => String(i + 1),
        align: 'center',
      },
      { header: 'Buzzer', width: 140, get: (r) => r.name },
      {
        header: 'Blast Reports',
        width: 90,
        get: (r) => formatNumber(r.blastReports),
        align: 'right',
      },
      {
        header: 'Comment Tasks',
        width: 100,
        get: (r) => formatNumber(r.commentTasks),
        align: 'right',
      },
      {
        header: 'Engagement',
        width: 100,
        get: (r) => formatNumber(r.totalEngagement),
        align: 'right',
      },
      { header: 'Email', width: 255.89, get: (r) => r.email },
    ],
    ctx.snapshot.topBuzzers.slice(0, 8),
    PAGE.margin + leftW + 16,
    y,
    {
      emptyTitle: 'No buzzer summary',
      emptyDescription:
        'Belum ada aktivitas buzzer pada campaign dan rentang tanggal yang dipilih.',
      width: PAGE.contentWidth - leftW - 16,
      compact: true,
    },
  );
}

function renderBlastScope(ctx: PdfContext) {
  drawBlastSummaryPage(ctx, 1);
  drawBlastDetailPage(ctx, 2);
}

function renderCommentScope(ctx: PdfContext) {
  drawCommentSummaryPage(ctx, 1);
  drawCommentTasksPage(ctx, 2);
}

function renderFullScope(ctx: PdfContext) {
  drawCampaignOverviewPage(ctx, 1);
  drawBlastSummaryPage(ctx, 2);
  drawBlastDetailPage(ctx, 3);
  drawCommentSummaryPage(ctx, 4);
  drawCommentTasksPage(ctx, 5);
  drawTopBuzzersPage(ctx, 6);
  drawAppendixPage(ctx, 7);
}

export async function renderSnapshotAsPdf(
  snapshot: ExportSnapshot,
): Promise<Buffer> {
  return new Promise((resolvePromise, reject) => {
    const doc = new PDFDocument({
      autoFirstPage: false,
      size: 'A4',
      layout: 'landscape',
      margin: PAGE.margin,
      bufferPages: true,
      info: {
        Title: `${snapshot.campaign.name} - ${scopeTitle(snapshot.meta.scope)}`,
        Author: 'ROSS/BuzzTrack',
        Creator: 'ROSS/BuzzTrack Exports',
      },
    });
    const ctx: PdfContext = { doc, snapshot };
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolvePromise(Buffer.concat(chunks)));
    doc.on('error', reject);

    drawCoverPage(ctx);
    if (snapshot.meta.scope === ExportScope.SUMMARY) {
      renderSummaryScope(ctx);
    } else if (snapshot.meta.scope === ExportScope.BLAST_REPORTS) {
      renderBlastScope(ctx);
    } else if (snapshot.meta.scope === ExportScope.COMMENT_TASKS) {
      renderCommentScope(ctx);
    } else {
      renderFullScope(ctx);
    }

    drawFinalPageFrames(ctx);
    doc.end();
  });
}
