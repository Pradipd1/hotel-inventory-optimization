import PDFDocument from 'pdfkit';
import { format } from 'date-fns';

function formatCell(value, type, currency) {
  if (value === null || value === undefined || value === '') return '';
  if (type === 'date') return format(new Date(value), 'yyyy-MM-dd');
  if (type === 'datetime') return format(new Date(value), 'yyyy-MM-dd HH:mm');
  if (type === 'currency' && typeof value === 'number') return `${currency} ${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (type === 'number' && typeof value === 'number') return value.toLocaleString('en-US', { maximumFractionDigits: 3 });
  return String(value);
}

/**
 * CSV with RFC 4180 quoting. Text cells starting with = + - @ are prefixed with an apostrophe
 * so spreadsheet apps do not run them as formulas (CSV injection).
 */
export function toCsv(report) {
  const esc = (v) => {
    let s = v === null || v === undefined ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s) && Number.isNaN(Number(s))) s = `'${s}`;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const raw = (v, type) => {
    if (v === null || v === undefined) return '';
    if (type === 'date' && v) return format(new Date(v), 'yyyy-MM-dd');
    if (type === 'datetime' && v) return format(new Date(v), 'yyyy-MM-dd HH:mm');
    return v;
  };
  const lines = [report.columns.map((c) => esc(c.label)).join(',')];
  for (const row of report.rows) lines.push(report.columns.map((c) => esc(raw(row[c.key], c.type))).join(','));
  return `﻿${lines.join('\r\n')}\r\n`; // BOM so Excel opens UTF-8 correctly
}

/** Streams a landscape A4 PDF table of the report. */
export function streamPdf(report, res) {
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 36, bufferPages: true });
  doc.pipe(res);
  const navy = '#0f1f3d';
  const pageWidth = doc.page.width - 72;

  doc.fillColor(navy).fontSize(16).font('Helvetica-Bold').text(report.title);
  doc.moveDown(0.2).fontSize(9).font('Helvetica').fillColor('#555')
    .text(`${report.hotel ?? ''}  ·  Generated ${format(new Date(report.generatedAt), 'yyyy-MM-dd HH:mm')}`);
  const f = Object.entries(report.filters || {}).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join('   ');
  if (f) doc.text(`Filters: ${f}`);
  if (report.note) doc.text(report.note);

  if (report.summary?.length) {
    doc.moveDown(0.5).fillColor(navy).font('Helvetica-Bold').fontSize(10)
      .text(report.summary.map((s) => `${s.label}: ${formatCell(s.value, s.type, report.currency)}`).join('     '));
  }
  doc.moveDown(0.6);

  // Column widths: "wide" columns get 3 shares, others 1.
  const shares = report.columns.map((c) => (c.wide ? 3 : 1));
  const unit = pageWidth / shares.reduce((a, b) => a + b, 0);
  const widths = shares.map((s) => s * unit);

  const drawHeader = () => {
    const y = doc.y;
    doc.rect(36, y, pageWidth, 18).fill(navy);
    let x = 36;
    doc.fillColor('#fff').font('Helvetica-Bold').fontSize(8);
    report.columns.forEach((c, i) => {
      doc.text(c.label, x + 3, y + 5, { width: widths[i] - 6, ellipsis: true, lineBreak: false });
      x += widths[i];
    });
    doc.y = y + 20;
  };

  drawHeader();
  doc.font('Helvetica').fontSize(8);
  report.rows.forEach((row, idx) => {
    const cells = report.columns.map((c) => formatCell(row[c.key], c.type, report.currency));
    const height = Math.max(14, ...cells.map((t, i) => doc.heightOfString(t, { width: widths[i] - 6 }) + 6));
    if (doc.y + height > doc.page.height - 50) {
      doc.addPage();
      drawHeader();
      doc.font('Helvetica').fontSize(8);
    }
    const y = doc.y;
    if (idx % 2 === 0) doc.rect(36, y, pageWidth, height).fill('#f3f5f9');
    let x = 36;
    doc.fillColor('#1f2937');
    cells.forEach((t, i) => {
      doc.text(t, x + 3, y + 3, { width: widths[i] - 6 });
      x += widths[i];
    });
    doc.y = y + height;
  });
  if (!report.rows.length) doc.moveDown().fillColor('#555').text('No records match the selected filters.');

  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(i);
    doc.fontSize(7).fillColor('#888').text(`Page ${i + 1} of ${range.count}`, 36, doc.page.height - 30, { width: pageWidth, align: 'right', lineBreak: false });
  }
  doc.end();
}
