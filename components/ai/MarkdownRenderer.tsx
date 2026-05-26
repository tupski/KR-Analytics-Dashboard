'use client';

import React, { useState } from 'react';

/**
 * AI Markdown Renderer — rich display optimized for analytics responses.
 *
 * Supports:
 * - Headings, bold/italic, inline code, links
 * - Tables (with copy CSV, download CSV, download JSON, Google Sheets export)
 * - Trend indicators: ↑ ↓ → emoji/color conversion
 * - Ordered/unordered lists with colored bullets
 * - Code blocks, blockquotes, horizontal rules
 * - Inline metric badges: colored pill for currency, percent, count patterns
 * - Alert callouts: > ⚠️ ... > ✅ ... > ℹ️ ...
 */

// ── Trend / icon helpers ──────────────────────────────────────────────────────

/** Map common emoji/text patterns in AI output to styled spans */
function renderTrend(text: string): React.ReactNode {
    // Arrow patterns: ↑ ↓ → ← and text equivalents
    const result = text
        // Positive trend: ↑, naik, +X%, meningkat
        .replace(/↑\s*([\d.,]+%?)/g, '<span class="inline-flex items-center gap-0.5 text-emerald-600 font-semibold">▲ $1</span>')
        // Negative trend: ↓, turun, -X%
        .replace(/↓\s*([\d.,]+%?)/g, '<span class="inline-flex items-center gap-0.5 text-red-600 font-semibold">▼ $1</span>')
        // Neutral: →
        .replace(/→/g, '<span class="text-gray-400">→</span>')
        // Percentage with sign
        .replace(/\+(\d[\d.,]*%)/g, '<span class="text-emerald-600 font-semibold">+$1</span>')
        .replace(/(-\d[\d.,]*%)/g, '<span class="text-red-600 font-semibold">$1</span>')
        // Rupiah amounts — Rp X.XXX.XXX
        .replace(/(Rp\s?[\d.,]+)/g, '<span class="font-mono text-gray-900 bg-gray-100 px-1 rounded">$1</span>');
    return <span dangerouslySetInnerHTML={{ __html: result }} />;
}

/** Callout type detection from blockquote first line */
function detectCalloutType(firstLine: string): 'warning' | 'success' | 'info' | 'error' | null {
    const t = firstLine.trim();
    if (t.startsWith('⚠️') || t.toLowerCase().includes('perhatian') || t.toLowerCase().includes('warning')) return 'warning';
    if (t.startsWith('✅') || t.startsWith('💡') || t.toLowerCase().includes('rekomendasi')) return 'success';
    if (t.startsWith('❌') || t.toLowerCase().includes('gagal') || t.toLowerCase().includes('error')) return 'error';
    if (t.startsWith('ℹ️') || t.startsWith('📌') || t.startsWith('💬')) return 'info';
    return null;
}

const CALLOUT_STYLES = {
    warning: 'bg-amber-50 border-l-4 border-amber-400 text-amber-800',
    success: 'bg-emerald-50 border-l-4 border-emerald-400 text-emerald-800',
    error: 'bg-red-50 border-l-4 border-red-400 text-red-800',
    info: 'bg-blue-50 border-l-4 border-blue-300 text-blue-800',
};

// ── Table export helpers ──────────────────────────────────────────────────────

function tableToCSV(headers: string[], rows: string[][]): string {
    const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const headerRow = headers.map(escape).join(',');
    const dataRows = rows.map(r => r.map(escape).join(','));
    return [headerRow, ...dataRows].join('\n');
}

function downloadFile(content: string, filename: string, mimeType: string) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

function openGoogleSheets(headers: string[], rows: string[][]) {
    const csv = tableToCSV(headers, rows);
    const encoded = encodeURIComponent(csv);
    // Google Sheets import via URL trick
    const url = `https://docs.google.com/spreadsheets/d/create?title=Krai%20Export&content=${encoded.slice(0, 2000)}`;
    window.open('https://docs.google.com/spreadsheets/create', '_blank');
    // Simpler approach: copy CSV and tell user
    navigator.clipboard.writeText(csv).catch(() => { });
    alert('CSV sudah disalin. Buka Google Sheets → Import → Upload → paste.');
}

// ── Inline rendering ──────────────────────────────────────────────────────────

function renderInline(text: string): React.ReactNode {
    const parts: React.ReactNode[] = [];
    let remaining = text;
    let key = 0;

    while (remaining.length > 0) {
        const codeIdx = remaining.indexOf('`');
        const boldIdx = remaining.indexOf('**');
        const italicIdx = remaining.indexOf('*');
        const linkIdx = remaining.indexOf('[');

        const candidates: { idx: number; type: string }[] = [
            { idx: boldIdx === -1 ? Infinity : boldIdx, type: 'bold' },
            { idx: italicIdx === -1 || italicIdx === boldIdx ? Infinity : italicIdx, type: 'italic' },
            { idx: codeIdx === -1 ? Infinity : codeIdx, type: 'code' },
            { idx: linkIdx === -1 ? Infinity : linkIdx, type: 'link' },
        ].filter(c => c.idx !== Infinity).sort((a, b) => a.idx - b.idx);

        if (candidates.length === 0) {
            parts.push(<span key={key++}>{renderTrend(remaining)}</span>);
            break;
        }

        const first = candidates[0];

        if (first.idx > 0) {
            const before = remaining.slice(0, first.idx);
            parts.push(<span key={key++}>{renderTrend(before)}</span>);
            remaining = remaining.slice(first.idx);
            continue;
        }

        if (first.type === 'bold') {
            const end = remaining.indexOf('**', 2);
            if (end === -1) { parts.push(<span key={key++}>{renderTrend(remaining[0])}</span>); remaining = remaining.slice(1); continue; }
            parts.push(<strong key={key++} className="font-semibold text-gray-900">{renderInline(remaining.slice(2, end))}</strong>);
            remaining = remaining.slice(end + 2);
        } else if (first.type === 'italic') {
            const end = remaining.indexOf('*', 1);
            if (end === -1) { parts.push(<span key={key++}>{renderTrend(remaining[0])}</span>); remaining = remaining.slice(1); continue; }
            parts.push(<em key={key++} className="italic text-gray-700">{renderInline(remaining.slice(1, end))}</em>);
            remaining = remaining.slice(end + 1);
        } else if (first.type === 'code') {
            const end = remaining.indexOf('`', 1);
            if (end === -1) { parts.push(<span key={key++}>{renderTrend(remaining[0])}</span>); remaining = remaining.slice(1); continue; }
            parts.push(
                <code key={key++} className="bg-gray-100 text-gray-800 px-1.5 py-0.5 rounded text-[11px] font-mono">
                    {remaining.slice(1, end)}
                </code>
            );
            remaining = remaining.slice(end + 1);
        } else if (first.type === 'link') {
            const labelEnd = remaining.indexOf(']');
            if (labelEnd === -1 || remaining[labelEnd + 1] !== '(') { parts.push(<span key={key++}>{renderTrend(remaining[0])}</span>); remaining = remaining.slice(1); continue; }
            const urlEnd = remaining.indexOf(')', labelEnd + 2);
            if (urlEnd === -1) { parts.push(<span key={key++}>{renderTrend(remaining[0])}</span>); remaining = remaining.slice(1); continue; }
            const label = remaining.slice(1, labelEnd);
            const url = remaining.slice(labelEnd + 2, urlEnd);
            parts.push(
                <a key={key++} href={url} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline hover:text-blue-800">
                    {label}
                </a>
            );
            remaining = remaining.slice(urlEnd + 1);
        }
    }

    return parts.length === 1 && typeof parts[0] !== 'string' ? parts[0] : <>{parts}</>;
}

// ── Block types ───────────────────────────────────────────────────────────────

type Block =
    | { type: 'heading'; level: 1 | 2 | 3; text: string }
    | { type: 'table'; headers: string[]; rows: string[][] }
    | { type: 'ul'; items: string[] }
    | { type: 'ol'; items: string[]; start: number }
    | { type: 'codeblock'; lang: string; code: string }
    | { type: 'blockquote'; lines: string[] }
    | { type: 'hr' }
    | { type: 'paragraph'; text: string };

function parseBlocks(raw: string): Block[] {
    const lines = raw.split('\n');
    const blocks: Block[] = [];
    let i = 0;

    while (i < lines.length) {
        const line = lines[i];
        const trimmed = line.trim();

        if (trimmed === '') { i++; continue; }

        // Fenced code block
        if (trimmed.startsWith('```')) {
            const lang = trimmed.slice(3).trim();
            const codeLines: string[] = [];
            i++;
            while (i < lines.length && !lines[i].trim().startsWith('```')) {
                codeLines.push(lines[i]);
                i++;
            }
            i++;
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

        // Table
        if (trimmed.includes('|') && i + 1 < lines.length) {
            const nextNonEmpty = lines.slice(i + 1).find(l => l.trim() !== '');
            if (nextNonEmpty && /^\|?[-: |]+\|?$/.test(nextNonEmpty.trim())) {
                const parseRow = (l: string) =>
                    l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());

                const headers = parseRow(lines[i]);
                i++;
                while (i < lines.length && /^\|?[-: |]+\|?$/.test(lines[i].trim())) i++;

                const rows: string[][] = [];
                while (i < lines.length && lines[i].trim().includes('|')) {
                    rows.push(parseRow(lines[i]));
                    i++;
                }
                blocks.push({ type: 'table', headers, rows });
                continue;
            }
        }

        // UL
        if (/^[-*+]\s+/.test(trimmed)) {
            const items: string[] = [];
            while (i < lines.length && /^[ \t]*[-*+]\s+/.test(lines[i])) {
                items.push(lines[i].trim().replace(/^[-*+]\s+/, ''));
                i++;
            }
            blocks.push({ type: 'ul', items });
            continue;
        }

        // OL
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

        // Paragraph
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
                (t.includes('|') && i + 1 < lines.length && /^\|?[-: |]+\|?$/.test((lines[i + 1] || '').trim()))
            ) break;
            paraLines.push(t);
            i++;
        }
        if (paraLines.length) {
            blocks.push({ type: 'paragraph', text: paraLines.join('\n') });
        }
    }

    return blocks;
}

// ── Table component with export ───────────────────────────────────────────────

function TableBlock({ headers, rows }: { headers: string[]; rows: string[][] }) {
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        const csv = tableToCSV(headers, rows);
        navigator.clipboard.writeText(csv).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }).catch(() => { });
    };

    const handleDownloadCSV = () => {
        downloadFile(tableToCSV(headers, rows), 'krai-export.csv', 'text/csv;charset=utf-8;');
    };

    const handleDownloadJSON = () => {
        const json = JSON.stringify(rows.map(r => {
            const obj: Record<string, string> = {};
            headers.forEach((h, i) => { obj[h] = r[i] ?? ''; });
            return obj;
        }), null, 2);
        downloadFile(json, 'krai-export.json', 'application/json');
    };

    return (
        <div className="my-2 rounded-lg border border-gray-200 shadow-sm overflow-hidden">
            {/* Export toolbar */}
            <div className="flex items-center justify-between px-3 py-1.5 bg-gray-50 border-b border-gray-200">
                <span className="text-[10px] text-gray-500">{rows.length} baris · {headers.length} kolom</span>
                <div className="flex items-center gap-1">
                    <button
                        onClick={handleCopy}
                        className="text-[10px] px-2 py-0.5 rounded bg-white border border-gray-200 text-gray-600 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                    >
                        {copied ? '✓ Tersalin' : 'Salin CSV'}
                    </button>
                    <button
                        onClick={handleDownloadCSV}
                        className="text-[10px] px-2 py-0.5 rounded bg-white border border-gray-200 text-gray-600 hover:bg-green-50 hover:text-green-600 transition-colors"
                    >
                        ↓ CSV
                    </button>
                    <button
                        onClick={handleDownloadJSON}
                        className="text-[10px] px-2 py-0.5 rounded bg-white border border-gray-200 text-gray-600 hover:bg-purple-50 hover:text-purple-600 transition-colors"
                    >
                        ↓ JSON
                    </button>
                </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                    <thead>
                        <tr className="bg-gray-50">
                            {headers.map((h, ci) => (
                                <th key={ci} className="px-3 py-2 text-left font-semibold text-gray-700 border-b border-gray-200 whitespace-nowrap">
                                    {renderInline(h)}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row, ri) => (
                            <tr key={ri} className={`border-b border-gray-100 hover:bg-blue-50/30 ${ri % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}`}>
                                {row.map((cell, ci) => (
                                    <td key={ci} className="px-3 py-1.5 text-gray-800 whitespace-nowrap">
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
            const styles = {
                1: 'text-sm font-bold text-gray-900 mt-3 mb-1 pb-0.5 border-b border-gray-100',
                2: 'text-sm font-bold text-blue-700 mt-2 mb-1',
                3: 'text-xs font-semibold text-gray-700 uppercase tracking-wide mt-2 mb-0.5',
            }[block.level];
            return <div key={idx} className={styles}>{renderInline(block.text)}</div>;
        }
        case 'table':
            return <TableBlock key={idx} headers={block.headers} rows={block.rows} />;
        case 'ul':
            return (
                <ul key={idx} className="my-1.5 space-y-0.5 pl-1">
                    {block.items.map((item, ii) => {
                        // Detect list item type by emoji prefix
                        const isPositive = /^[✅✔️💹📈🟢👍]/.test(item);
                        const isNegative = /^[❌⚠️📉🔴👎]/.test(item);
                        const isNeutral = /^[ℹ️💡📌🔵⚙️]/.test(item);
                        const bulletColor = isPositive ? 'text-emerald-500' : isNegative ? 'text-red-400' : isNeutral ? 'text-blue-400' : 'text-gray-400';
                        return (
                            <li key={ii} className="flex gap-2 text-sm text-gray-700">
                                <span className={`${bulletColor} flex-shrink-0 mt-0.5 text-xs`}>•</span>
                                <span className={isPositive ? 'text-emerald-800' : isNegative ? 'text-red-800' : ''}>{renderInline(item)}</span>
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
            const calloutType = detectCalloutType(block.lines[0] || '');
            const style = calloutType ? CALLOUT_STYLES[calloutType] : 'border-l-4 border-gray-300 bg-gray-50/60 text-gray-700';
            return (
                <blockquote key={idx} className={`my-1.5 pl-3 pr-2 py-2 rounded-r-md ${style}`}>
                    {block.lines.map((l, li) => (
                        <p key={li} className="text-sm leading-relaxed">{renderInline(l)}</p>
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

// ── Public API ────────────────────────────────────────────────────────────────

interface MarkdownRendererProps {
    content: string;
    partial?: boolean;
    className?: string;
}

export default function MarkdownRenderer({ content, partial = false, className = '' }: MarkdownRendererProps) {
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
