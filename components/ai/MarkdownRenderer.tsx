'use client';

import React from 'react';

/**
 * Lightweight markdown renderer — no external deps needed.
 * Supports: headings, bold/italic, tables, ordered/unordered lists,
 * inline code, code blocks, blockquotes, horizontal rules, and paragraphs.
 */

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

        // Skip blank lines between blocks
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

        // Horizontal rule
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

        // Table — detect by checking if line (and next non-empty line) contains |
        if (trimmed.includes('|') && i + 1 < lines.length) {
            const nextNonEmpty = lines.slice(i + 1).find(l => l.trim() !== '');
            if (nextNonEmpty && /^\|?[-: |]+\|?$/.test(nextNonEmpty.trim())) {
                // Parse header row
                const parseRow = (l: string) =>
                    l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());

                const headers = parseRow(lines[i]);
                i++; // skip separator
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

        // Paragraph — collect consecutive non-special lines
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

/** Render inline markdown: bold, italic, inline code, links */
function renderInline(text: string): React.ReactNode {
    // Split on inline markers: **bold**, *italic*, `code`, [text](url)
    const parts: React.ReactNode[] = [];
    let remaining = text;
    let key = 0;

    while (remaining.length > 0) {
        // Inline code (must check before bold/italic to avoid conflict)
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
            parts.push(remaining);
            break;
        }

        const first = candidates[0];

        if (first.idx > 0) {
            parts.push(<span key={key++}>{remaining.slice(0, first.idx)}</span>);
            remaining = remaining.slice(first.idx);
            continue;
        }

        if (first.type === 'bold') {
            const end = remaining.indexOf('**', 2);
            if (end === -1) { parts.push(remaining[0]); remaining = remaining.slice(1); continue; }
            parts.push(<strong key={key++} className="font-semibold">{renderInline(remaining.slice(2, end))}</strong>);
            remaining = remaining.slice(end + 2);
        } else if (first.type === 'italic') {
            const end = remaining.indexOf('*', 1);
            if (end === -1) { parts.push(remaining[0]); remaining = remaining.slice(1); continue; }
            parts.push(<em key={key++}>{renderInline(remaining.slice(1, end))}</em>);
            remaining = remaining.slice(end + 1);
        } else if (first.type === 'code') {
            const end = remaining.indexOf('`', 1);
            if (end === -1) { parts.push(remaining[0]); remaining = remaining.slice(1); continue; }
            parts.push(
                <code key={key++} className="bg-gray-100 text-gray-800 px-1 py-0.5 rounded text-xs font-mono">
                    {remaining.slice(1, end)}
                </code>
            );
            remaining = remaining.slice(end + 1);
        } else if (first.type === 'link') {
            const labelEnd = remaining.indexOf(']');
            if (labelEnd === -1 || remaining[labelEnd + 1] !== '(') { parts.push(remaining[0]); remaining = remaining.slice(1); continue; }
            const urlEnd = remaining.indexOf(')', labelEnd + 2);
            if (urlEnd === -1) { parts.push(remaining[0]); remaining = remaining.slice(1); continue; }
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

    return parts.length === 1 && typeof parts[0] === 'string' ? parts[0] : <>{parts}</>;
}

function BlockRenderer({ block, idx }: { block: Block; idx: number }) {
    switch (block.type) {
        case 'heading': {
            const cls = {
                1: 'text-base font-bold text-gray-900 mt-3 mb-1',
                2: 'text-sm font-bold text-gray-900 mt-2 mb-1',
                3: 'text-sm font-semibold text-gray-800 mt-2 mb-0.5',
            }[block.level];
            return <div key={idx} className={cls}>{renderInline(block.text)}</div>;
        }
        case 'table':
            return (
                <div key={idx} className="overflow-x-auto my-2 rounded-lg border border-gray-200 shadow-sm">
                    <table className="w-full text-xs border-collapse">
                        <thead>
                            <tr className="bg-gray-50">
                                {block.headers.map((h, ci) => (
                                    <th key={ci} className="px-3 py-2 text-left font-semibold text-gray-700 border-b border-gray-200 whitespace-nowrap">
                                        {renderInline(h)}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {block.rows.map((row, ri) => (
                                <tr key={ri} className={ri % 2 === 0 ? 'bg-white' : 'bg-gray-50/60'}>
                                    {row.map((cell, ci) => (
                                        <td key={ci} className="px-3 py-1.5 text-gray-800 border-b border-gray-100 whitespace-nowrap">
                                            {renderInline(cell)}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            );
        case 'ul':
            return (
                <ul key={idx} className="my-1.5 space-y-0.5 pl-1">
                    {block.items.map((item, ii) => (
                        <li key={ii} className="flex gap-2 text-sm text-gray-700">
                            <span className="text-blue-400 flex-shrink-0 mt-0.5">•</span>
                            <span>{renderInline(item)}</span>
                        </li>
                    ))}
                </ul>
            );
        case 'ol':
            return (
                <ol key={idx} className="my-1.5 space-y-0.5 pl-1" start={block.start}>
                    {block.items.map((item, ii) => (
                        <li key={ii} className="flex gap-2 text-sm text-gray-700">
                            <span className="text-blue-600 font-semibold flex-shrink-0 min-w-[1.2rem]">
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
        case 'blockquote':
            return (
                <blockquote key={idx} className="my-1.5 pl-3 border-l-4 border-blue-300 bg-blue-50/50 py-1 pr-2 rounded-r-md">
                    {block.lines.map((l, li) => (
                        <p key={li} className="text-sm text-gray-700 italic">{renderInline(l)}</p>
                    ))}
                </blockquote>
            );
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

interface MarkdownRendererProps {
    content: string;
    /** For streaming/typing: only render content received so far */
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
            {partial && <span className="inline-block w-0.5 h-3.5 bg-blue-500 ml-0.5 animate-pulse align-text-bottom" />}
        </div>
    );
}
