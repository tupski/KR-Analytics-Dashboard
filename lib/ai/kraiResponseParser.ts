/**
 * KRAI Unified Response Parser
 *
 * Central parser for ALL KRAI response paths.
 * Handles plain text, JSON, SSE streams, OpenAI-compatible objects,
 * and provider-specific reasoning/thinking fields.
 *
 * Never create another parser — extend this one.
 */

import type { KraiAIResponse, KraiParserInput } from '../../types/ai'

// ── Default fallback message when model sends only reasoning ──────────────

const REASONING_ONLY_FALLBACK =
    'KRAI belum menerima jawaban final dari model. Model hanya mengirim langkah berpikir dan berhenti sebelum jawaban selesai. Coba regenerate atau pilih model non-reasoning.'

// ── Fallback patterns for cache quality check ────────────────────────────

const FALLBACK_PATTERNS = [
    'Insight tidak tersedia',
    'KRAI belum menerima jawaban final',
    'Jawaban terpotong karena batas token',
    'Model selesai menganalisis',
] as const

/**
 * Check if an answer is a fallback/error response that should NOT be cached.
 * Returns true for empty, very short, or known fallback messages.
 */
export function isFallbackResponse(answer: string): boolean {
    if (!answer || answer.trim().length < 10) return true
    return FALLBACK_PATTERNS.some(p => answer.includes(p))
}

// ── Extract answer from reasoning text (when content is empty) ──────────

/**
 * Try to extract a usable answer from reasoning/thinking text.
 * Only works for long reasoning (>200 chars) where the model likely
 * wrote a draft answer inside its reasoning chain.
 *
 * Strategy:
 * 1. Split thinking into paragraphs
 * 2. Check last 2 paragraphs for substantive content (non-planning)
 * 3. Fallback to last single paragraph if substantial
 * 4. Return null if thinking is too short or looks like planning only
 */
export function extractAnswerFromThinking(thinking: string): string | null {
    if (!thinking || thinking.length < 200) return null

    const paragraphs = thinking.split('\n').filter(p => p.trim().length > 0)
    if (paragraphs.length === 0) return null

    // Step indicators — if text starts with these, it's likely planning
    const planningIndicators = /^(first|second|third|finally|next|langkah|step|mari|pertama|1\.|2\.|3\.|sekarang|kemudian|setelah|sebelum)/i

    // Try last 2 paragraphs — reasoning often has final answer at the end
    const lastParts = paragraphs.slice(-2)
    const combined = lastParts.join('\n').trim()

    if (combined.length > 80 && !planningIndicators.test(combined)) {
        return combined
    }

    // Try last single paragraph
    const lastPara = paragraphs[paragraphs.length - 1].trim()
    if (lastPara.length > 60 && !planningIndicators.test(lastPara)) {
        return lastPara
    }

    return null
}

/**
 * Get a contextual fallback message based on finish reason and thinking length.
 * More informative than the blanket "tidak tersedia" message.
 */
export function getContextualFallback(finishReason?: string, thinking?: string): string {
    if (finishReason === 'length') {
        return 'Jawaban terpotong karena batas token. Coba naikkan max token atau gunakan model lain.'
    }
    if (thinking && thinking.length > 300) {
        return `Model selesai menganalisis (${thinking.length} karakter) tetapi belum menghasilkan jawaban final dalam format yang bisa ditampilkan. Coba regenerate atau gunakan model non-reasoning.`
    }
    return REASONING_ONLY_FALLBACK
}

// ── Main parser ───────────────────────────────────────────────────────────

/**
 * Parse any AI provider response into a clean `KraiAIResponse`.
 *
 * **Input detection order:**
 * 1. `null` / `undefined` → error
 * 2. String starts with `{` or `[` → `JSON.parse`
 * 3. String contains `\ndata: ` → SSE line-by-line parse
 * 4. String with `data: [DONE]` tail → strip tail, parse JSON
 * 5. Object → extract directly
 * 6. Plain string → answer only
 *
 * @example
 * ```ts
 * // Plain text
 * parseKraiResponse("Halo") // → { answer: "Halo", finishReason: "stop" }
 *
 * // OpenAI response with reasoning
 * parseKraiResponse({
 *   choices: [{
 *     message: { content: "", reasoning_content: "Step 1: ..." },
 *     finish_reason: "stop"
 *   }]
 * })
 * // → { answer: "KRAI belum menerima jawaban final...", thinking: "Step 1: ..." }
 *
 * // SSE lines
 * parseKraiResponse('data: {"choices":[{"delta":{"reasoning_content":"Step 1"}}]}\n' +
 *   'data: {"choices":[{"delta":{"content":"Answer"}}]}\n' +
 *   'data: [DONE]')
 * // → { answer: "Answer", thinking: "Step 1" }
 * ```
 */
export function parseKraiResponse(input: KraiParserInput): KraiAIResponse {
    // ── 1. null / undefined ─────────────────────────────────────────────
    if (input === null || input === undefined) {
        return {
            answer: '',
            thinking: '',
            thinkingSteps: [],
            finishReason: 'error',
        }
    }

    // ── 2. String input ─────────────────────────────────────────────────
    if (typeof input === 'string') {
        const trimmed = input.trim()

        // Empty string
        if (!trimmed) {
            return {
                answer: '',
                thinking: '',
                thinkingSteps: [],
                finishReason: 'error',
            }
        }

        // Check for SSE format (has \ndata: lines)
        if (trimmed.includes('\ndata: ')) {
            return parseSSEInput(trimmed)
        }

        // Check for data: [DONE] tail on a JSON string
        if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
            // Direct JSON parse
            return parseJSONInput(trimmed)
        }

        // Handle JSON string that might have data: [DONE] appended after
        const doneSuffixIndex = trimmed.indexOf('\ndata: [DONE]')
        if (doneSuffixIndex !== -1) {
            const jsonPart = trimmed.substring(0, doneSuffixIndex)
            const result = tryParseJSON(jsonPart)
            if (result) {
                return extractFromObject(result)
            }
        }

        // Try JSON parse for strings starting with { or [
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
            return parseJSONInput(trimmed)
        }

        // Handle data: [DONE] prefix-only case (no preceding JSON)
        if (trimmed === 'data: [DONE]') {
            return {
                answer: '',
                thinking: '',
                thinkingSteps: [],
                finishReason: 'stop',
            }
        }

        // Strip any data: prefix from plain text
        const cleaned = sanitizeAnswer(trimmed)

        // Plain text
        return {
            answer: cleaned,
            thinking: '',
            thinkingSteps: [],
            finishReason: 'stop',
        }
    }

    // ── 3. Object input ─────────────────────────────────────────────────
    if (typeof input === 'object') {
        return extractFromObject(input as Record<string, unknown>)
    }

    // ── 4. Fallback (shouldn't reach here) ──────────────────────────────
    return {
        answer: String(input),
        thinking: '',
        thinkingSteps: [],
        finishReason: 'unknown',
    }
}

// ── SSE chunk parser (for streaming) ────────────────────────────────────

/**
 * Parse a single SSE chunk during streaming.
 * Returns answer/thinking deltas and whether the stream is done.
 *
 * @example
 * ```ts
 * parseKraiSSEChunk('data: {"choices":[{"delta":{"content":"Hello"}}]}')
 * // → { answerDelta: "Hello", thinkingDelta: "", done: false }
 * ```
 */
export function parseKraiSSEChunk(chunk: string): {
    answerDelta: string
    thinkingDelta: string
    done: boolean
} {
    const trimmed = chunk.trim()
    if (!trimmed) return { answerDelta: '', thinkingDelta: '', done: false }

    let answerDelta = ''
    let thinkingDelta = ''
    let done = false

    const lines = trimmed.split(/\r?\n/)

    for (const line of lines) {
        const clean = line.trim()

        if (!clean.startsWith('data:')) continue

        const payload = clean.replace(/^data:\s*/, '').trim()

        if (!payload || payload === '[DONE]') {
            if (payload === '[DONE]') done = true
            continue
        }

        try {
            const parsed = JSON.parse(payload)
            const choice = parsed?.choices?.[0]

            if (choice) {
                const delta = choice.delta
                if (delta) {
                    if (delta.reasoning_content && typeof delta.reasoning_content === 'string') {
                        thinkingDelta += delta.reasoning_content
                    }
                    if (delta.reasoning && typeof delta.reasoning === 'string') {
                        thinkingDelta += delta.reasoning
                    }
                    if (delta.content && typeof delta.content === 'string') {
                        answerDelta += delta.content
                    }
                }

                // Non-streaming message in delta
                if (choice.message) {
                    if (choice.message.reasoning_content && typeof choice.message.reasoning_content === 'string') {
                        thinkingDelta += choice.message.reasoning_content
                    }
                    if (choice.message.reasoning && typeof choice.message.reasoning === 'string') {
                        thinkingDelta += choice.message.reasoning
                    }
                    if (choice.message.content && typeof choice.message.content === 'string') {
                        answerDelta += choice.message.content
                    }
                }

                if (choice.finish_reason && choice.finish_reason !== 'null') {
                    done = true
                }
            }
        } catch {
            // Skip malformed JSON lines
        }
    }

    return { answerDelta, thinkingDelta, done }
}

// ── Answer sanitizer ───────────────────────────────────────────────────

/**
 * Clean raw JSON/object artifacts from answer text.
 *
 * Removes:
 * - `data: ` prefix lines
 * - `[DONE]` lines
 * - Leading/trailing whitespace
 *
 * Does NOT modify thinking text.
 */
export function sanitizeAnswer(text: string): string {
    if (!text) return ''

    let cleaned = text

    // Remove lines that are only "data: ..." (but keep the rest)
    cleaned = cleaned
        .split(/\r?\n/)
        .filter((line) => {
            const trimmed = line.trim()
            // Remove lines that start with "data:" (SSE artifacts)
            if (trimmed.startsWith('data:') && !trimmed.startsWith('data: ')) return false
            if (trimmed === 'data: [DONE]') return false
            if (trimmed.startsWith('data: ') && trimmed.length < 100) {
                // Only remove if it looks like an SSE data line (starts with data: and has JSON or simple value)
                return false
            }
            return true
        })
        .join('\n')

    // Remove any remaining standalone [DONE] markers
    cleaned = cleaned.replace(/^\s*\[DONE\]\s*$/gm, '')

    // Trim leading/trailing whitespace
    cleaned = cleaned.trim()

    return cleaned
}

// ── Thinking step splitter ─────────────────────────────────────────────

/**
 * Split raw thinking text into numbered step chunks.
 *
 * Strategies (in order of preference):
 * 1. Double newline paragraphs
 * 2. Single newline lines
 * 3. Sentence boundaries (. ! ?) followed by uppercase or step keywords
 * 4. Explicit step markers (1., 2., Langkah, Step, -, •)
 * 5. Fallback: return as single step
 */
export function splitThinkingSteps(thinking: string): string[] {
    if (!thinking || !thinking.trim()) return []

    const text = thinking.trim()

    // Strategy 1: Double newline paragraphs
    const paragraphs = text.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean)
    if (paragraphs.length > 1) {
        return paragraphs
    }

    // Strategy 2: Single newline lines
    const lines = text.split('\n').map((s) => s.trim()).filter(Boolean)
    if (lines.length > 1) {
        return lines
    }

    // Strategy 3: Sentence boundaries (. ! ?) followed by capital letter or step keywords
    // Use lookahead with character class for leading uppercase / digit / quote and
    // alternation for known step-starting keywords
    const sentences = text.split(
        /(?<=[.!?])\s+(?=[A-Z"'"]|Langkah|第一步|思考|分析|首先|然后|最后|第一|第二|第三|第四|第五|Step|First|Second|Third|Finally|Next|Then|Now)/,
    )
    if (sentences.length > 1) {
        return sentences.map((s) => s.trim()).filter(Boolean)
    }

    // Strategy 4: Explicit step markers (number, bullet, Langkah, Step)
    const steps = text.split(/\n\s*(?:\d+[.)]|\*|[-•]|Langkah\s+\d+|Step\s+\d+)/)
    if (steps.length > 1) {
        return steps.map((s) => s.trim()).filter(Boolean)
    }

    // Fallback: Single step
    return [text]
}

// ── Internal helpers ──────────────────────────────────────────────────

/** Try to parse a JSON string; return null on failure */
function tryParseJSON(text: string): Record<string, unknown> | null {
    try {
        return JSON.parse(text) as Record<string, unknown>
    } catch {
        return null
    }
}

/** Parse a JSON string input */
function parseJSONInput(text: string): KraiAIResponse {
    const parsed = tryParseJSON(text)
    if (!parsed) {
        // Not valid JSON — treat as plain text
        return {
            answer: sanitizeAnswer(text),
            thinking: '',
            thinkingSteps: [],
            finishReason: 'stop',
        }
    }
    return extractFromObject(parsed)
}

/** Parse SSE-formatted input (contains \ndata: lines) */
function parseSSEInput(text: string): KraiAIResponse {
    let answer = ''
    let thinking = ''
    let done = false
    let lastParsed: Record<string, unknown> | null = null

    const lines = text.split(/\r?\n/)

    for (const line of lines) {
        const clean = line.trim()

        if (!clean.startsWith('data:')) continue

        const payload = clean.replace(/^data:\s*/, '').trim()

        if (!payload || payload === '[DONE]') {
            if (payload === '[DONE]') done = true
            continue
        }

        try {
            const parsed = JSON.parse(payload) as Record<string, unknown>
            lastParsed = parsed
            const choice = (parsed as any)?.choices?.[0]

            if (choice) {
                // Streaming delta
                if (choice.delta) {
                    if (choice.delta.reasoning_content && typeof choice.delta.reasoning_content === 'string') {
                        thinking += choice.delta.reasoning_content
                    }
                    if (choice.delta.reasoning && typeof choice.delta.reasoning === 'string') {
                        thinking += choice.delta.reasoning
                    }
                    if (choice.delta.content && typeof choice.delta.content === 'string') {
                        answer += choice.delta.content
                    }
                }

                // Non-streaming message
                if (choice.message) {
                    if (choice.message.reasoning_content && typeof choice.message.reasoning_content === 'string') {
                        thinking += choice.message.reasoning_content
                    }
                    if (choice.message.reasoning && typeof choice.message.reasoning === 'string') {
                        thinking += choice.message.reasoning
                    }
                    if (choice.message.content && typeof choice.message.content === 'string') {
                        answer += choice.message.content
                    }
                }
            }
        } catch {
            // Skip malformed JSON lines
        }
    }

    // Determine finish reason (extract BEFORE using in fallback)
    let finishReason: KraiAIResponse['finishReason'] = 'stop'
    let isTruncated = false

    if (lastParsed) {
        const fr = extractFinishReason(lastParsed)
        if (fr === 'length') {
            finishReason = 'length'
            isTruncated = true
        } else if (fr) {
            finishReason = fr
        }
    }

    // If we have no answer but got thinking from SSE, try to extract from reasoning
    const hasAnswer = answer.trim().length > 0
    const hasThinking = thinking.trim().length > 0

    if (!hasAnswer && hasThinking) {
        const extracted = extractAnswerFromThinking(thinking)
        if (extracted) {
            answer = extracted
        } else {
            answer = getContextualFallback(finishReason ?? undefined, thinking)
        }
    }

    if (!done && !hasAnswer && !hasThinking) {
        finishReason = 'error'
    }

    const finalAnswer = done ? sanitizeAnswer(answer) : sanitizeAnswer(answer)

    return {
        answer: finalAnswer,
        thinking,
        thinkingSteps: splitThinkingSteps(thinking),
        finishReason,
        isTruncated,
        raw: lastParsed ?? undefined,
    }
}

/** Extract fields from a parsed JSON object */
function extractFromObject(obj: Record<string, unknown>): KraiAIResponse {
    // Safety: check if obj has an 'error' field
    const errorField = (obj as any).error
    if (errorField) {
        const errorMsg = typeof errorField === 'string'
            ? errorField
            : typeof (errorField as any)?.message === 'string'
                ? (errorField as any).message
                : JSON.stringify(errorField)
        return {
            answer: '',
            thinking: '',
            thinkingSteps: [],
            finishReason: 'error',
            raw: obj,
        }
    }

    const thinking = extractThinking(obj)
    const answer = extractAnswer(obj)
    const finishReason = extractFinishReason(obj)
    const model = extractModel(obj)
    const usage = extractUsage(obj)
    const isTruncated = finishReason === 'length'

    // Empty content + reasoning present → try extraction, then contextual fallback
    const hasAnswer = answer.trim().length > 0
    const hasThinking = thinking.trim().length > 0
    let finalAnswer = answer
    if (!hasAnswer && hasThinking) {
        const extracted = extractAnswerFromThinking(thinking)
        finalAnswer = extracted || getContextualFallback(finishReason ?? undefined, thinking)
    }

    return {
        answer: sanitizeAnswer(finalAnswer),
        thinking,
        thinkingSteps: splitThinkingSteps(thinking),
        model,
        usage,
        finishReason: finishReason ?? 'stop',
        isTruncated,
        raw: obj,
    }
}

/** Extract thinking/reasoning text from an object */
function extractThinking(obj: Record<string, unknown>): string {
    const anyObj = obj as any

    // Check nested choices[0] paths
    const choice = anyObj.choices?.[0]
    if (choice) {
        // message path
        if (choice.message) {
            if (typeof choice.message.reasoning_content === 'string' && choice.message.reasoning_content) {
                return choice.message.reasoning_content
            }
            if (typeof choice.message.reasoning === 'string' && choice.message.reasoning) {
                return choice.message.reasoning
            }
        }
        // delta path (streaming)
        if (choice.delta) {
            if (typeof choice.delta.reasoning_content === 'string' && choice.delta.reasoning_content) {
                return choice.delta.reasoning_content
            }
            if (typeof choice.delta.reasoning === 'string' && choice.delta.reasoning) {
                return choice.delta.reasoning
            }
        }
    }

    // Direct fields on the object
    if (typeof anyObj.reasoning_content === 'string' && anyObj.reasoning_content) {
        return anyObj.reasoning_content
    }
    if (typeof anyObj.reasoning === 'string' && anyObj.reasoning) {
        return anyObj.reasoning
    }
    if (typeof anyObj.thinking === 'string' && anyObj.thinking) {
        return anyObj.thinking
    }
    if (typeof anyObj.thoughts === 'string' && anyObj.thoughts) {
        return anyObj.thoughts
    }

    return ''
}

/** Extract answer/content text from an object */
function extractAnswer(obj: Record<string, unknown>): string {
    const anyObj = obj as any

    // Check nested choices[0] paths
    const choice = anyObj.choices?.[0]
    if (choice) {
        // message path
        if (choice.message) {
            if (typeof choice.message.content === 'string') {
                return choice.message.content
            }
        }
        // delta path (streaming)
        if (choice.delta) {
            if (typeof choice.delta.content === 'string') {
                return choice.delta.content
            }
        }
        // Direct finish_reason text (unlikely but handle)
        if (typeof choice.text === 'string') {
            return choice.text
        }
    }

    // Check message.content at root level
    if (anyObj.message) {
        if (typeof anyObj.message.content === 'string') {
            return anyObj.message.content
        }
    }

    // Direct fields on the object
    if (typeof anyObj.content === 'string') {
        return anyObj.content
    }
    if (typeof anyObj.text === 'string') {
        return anyObj.text
    }
    if (typeof anyObj.answer === 'string') {
        return anyObj.answer
    }
    if (typeof anyObj.summary === 'string') {
        return anyObj.summary
    }
    if (typeof anyObj.insight === 'string') {
        return anyObj.insight
    }

    return ''
}

/** Extract finish_reason from an object */
function extractFinishReason(obj: Record<string, unknown>): KraiAIResponse['finishReason'] | null {
    const anyObj = obj as any

    // Check choices[0].finish_reason
    const choice = anyObj.choices?.[0]
    if (choice?.finish_reason) {
        const fr = String(choice.finish_reason)
        if (fr === 'stop') return 'stop'
        if (fr === 'length') return 'length'
        return 'unknown'
    }

    // Direct finish_reason on object
    if (anyObj.finish_reason) {
        const fr = String(anyObj.finish_reason)
        if (fr === 'stop') return 'stop'
        if (fr === 'length') return 'length'
        return 'unknown'
    }

    return null
}

/** Extract model identifier from an object */
function extractModel(obj: Record<string, unknown>): string | undefined {
    const anyObj = obj as any
    if (typeof anyObj.model === 'string') return anyObj.model
    if (typeof anyObj.modelId === 'string') return anyObj.modelId
    return undefined
}

/** Extract usage info from an object */
function extractUsage(obj: Record<string, unknown>): Record<string, unknown> | undefined {
    const anyObj = obj as any
    if (anyObj.usage && typeof anyObj.usage === 'object') {
        return anyObj.usage as Record<string, unknown>
    }
    return undefined
}
