'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Copy, Check } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface MarkdownRendererProps {
    content: string;
    partial?: boolean;
    className?: string;
}

type Block =
    | { type: 'heading'; level: 1 | 2 | 3; text: string }
    | { type: 'table'; headers: string[]; rows: string[][] }
    | { type: 'ul'; items: string[] }
    | { type: 'ol'; items: string[]; start: number }
    | { type: 'codeblock'; lang: string; code: string }
    | { type: 'blockquote'; lines: string[] }
    | { type: 'hr' }
    | { type: 'paragraph'; text: string };

// ── Callout detection ─────────────────────────────────────────────────────────

function detectCalloutType(firstLine: string): 'warning' | 'success' | 'info' | 'error' | null {
    const t = firstLine.trim();
    if (t.startsWith('⚠️') || t.toLowerCase().includes('perhatian')) return 'warning';
    if (t.startsWith('✅') || t.startsWith('💡') || t.toLowerCase().includes('rekomendasi')) return 'success';
    if (t.startsWith('❌') || t.toLowerCase().includes('gagal')) return 'error';
    if (t.startsWith('ℹ️') || t.startsWith('📌') || t.startsWith('💬')) return 'info';
    return null;
}

const CALLOUT_STYLES: Record<string, string> = {
    warning: 'bg-amber-50 border-l-4 border-amber-400 text-amber-800',
    success: 'bg-emerald-50 border-l-4 border-emerald-400 text-emerald-800',
    error: 'bg-red-50 border-l-4 border-red-400 text-red-800',
    info: 'bg-blue-50 border-l-4 border-blue-300 text-blue-800',
};

// ── Trend / badge rendering ───────────────────────────────────────────────────

// Escape a plain-text string so it is safe to interpolate into an HTML
// attribute value or text node.  This prevents AI-generated content from
// injecting tags or event handlers via the regex capture groups below.
function escapeHtml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function renderTrend(text: string): React.ReactNode {
    // Escape the raw AI text first so captured values ($1) cannot inject HTML.
    const safe = escapeHtml(text);
    const html = safe
        .replace(
            /↑\s*([\d.,]+%?)/g,
            '<span class="inline-flex items-center gap-0.5 text-emerald-600 font-semibold">▲ $1</span>',
        )
        .replace(
            /↓\s*([\d.,]+%?)/g,
            '<span class="inline-flex items-center gap-0.5 text-red-600 font-semibold">▼ $1</span>',
        )
        .replace(/→/g, '<span class="text-gray-400">→</span>')
        .replace(
            /\+(\d[\d.,]*%)/g,
            '<span class="text-emerald-600 font-semibold">+$1</span>',
        )
        .replace(
            /(-\d[\d.,]*%)/g,
            '<span class="text-red-600 font-semibold">$1</span>',
        )
        .replace(
            /(Rp\s?[\d.,]+)/g,
            '<span class="font-mono text-gray-700 bg-gray-100 px-1 rounded text-[11px]">$1</span>',
        );
    return <span dangerouslySetInnerHTML={{ __html: html }} />;
}

// ── Inline parser ─────────────────────────────────────────────────────────────

function renderInline(text: string): React.ReactNode {
    const parts: React.ReactNode[] = [];
    let remaining = text;
    let key = 0;

    while (remaining.length > 0) {
        const boldIdx = remaining.indexOf('**');
        const codeIdx = remaining.indexOf('`');
        const linkIdx = remaining.indexOf('[');
        // italic only when not part of bold
        const rawItalicIdx = remaining.indexOf('*');
        const italicIdx =
            rawItalicIdx !== -1 && rawItalicIdx === boldIdx ? Infinity : rawItalicIdx === -1 ? Infinity : rawItalicIdx;

        type Candidate = { idx: number; type: string };
        const candidates: Candidate[] = [
            { idx: boldIdx === -1 ? Infinity : boldIdx, type: 'bold' },
            { idx: italicIdx, type: 'italic' },
            { idx: codeIdx === -1 ? Infinity : codeIdx, type: 'code' },
            { idx: linkIdx === -1 ? Infinity : linkIdx, type: 'link' },
        ]
            .filter((c) => c.idx !== Infinity)
            .sort((a, b) => a.idx - b.idx);

        if (candidates.length === 0) {
            parts.push(<span key={key++}>{renderTrend(remaining)}</span>);
            break;
        }

        const first = candidates[0];

        if (first.idx > 0) {
            parts.push(<span key={key++}>{renderTrend(remaining.slice(0, first.idx))}</span>);
            remaining = remaining.slice(first.idx);
            continue;
        }

        if (first.type === 'bold') {
            const end = remaining.indexOf('**', 2);
            if (end === -1) {
                parts.push(<span key={key++}>{renderTrend(remaining[0])}</span>);
                remaining = remaining.slice(1);
                continue;
            }
            parts.push(
                <strong key={key++} className="font-semibold text-gray-900">
                    {renderInline(remaining.slice(2, end))}
                </strong>,
            );
            remaining = remaining.slice(end + 2);
        } else if (first.type === 'italic') {
            const end = remaining.indexOf('*', 1);
            if (end === -1) {
                parts.push(<span key={key++}>{renderTrend(remaining[0])}</span>);
                remaining = remaining.slice(1);
                continue;
            }
            parts.push(
                <em key={key++} className="italic text-gray-700">
                    {renderInline(remaining.slice(1, end))}
                </em>,
            );
            remaining = remaining.slice(end + 1);
        } else if (first.type === 'code') {
            const end = remaining.indexOf('`', 1);
            if (end === -1) {
                parts.push(<span key={key++}>{renderTrend(remaining[0])}</span>);
                remaining = remaining.slice(1);
                continue;
            }
            parts.push(
                <code key={key++} className="bg-gray-100 text-gray-800 px-1.5 py-0.5 rounded text-[11px] font-mono">
                    {remaining.slice(1, end)}
                </code>,
            );
            remaining = remaining.slice(end + 1);
        } else if (first.type === 'link') {
            const labelEnd = remaining.indexOf(']');
            if (labelEnd === -1 || remaining[labelEnd + 1] !== '(') {
                parts.push(<span key={key++}>{renderTrend(remaining[0])}</span>);
                remaining = remaining.slice(1);
                continue;
            }
            const urlEnd = remaining.indexOf(')', labelEnd + 2);
            if (urlEnd === -1) {
                parts.push(<span key={key++}>{renderTrend(remaining[0])}</span>);
                remaining = remaining.slice(1);
                continue;
            }
            const label = remaining.slice(1, labelEnd);
            const url = remaining.slice(labelEnd + 2, urlEnd);
            parts.push(
                <a key={key++} href={url} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline hover:text-blue-800">
                    {label}
                </a>,
            );
            remaining = remaining.slice(urlEnd + 1);
        }
    }

    return parts.length === 1 ? parts[0] : <>{parts}</>;
}

// ── Block parser ──────────────────────────────────────────────────────────────

function parseBlocks(raw: string): Block[] {
    const lines = raw.split('\n');
    const blocks: Block[] = [];
    let i = 0;

    while (i < lines.length) {
        const line = lines[i];
        const trimmed = line.trim();

        if (trimmed === '') {
            i++;
            continue;
        }

        // Fenced code block
        if (trimmed.startsWith('```')) {
            const lang = trimmed.slice(3).trim();
            const codeLines: string[] = [];
            i++;
            while (i < lines.length && !lines[i].trim().startsWith('```')) {
                codeLines.push(lines[i]);
                i++;
            }
            i++; // skip closing ```
            blocks.push({ type: 'codeblock', lang, code: codeLines.join('\n') });
            continue;
        }

        // Heading
        const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)/);
        if (headingMatch) {
            blocks.push({
                type: 'heading',
                level: Math.min(headingMatch[1].length, 3) as 1 | 2 | 3,
                text: headingMatch[2],
            });
            i++;
            continue;
        }

        // HR
        if (/^[-*_]{3,}$/.test(trimmed)) {
            blocks.push({ type: 'hr' });
            i++;
            continue;
        }

        // Blockquote
        if (trimmed.startsWith('>')) {
            const bqLines: string[] = [];
            while (i < lines.length && lines[i].trim().startsWith('>')) {
                bqLines.push(lines[i].trim().replace(/^>\s?/, ''));
                i++;
            }
            blocks.push({ type: 'blockquote', lines: bqLines });
            continue;
        }

        // Table — current line has | and next non-empty line is a separator
        if (trimmed.includes('|') && i + 1 < lines.length) {
            const nextNonEmpty = lines.slice(i + 1).find((l) => l.trim() !== '');
            if (nextNonEmpty && /^\|?[-: |]+\|?$/.test(nextNonEmpty.trim())) {
                const parseRow = (l: string): string[] =>
                    l
                        .trim()
                        .replace(/^\|/, '')
                        .replace(/\|$/, '')
                        .split('|')
                        .map((c) => c.trim());

                const headers = parseRow(lines[i]);
                i++;
                // skip separator row(s)
                while (i < lines.length && /^\|?[-: |]+\|?$/.test(lines[i].trim())) {
                    i++;
                }
                const rows: string[][] = [];
                while (i < lines.length && lines[i].trim().includes('|')) {
                    rows.push(parseRow(lines[i]));
                    i++;
                }
                blocks.push({ type: 'table', headers, rows });
                continue;
            }
        }

        // Unordered list
        if (/^[-*+]\s+/.test(trimmed)) {
            const items: string[] = [];
            while (i < lines.length && /^[ \t]*[-*+]\s+/.test(lines[i])) {
                items.push(lines[i].trim().replace(/^[-*+]\s+/, ''));
                i++;
            }
            blocks.push({ type: 'ul', items });
            continue;
        }

        // Ordered list
        const olMatch = trimmed.match(/^(\d+)[.)]\s+(.+)/);
        if (olMatch) {
            const start = parseInt(olMatch[1], 10);
            const items: string[] = [olMatch[2]];
            i++;
            while (i < lines.length) {
                const m = lines[i].trim().match(/^\d+[.)]\s+(.+)/);
                if (!m) break;
                items.push(m[1]);
                i++;
            }
            blocks.push({ type: 'ol', items, start });
            continue;
        }

        // Paragraph — consume lines until a block-level token starts
        const paraLines: string[] = [];
        while (i < lines.length) {
            const l = lines[i];
            const t = l.trim();
            if (
                t === '' ||
                t.startsWith('#') ||
                t.startsWith('```') ||
                t.startsWith('>') ||
                /^[-*+]\s+/.test(t) ||
                /^\d+[.)]\s+/.test(t) ||
                /^[-*_]{3,}$/.test(t) ||
                (t.includes('|') &&
                    i + 1 < lines.length &&
                    /^\|?[-: |]+\|?$/.test((lines[i + 1] || '').trim()))
            ) {
                break;
            }
            paraLines.push(t);
            i++;
        }
        if (paraLines.length > 0) {
            blocks.push({ type: 'paragraph', text: paraLines.join('\n') });
        }
    }

    return blocks;
}

// ── Table export helpers ──────────────────────────────────────────────────────

function tableToTSV(headers: string[], rows: string[][]): string {
    const allRows = [headers, ...rows];
    return allRows.map((r) => r.join('\t')).join('\r\n');
}

function tableToCSV(headers: string[], rows: string[][]): string {
    const escape = (v: string): string => `"${v.replace(/"/g, '""')}"`;
    const allRows = [headers, ...rows];
    return allRows.map((r) => r.map(escape).join(',')).join('\r\n');
}

function downloadFile(content: string, filename: string, mimeType: string): void {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

async function exportToPDF(headers: string[], rows: string[][], subtitle?: string): Promise<void> {
    const { jsPDF } = await import('jspdf');

    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();

    const now = new Date();
    const dateStr = now.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
    const timeStr = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const footerText = `Auto-generated by KR·AI - Kakarama AI Assistant  |  ${dateStr} ${timeStr} WIB`;

    // Page header
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 30, 30);
    doc.text('Kakarama Room Analytics', 14, 16);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(80, 80, 80);
    doc.text(subtitle ?? 'KR·AI — Kakarama Room Analytics', 14, 23);
    doc.text(`${dateStr}  |  ${timeStr} WIB`, 14, 29);
    doc.text(`Total: ${rows.length} baris  |  Kolom: ${headers.length}`, 14, 35);

    // Table drawing
    const colCount = headers.length;
    const tableWidth = pageW - 28;
    const colWidth = Math.min(50, tableWidth / colCount);
    const rowHeight = 7;
    let y = 42;

    const addFooter = (): void => {
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text(footerText, pageW / 2, pageH - 8, { align: 'center' });
    };

    const drawRow = (cells: string[], isHeader: boolean): void => {
        if (y + rowHeight > pageH - 15) {
            addFooter();
            doc.addPage();
            y = 20;
        }

        doc.setFontSize(8);
        if (isHeader) {
            doc.setFillColor(37, 99, 235);
            doc.setTextColor(255, 255, 255);
            doc.setFont('helvetica', 'bold');
        } else {
            doc.setFillColor(248, 250, 252);
            doc.setTextColor(30, 30, 30);
            doc.setFont('helvetica', 'normal');
        }

        cells.forEach((cell, ci) => {
            const x = 14 + ci * colWidth;
            if (isHeader) {
                doc.rect(x, y, colWidth, rowHeight, 'F');
            }
            const maxChars = Math.floor(colWidth / 1.8);
            const displayText = cell.length > maxChars ? cell.slice(0, maxChars - 1) + '…' : cell;
            doc.text(displayText, x + 2, y + 4.5);
            doc.setDrawColor(200, 210, 220);
            doc.rect(x, y, colWidth, rowHeight);
        });

        y += rowHeight;
    };

    drawRow(headers, true);
    rows.forEach((row) => drawRow(row, false));
    addFooter();

    const filename = `krai-export-${now.toISOString().slice(0, 10)}.pdf`;
    doc.save(filename);
}

// ── TableBlock component ──────────────────────────────────────────────────────

function TableBlock({ headers, rows }: { headers: string[]; rows: string[][] }) {
    const [copied, setCopied] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [showExportMenu, setShowExportMenu] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setShowExportMenu(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const handleCopyTSV = () => {
        const tsv = tableToTSV(headers, rows);
        navigator.clipboard.writeText(tsv).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }).catch(() => {
            navigator.clipboard.writeText(tableToCSV(headers, rows)).catch(() => { });
        });
    };

    const handleDownloadCSV = () => {
        const today = new Date().toISOString().slice(0, 10);
        downloadFile(tableToCSV(headers, rows), `krai-export-${today}.csv`, 'text/csv;charset=utf-8;');
        setShowExportMenu(false);
    };

    const handleDownloadPDF = async () => {
        setExporting(true);
        setShowExportMenu(false);
        try {
            await exportToPDF(headers, rows, 'KR·AI — Kakarama Room Analytics');
        } catch (err) {
            console.error('PDF export error:', err);
        } finally {
            setExporting(false);
        }
    };

    return (
        <div className="my-2 rounded-lg border border-gray-200 shadow-sm overflow-hidden">
            {/* Toolbar */}
            <div className="flex items-center justify-between px-3 py-1.5 bg-gray-50 border-b border-gray-200">
                <span className="text-[10px] text-gray-500">
                    {rows.length} baris · {headers.length} kolom
                </span>
                <div className="flex items-center gap-1" ref={menuRef}>
                    {/* Copy TSV */}
                    <button
                        onClick={handleCopyTSV}
                        title="Salin sebagai TSV (kompatibel Excel & Google Sheets)"
                        className="flex items-center gap-1 px-2 py-0.5 text-[10px] rounded border border-gray-200 bg-white text-gray-600 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-colors"
                    >
                        {copied ? (
                            <>
                                <Check className="w-3 h-3" />
                                Tersalin
                            </>
                        ) : (
                            <>
                                <Copy className="w-3 h-3" />
                                Salin
                            </>
                        )}
                    </button>

                    {/* Export dropdown */}
                    <div className="relative">
                        <button
                            onClick={() => setShowExportMenu((v) => !v)}
                            title="Export tabel"
                            className="flex items-center gap-1 px-2 py-0.5 text-[10px] rounded border border-gray-200 bg-white text-gray-600 hover:bg-green-50 hover:text-green-700 hover:border-green-200 transition-colors"
                        >
                            {exporting ? '⏳' : '↓'} Export
                        </button>
                        {showExportMenu && (
                            <div className="absolute right-0 top-full mt-0.5 z-20 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[160px]">
                                <button
                                    onClick={handleDownloadCSV}
                                    className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                                >
                                    📊 Export ke Excel/CSV
                                </button>
                                <button
                                    onClick={handleDownloadPDF}
                                    disabled={exporting}
                                    className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                                >
                                    📄 Export ke PDF
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                    <thead>
                        <tr className="bg-blue-600 text-white">
                            {headers.map((h, hi) => (
                                <th key={hi} className="px-3 py-2 text-left font-semibold whitespace-nowrap border-r border-blue-500 last:border-r-0">
                                    {renderInline(h)}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row, ri) => (
                            <tr key={ri} className={ri % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                {row.map((cell, ci) => (
                                    <td key={ci} className="px-3 py-1.5 text-gray-700 border-r border-gray-100 last:border-r-0 border-b border-gray-100">
                                        {renderInline(cell)}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// ── Block renderer ────────────────────────────────────────────────────────────

function BlockRenderer({ block, idx }: { block: Block; idx: number }) {
    switch (block.type) {
        case 'heading': {
            const headingStyles: Record<1 | 2 | 3, string> = {
                1: 'text-sm font-bold text-gray-900 mt-3 mb-1 pb-0.5 border-b border-gray-100',
                2: 'text-sm font-bold text-blue-700 mt-2 mb-1',
                3: 'text-xs font-semibold text-gray-700 uppercase tracking-wide mt-2 mb-0.5',
            };
            return (
                <div key={idx} className={headingStyles[block.level]}>
                    {renderInline(block.text)}
                </div>
            );
        }

        case 'table':
            return <TableBlock key={idx} headers={block.headers} rows={block.rows} />;

        case 'ul':
            return (
                <ul key={idx} className="my-1.5 space-y-0.5 pl-1">
                    {block.items.map((item, ii) => {
                        const isPositive = /^[✅✔️💹📈🟢👍]/.test(item);
                        const isNegative = /^[❌⚠️📉🔴👎]/.test(item);
                        const isNeutral = /^[ℹ️💡📌🔵⚙️]/.test(item);
                        const bulletColor = isPositive
                            ? 'text-emerald-500'
                            : isNegative
                                ? 'text-red-400'
                                : isNeutral
                                    ? 'text-blue-400'
                                    : 'text-gray-400';
                        return (
                            <li key={ii} className="flex gap-2 text-sm text-gray-700">
                                <span className={`${bulletColor} flex-shrink-0 mt-0.5 text-xs`}>•</span>
                                <span className={isPositive ? 'text-emerald-800' : isNegative ? 'text-red-800' : ''}>
                                    {renderInline(item)}
                                </span>
                            </li>
                        );
                    })}
                </ul>
            );

        case 'ol':
            return (
                <ol key={idx} className="my-1.5 space-y-0.5 pl-1" start={block.start}>
                    {block.items.map((item, ii) => (
                        <li key={ii} className="flex gap-2 text-sm text-gray-700">
                            <span className="text-blue-600 font-semibold flex-shrink-0 min-w-[1.2rem] text-xs">
                                {block.start + ii}.
                            </span>
                            <span>{renderInline(item)}</span>
                        </li>
                    ))}
                </ol>
            );

        case 'codeblock':
            return (
                <div key={idx} className="my-2 rounded-lg overflow-hidden border border-gray-200">
                    {block.lang && (
                        <div className="bg-gray-800 px-3 py-1 text-xs text-gray-400 font-mono">{block.lang}</div>
                    )}
                    <pre className="bg-gray-900 text-green-400 text-xs font-mono px-4 py-3 overflow-x-auto whitespace-pre">
                        {block.code}
                    </pre>
                </div>
            );

        case 'blockquote': {
            const calloutType = detectCalloutType(block.lines[0] ?? '');
            const bqStyle = calloutType
                ? CALLOUT_STYLES[calloutType]
                : 'border-l-4 border-gray-300 bg-gray-50/60 text-gray-700';
            return (
                <blockquote key={idx} className={`my-1.5 pl-3 pr-2 py-2 rounded-r-md ${bqStyle}`}>
                    {block.lines.map((l, li) => (
                        <p key={li} className="text-sm leading-relaxed">
                            {renderInline(l)}
                        </p>
                    ))}
                </blockquote>
            );
        }

        case 'hr':
            return <hr key={idx} className="my-3 border-gray-200" />;

        case 'paragraph':
            return (
                <p key={idx} className="text-sm text-gray-700 leading-relaxed">
                    {renderInline(block.text.replace(/\n/g, ' '))}
                </p>
            );

        default:
            return null;
    }
}

// ── Public component ──────────────────────────────────────────────────────────

export default function MarkdownRenderer({
    content,
    partial = false,
    className = '',
}: MarkdownRendererProps) {
    const blocks = parseBlocks(content);
    return (
        <div className={`space-y-1 ${className}`}>
            {blocks.map((block, idx) => (
                <BlockRenderer key={idx} block={block} idx={idx} />
            ))}
            {partial && (
                <span className="inline-block w-0.5 h-3.5 bg-blue-500 ml-0.5 animate-pulse align-text-bottom" />
            )}
        </div>
    );
}
