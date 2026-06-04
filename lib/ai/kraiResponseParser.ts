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
 * Rules:
 * - Split by double newline or paragraph breaks
 * - If single paragraph < 200 chars, return as single step
 * - If multiple paragraphs, each paragraph = 1 step
 * - Clean up empty steps
 */
export function splitThinkingSteps(thinking: string): string[] {
    if (!thinking) return []

    // Split by double newline (paragraph break)
    const paragraphs = thinking.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)

    if (paragraphs.length === 0) return []
    if (paragraphs.length === 1 && paragraphs[0].length < 200) {
        return [paragraphs[0]]
    }

    return paragraphs
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

    // If we have no answer but got thinking from SSE, apply fallback
    const hasAnswer = answer.trim().length > 0
    const hasThinking = thinking.trim().length > 0

    if (!hasAnswer && hasThinking) {
        answer = REASONING_ONLY_FALLBACK
    }

    // Determine finish reason
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

    // Empty content + reasoning present → fallback
    const hasAnswer = answer.trim().length > 0
    const hasThinking = thinking.trim().length > 0
    const finalAnswer = !hasAnswer && hasThinking ? REASONING_ONLY_FALLBACK : answer

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
