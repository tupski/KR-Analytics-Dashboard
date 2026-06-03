/**
 * normalizeAiText — Central AI Response Normalizer
 *
 * Normalizes ANY AI provider response into clean natural language text.
 * Handles:
 * - Plain text (passthrough)
 * - JSON-wrapped text (single or double-wrapped)
 * - OpenAI format { choices: [{ message: { content } }] }
 * - Structured output { summary, recommendations, insight, etc. }
 * - Arrays (joined as bullet list)
 * - Objects (flattened to text)
 * - Double-encoded JSON strings
 * - Invalid JSON (safe fallback)
 *
 * Use this EVERYWHERE AI text is displayed to users.
 * Do NOT use ad-hoc JSON parsing in individual components.
 */

// ─── Priority-ordered fields to extract from a parsed JSON object ──────────

const TEXT_FIELDS_PRIORITY: string[] = [
    'message',
    'text',
    'content',
    'answer',
    'output',
    'result',
    'summary',
    'insight',
    'analysis',
    'explanation',
    'recommendation',
    'recommendations',
    'response',
];

// ─── Keys that contain sub-objects (not terminal text) ────────────────────

const STRUCTURAL_KEYS = new Set([
    'choices',
    'candidates',
    'messages',
    'data',
]);

// ─── Util: is the value likely a JSON string? ─────────────────────────────

function looksLikeJson(input: string): boolean {
    const trimmed = input.trim();
    return (trimmed.startsWith('{') && trimmed.endsWith('}'))
        || (trimmed.startsWith('[') && trimmed.endsWith(']'));
}

// ─── Core recursive normalizer ────────────────────────────────────────────

/**
 * Recursively extract natural text from unknown input.
 *
 * @param input - Raw value from AI provider (any type)
 * @param depth - Recursion guard (max 5 levels)
 * @returns Clean text string, never raw JSON objects
 */
function extractText(input: unknown, depth: number = 0): string | null {
    if (depth > 5) return null; // recursion guard
    if (input === null || input === undefined) return null;

    // ── String ──────────────────────────────────────────────────────
    if (typeof input === 'string') {
        const trimmed = input.trim();
        if (!trimmed) return null;

        // If it looks like JSON, try to parse and recurse
        if (looksLikeJson(trimmed)) {
            try {
                const parsed = JSON.parse(trimmed);
                return extractText(parsed, depth + 1);
            } catch {
                // Not valid JSON — return original string
                return trimmed;
            }
        }

        // Plain text — return as-is
        return trimmed;
    }

    // ── Number / boolean ──────────────────────────────────────────
    if (typeof input === 'number' || typeof input === 'boolean') {
        return String(input);
    }

    // ── Array ─────────────────────────────────────────────────────
    if (Array.isArray(input)) {
        if (input.length === 0) return null;
        if (input.length === 1) {
            return extractText(input[0], depth + 1);
        }

        // Check if entries are simple strings/numbers
        const allPrimitive = input.every(
            (v) => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean',
        );

        if (allPrimitive) {
            return input.map(String).join('\n');
        }

        // Object entries — try to find text in each
        const items: string[] = [];
        for (const item of input) {
            const t = extractText(item, depth + 1);
            if (t && t.length > 1) items.push(t);
        }

        if (items.length === 0) return null;
        if (items.length === 1) return items[0];

        // Format as bullet list
        return items.map((s) => `- ${s}`).join('\n');
    }

    // ── Object ────────────────────────────────────────────────────
    if (typeof input === 'object') {
        const obj = input as Record<string, unknown>;
        const keys = Object.keys(obj);
        if (keys.length === 0) return null;

        // 1. Check OpenAI format: choices → message → content
        if (Array.isArray(obj.choices) && obj.choices.length > 0) {
            const choice = obj.choices[0];
            if (choice) {
                // Try message.content (OpenAI standard)
                if (choice.message?.content && typeof choice.message.content === 'string') {
                    const t = extractText(choice.message.content, depth + 1);
                    if (t) return t;
                }
                // Try message.text
                if (choice.message?.text && typeof choice.message.text === 'string') {
                    const t = extractText(choice.message.text, depth + 1);
                    if (t) return t;
                }
                // Try direct text
                if (choice.text && typeof choice.text === 'string') {
                    const t = extractText(choice.text, depth + 1);
                    if (t) return t;
                }
                // Recursive into message
                if (choice.message) {
                    const t = extractText(choice.message, depth + 1);
                    if (t) return t;
                }
            }
        }

        // 2. Check Gemini format: candidates → content → parts → text
        if (Array.isArray(obj.candidates) && obj.candidates.length > 0) {
            const candidate = obj.candidates[0];
            if (candidate?.content?.parts?.[0]?.text) {
                const t = extractText(candidate.content.parts[0].text, depth + 1);
                if (t) return t;
            }
        }

        // 3. Check Anthropic format: content[{text}]
        if (Array.isArray(obj.content) && obj.content.length > 0 && obj.content[0]?.text) {
            const texts = obj.content
                .filter((c: any) => c.type === 'text' && c.text)
                .map((c: any) => c.text);
            if (texts.length > 0) {
                return texts.join('\n\n');
            }
        }

        // 4. Check direct fields (priority order)
        for (const field of TEXT_FIELDS_PRIORITY) {
            if (field in obj) {
                const val = obj[field];
                if (typeof val === 'string') {
                    const t = extractText(val, depth + 1);
                    if (t) return t;
                }
                if (Array.isArray(val)) {
                    const t = extractText(val, depth + 1);
                    if (t) return t;
                }
                if (typeof val === 'object' && val !== null) {
                    const t = extractText(val, depth + 1);
                    if (t) return t;
                }
            }
        }

        // 5. Flatten important fields into readable text
        const importantFields = TEXT_FIELDS_PRIORITY.filter((f) => f in obj);
        if (importantFields.length > 0) {
            const parts: string[] = [];
            for (const field of importantFields) {
                const val = obj[field];
                if (typeof val === 'string' && val.length > 1) {
                    parts.push(`${field}: ${val}`);
                } else if (Array.isArray(val) && val.length > 0) {
                    const items = val.map((v: any) =>
                        typeof v === 'string' ? v : typeof v === 'object' ? v.text || v.content || '' : String(v),
                    ).filter(Boolean);
                    if (items.length > 0) {
                        parts.push(`${field}: ${items.join(', ')}`);
                    }
                }
            }
            if (parts.length > 0) {
                return parts.join('\n');
            }
        }

        // 6. Check for output_text (some providers)
        if (obj.output_text && typeof obj.output_text === 'string') {
            return extractText(obj.output_text, depth + 1);
        }

        // 7. Last resort: find any string value in the object
        for (const val of Object.values(obj)) {
            if (typeof val === 'string' && val.length > 10) {
                const t = extractText(val, depth + 1);
                if (t) return t;
            }
        }

        // 8. Serialize non-empty object — but only meaningful fields
        const meaningfulValues = Object.values(obj)
            .filter((v) => typeof v === 'string' || typeof v === 'number')
            .map(String)
            .filter((s) => s.length > 2);
        if (meaningfulValues.length > 0) {
            return meaningfulValues.join(' — ');
        }

        return null; // nothing useful found
    }

    return null;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Normalize AI response into clean natural language text.
 *
 * - Accepts raw API response (any type)
 * - Returns plain text string
 * - Never returns JSON, objects, or [object Object]
 * - Never throws — always returns a string
 *
 * @example
 *   normalizeAiText("Halo")               // "Halo"
 *   normalizeAiText('{"message":"Halo"}') // "Halo"
 *   normalizeAiText({choices:[{message:{content:"Halo"}}]}) // "Halo"
 */
export function normalizeAiText(input: unknown): string {
    // Fast path: empty/null
    if (input === null || input === undefined) return '';
    if (typeof input === 'string' && !input.trim()) return '';

    try {
        const result = extractText(input);
        if (result && result.trim().length > 0) {
            return result.trim();
        }
    } catch {
        // Silent fallback — never throw
    }

    // Ultimate fallback: convert to string safely
    if (typeof input === 'string') return input;
    if (typeof input === 'number' || typeof input === 'boolean') return String(input);
    if (Array.isArray(input)) return input.map(String).join('\n');
    if (typeof input === 'object') {
        try {
            const str = JSON.stringify(input);
            // Only return if it's useful text
            if (str && str.length > 2 && str.length < 200) return str;
        } catch {
            // Ignore
        }
    }

    return '';
}

/**
 * Check if input contains JSON-wrapped text that needs normalization.
 * Useful for logging/debugging without modifying behavior.
 */
export function isJsonWrapped(input: unknown): boolean {
    if (typeof input === 'string') return looksLikeJson(input);
    if (typeof input === 'object' && input !== null) {
        // Check common AI wrapping patterns
        const obj = input as Record<string, unknown>;
        if (Array.isArray(obj.choices) || Array.isArray(obj.candidates)) return true;
        // Check if any TEXT_FIELDS_PRIORITY value is JSON string
        for (const field of TEXT_FIELDS_PRIORITY) {
            const val = obj[field];
            if (typeof val === 'string' && looksLikeJson(val)) return true;
        }
    }
    return false;
}
