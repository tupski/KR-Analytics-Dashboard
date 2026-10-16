/**
 * Tests for KRAI Unified Response Parser
 *
 * Covers all 10 required cases plus edge cases.
 */

import { describe, it, expect } from 'vitest'
import {
    parseKraiResponse,
    parseKraiSSEChunk,
    sanitizeAnswer,
    splitThinkingSteps,
} from '../kraiResponseParser'

// ── 1. Plain text → answer only ──────────────────────────────────────────

describe('parseKraiResponse – plain text', () => {
    it('returns answer for simple string', () => {
        const result = parseKraiResponse('Halo')
        expect(result.answer).toBe('Halo')
        expect(result.thinking).toBe('')
        expect(result.thinkingSteps).toEqual([])
        expect(result.finishReason).toBe('stop')
        expect(result.isTruncated).toBeFalsy()
    })

    it('trims whitespace from plain text', () => {
        const result = parseKraiResponse('  Halo dunia  ')
        expect(result.answer).toBe('Halo dunia')
    })

    it('handles multiline plain text without SSE markers', () => {
        const result = parseKraiResponse('Line one\nLine two')
        expect(result.answer).toBe('Line one\nLine two')
    })
})

// ── 2. JSON with `summary` → answer from summary ─────────────────────────

describe('parseKraiResponse – JSON with summary', () => {
    it('extracts answer from summary field when no content exists', () => {
        const input = JSON.stringify({ summary: 'Ringkasan insight' })
        const result = parseKraiResponse(input)
        expect(result.answer).toBe('Ringkasan insight')
        expect(result.finishReason).toBe('stop')
    })

    it('prefers content over summary when both exist', () => {
        const input = JSON.stringify({ content: 'Full content', summary: 'Summary text' })
        const result = parseKraiResponse(input)
        expect(result.answer).toBe('Full content')
    })
})

// ── 3. OpenAI response with content → answer from content ────────────────

describe('parseKraiResponse – OpenAI response with content', () => {
    it('extracts from choices[0].message.content', () => {
        const input = {
            id: 'chatcmpl-123',
            object: 'chat.completion',
            created: 1234567890,
            model: 'gpt-4',
            choices: [
                {
                    index: 0,
                    message: {
                        role: 'assistant',
                        content: 'Hello, how can I help?',
                    },
                    finish_reason: 'stop',
                },
            ],
            usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        }
        const result = parseKraiResponse(input)
        expect(result.answer).toBe('Hello, how can I help?')
        expect(result.model).toBe('gpt-4')
        expect(result.finishReason).toBe('stop')
        expect(result.usage).toEqual({ prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 })
    })

    it('extracts from JSON string of OpenAI response', () => {
        const input = JSON.stringify({
            choices: [{ message: { content: 'Answer from JSON string' }, finish_reason: 'stop' }],
        })
        const result = parseKraiResponse(input)
        expect(result.answer).toBe('Answer from JSON string')
    })
})

// ── 4. Empty content + reasoning_content → thinking filled, fallback answer ─

describe('parseKraiResponse – reasoning without final answer', () => {
    it('returns thinking + fallback answer when content empty and reasoning present', () => {
        const input = {
            choices: [
                {
                    message: {
                        content: '',
                        reasoning_content: 'Step 1: Analyze the problem.\nStep 2: Consider constraints.\nStep 3: Formulate solution.',
                    },
                    finish_reason: 'stop',
                },
            ],
        }
        const result = parseKraiResponse(input)
        expect(result.answer).toBe(
            'KRAI belum menerima jawaban final dari model. Model hanya mengirim langkah berpikir dan berhenti sebelum jawaban selesai. Coba regenerate atau pilih model non-reasoning.',
        )
        expect(result.thinking).toBe('Step 1: Analyze the problem.\nStep 2: Consider constraints.\nStep 3: Formulate solution.')
        expect(result.thinkingSteps.length).toBeGreaterThanOrEqual(3)
        expect(result.finishReason).toBe('stop')
    })

    it('handles reasoning field (non-content variant)', () => {
        const input = {
            choices: [
                {
                    message: {
                        content: '',
                        reasoning: 'Only thinking here',
                    },
                    finish_reason: 'stop',
                },
            ],
        }
        const result = parseKraiResponse(input)
        expect(result.thinking).toBe('Only thinking here')
        expect(result.answer).toContain('KRAI belum menerima jawaban final')
    })
})

// ── 5. SSE lines with delta content → answer joined ─────────────────────

describe('parseKraiResponse – SSE with delta content', () => {
    it('joins delta.content from multiple SSE lines', () => {
        const sse =
            'data: {"choices":[{"delta":{"content":"Hello"}}]}\n' +
            'data: {"choices":[{"delta":{"content":" world"}}]}\n' +
            'data: {"choices":[{"delta":{"content":"!"}}]}\n' +
            'data: [DONE]'

        const result = parseKraiResponse(sse)
        expect(result.answer).toBe('Hello world!')
        expect(result.thinking).toBe('')
        expect(result.finishReason).toBe('stop')
    })
})

// ── 6. SSE lines with delta reasoning_content → thinking joined ──────────

describe('parseKraiResponse – SSE with delta reasoning', () => {
    it('joins delta.reasoning_content from multiple SSE lines', () => {
        const sse =
            'data: {"choices":[{"delta":{"reasoning_content":"Step 1"}}]}\n' +
            'data: {"choices":[{"delta":{"reasoning_content":"Step 2"}}]}\n' +
            'data: {"choices":[{"delta":{"content":"Final answer"}}]}\n' +
            'data: [DONE]'

        const result = parseKraiResponse(sse)
        expect(result.thinking).toBe('Step 1Step 2')
        expect(result.answer).toBe('Final answer')
    })

    it('handles SSE with only reasoning deltas', () => {
        const sse =
            'data: {"choices":[{"delta":{"reasoning_content":"Thinking line 1"}}]}\n' +
            'data: {"choices":[{"delta":{"reasoning_content":"Thinking line 2"}}]}\n' +
            'data: [DONE]'

        const result = parseKraiResponse(sse)
        expect(result.thinking).toBe('Thinking line 1Thinking line 2')
        expect(result.answer).toBe(
            'KRAI belum menerima jawaban final dari model. Model hanya mengirim langkah berpikir dan berhenti sebelum jawaban selesai. Coba regenerate atau pilih model non-reasoning.',
        )
    })
})

// ── 7. Full JSON + data: [DONE] tail → parse JSON, ignore done ──────────

describe('parseKraiResponse – JSON with data: [DONE] tail', () => {
    it('strips data: [DONE] suffix and parses JSON', () => {
        const input =
            '{"choices":[{"message":{"content":"Response before done"},"finish_reason":"stop"}]}\ndata: [DONE]'

        const result = parseKraiResponse(input)
        expect(result.answer).toBe('Response before done')
        expect(result.finishReason).toBe('stop')
    })
})

// ── 8. finish_reason: "length" → isTruncated = true ─────────────────────

describe('parseKraiResponse – truncation detection', () => {
    it('sets isTruncated when finish_reason is length', () => {
        const input = {
            choices: [
                {
                    message: { content: 'Partial response that got cut off' },
                    finish_reason: 'length',
                },
            ],
        }
        const result = parseKraiResponse(input)
        expect(result.answer).toBe('Partial response that got cut off')
        expect(result.isTruncated).toBe(true)
        expect(result.finishReason).toBe('length')
    })

    it('sets isTruncated from JSON string with length finish_reason', () => {
        const input = JSON.stringify({
            choices: [{ message: { content: 'Partial' }, finish_reason: 'length' }],
        })
        const result = parseKraiResponse(input)
        expect(result.isTruncated).toBe(true)
        expect(result.finishReason).toBe('length')
    })
})

// ── 9. null/undefined → empty error response ────────────────────────────

describe('parseKraiResponse – null/undefined input', () => {
    it('returns error response for null', () => {
        const result = parseKraiResponse(null)
        expect(result.answer).toBe('')
        expect(result.thinking).toBe('')
        expect(result.finishReason).toBe('error')
    })

    it('returns error response for undefined', () => {
        const result = parseKraiResponse(undefined)
        expect(result.answer).toBe('')
        expect(result.finishReason).toBe('error')
    })
})

// ── 10. Empty string → empty error response ─────────────────────────────

describe('parseKraiResponse – empty string input', () => {
    it('returns error response for empty string', () => {
        const result = parseKraiResponse('')
        expect(result.answer).toBe('')
        expect(result.thinking).toBe('')
        expect(result.finishReason).toBe('error')
    })

    it('returns error response for whitespace-only string', () => {
        const result = parseKraiResponse('   ')
        expect(result.answer).toBe('')
        expect(result.finishReason).toBe('error')
    })
})

// ── Edge cases ──────────────────────────────────────────────────────────

describe('parseKraiResponse – edge cases', () => {
    it('handles object with error field', () => {
        const input = { error: 'API rate limit exceeded' }
        const result = parseKraiResponse(input)
        expect(result.answer).toBe('')
        expect(result.finishReason).toBe('error')
    })

    it('handles object with error.message', () => {
        const input = { error: { message: 'Insufficient quota' } }
        const result = parseKraiResponse(input)
        expect(result.answer).toBe('')
        expect(result.finishReason).toBe('error')
    })

    it('handles text field as answer', () => {
        const input = { text: 'Simple text response' }
        const result = parseKraiResponse(input)
        expect(result.answer).toBe('Simple text response')
    })

    it('handles answer field as answer', () => {
        const input = { answer: 'Answer field response' }
        const result = parseKraiResponse(input)
        expect(result.answer).toBe('Answer field response')
    })

    it('handles insight field as answer', () => {
        const input = { insight: 'Insight from analysis' }
        const result = parseKraiResponse(input)
        expect(result.answer).toBe('Insight from analysis')
    })

    it('handles only data: [DONE] without preceding data', () => {
        const result = parseKraiResponse('data: [DONE]')
        expect(result.answer).toBe('')
        expect(result.finishReason).toBe('stop')
    })

    it('prefers reasoning_content over content in OpenRouter-style response', () => {
        const input = {
            choices: [{
                message: {
                    content: '',
                    reasoning_content: 'This is the reasoning',
                },
                finish_reason: 'stop',
            }],
        }
        const result = parseKraiResponse(input)
        expect(result.thinking).toBe('This is the reasoning')
        expect(result.answer).toContain('KRAI belum menerima jawaban final')
    })
})

// ── parseKraiSSEChunk ─────────────────────────────────────────────────────

describe('parseKraiSSEChunk', () => {
    it('extracts content delta', () => {
        const result = parseKraiSSEChunk('data: {"choices":[{"delta":{"content":"Hello"}}]}')
        expect(result.answerDelta).toBe('Hello')
        expect(result.thinkingDelta).toBe('')
        expect(result.done).toBe(false)
    })

    it('extracts reasoning_content delta', () => {
        const result = parseKraiSSEChunk('data: {"choices":[{"delta":{"reasoning_content":"Thinking..."}}]}')
        expect(result.answerDelta).toBe('')
        expect(result.thinkingDelta).toBe('Thinking...')
        expect(result.done).toBe(false)
    })

    it('detects done from finish_reason', () => {
        const result = parseKraiSSEChunk('data: {"choices":[{"delta":{"content":"Final"}}]}\ndata: {"choices":[{"delta":{},"finish_reason":"stop"}]}')
        expect(result.answerDelta).toBe('Final')
        expect(result.done).toBe(true)
    })

    it('detects done from [DONE] marker', () => {
        const result = parseKraiSSEChunk('data: [DONE]')
        expect(result.done).toBe(true)
    })

    it('returns empty for empty input', () => {
        const result = parseKraiSSEChunk('')
        expect(result.answerDelta).toBe('')
        expect(result.thinkingDelta).toBe('')
        expect(result.done).toBe(false)
    })

    it('handles non-streaming message in SSE chunk', () => {
        const result = parseKraiSSEChunk('data: {"choices":[{"message":{"content":"Batch content","reasoning_content":"Batch reasoning"}}]}')
        expect(result.answerDelta).toBe('Batch content')
        expect(result.thinkingDelta).toBe('Batch reasoning')
    })
})

// ── sanitizeAnswer ──────────────────────────────────────────────────────

describe('sanitizeAnswer', () => {
    it('removes data: prefix lines', () => {
        const result = sanitizeAnswer('data: {"key":"value"}\nActual answer')
        expect(result).toBe('Actual answer')
    })

    it('removes [DONE] lines', () => {
        const result = sanitizeAnswer('Answer text\n[DONE]\nMore text')
        expect(result).toBe('Answer text\nMore text')
    })

    it('trims whitespace', () => {
        const result = sanitizeAnswer('  Hello  ')
        expect(result).toBe('Hello')
    })

    it('returns empty string for empty input', () => {
        expect(sanitizeAnswer('')).toBe('')
    })
})

// ── splitThinkingSteps ──────────────────────────────────────────────────

describe('splitThinkingSteps', () => {
    it('splits by double newline', () => {
        const steps = splitThinkingSteps('Step 1\n\nStep 2\n\nStep 3')
        expect(steps).toEqual(['Step 1', 'Step 2', 'Step 3'])
    })

    it('returns single step for short single paragraph', () => {
        const steps = splitThinkingSteps('Short thought')
        expect(steps).toEqual(['Short thought'])
    })

    it('returns multiple paragraphs', () => {
        const text = 'Para one\n\nPara two'
        const steps = splitThinkingSteps(text)
        expect(steps).toEqual(['Para one', 'Para two'])
    })

    it('filters empty steps from double newline', () => {
        const steps = splitThinkingSteps('Step 1\n\n\n\nStep 2')
        expect(steps).toEqual(['Step 1', 'Step 2'])
    })

    it('returns empty array for empty input', () => {
        expect(splitThinkingSteps('')).toEqual([])
    })

    it('returns empty array for whitespace-only input', () => {
        expect(splitThinkingSteps('   ')).toEqual([])
    })

    // Strategy 2: single newline lines
    it('splits by single newline when no double newline present', () => {
        const steps = splitThinkingSteps('Langkah pertama\nLangkah kedua\nLangkah ketiga')
        expect(steps).toEqual(['Langkah pertama', 'Langkah kedua', 'Langkah ketiga'])
    })

    // Strategy 3: sentence boundaries
    it('splits by sentence boundary when no newlines exist', () => {
        const steps = splitThinkingSteps('First I analyze the data. Then I check the constraints. Finally I compute the result.')
        expect(steps.length).toBeGreaterThanOrEqual(3)
        expect(steps[0]).toContain('First I analyze the data')
        expect(steps[1]).toContain('Then I check the constraints')
        expect(steps[2]).toContain('Finally I compute the result')
    })

    // Strategy 4: step markers
    it('splits by explicit step markers like 1. 2. 3.', () => {
        const steps = splitThinkingSteps('1. Analyze data\n2. Check constraints\n3. Compute result')
        expect(steps.length).toBeGreaterThanOrEqual(3)
    })

    it('splits by Langkah keyword', () => {
        const steps = splitThinkingSteps('Langkah 1: Analisa data\nLangkah 2: Cek kendala\nLangkah 3: Hasil')
        expect(steps.length).toBeGreaterThanOrEqual(3)
    })

    // Fallback
    it('returns single step when no split strategy matches', () => {
        const steps = splitThinkingSteps('Just a single continuous block of thinking without any clear breaks anywhere.')
        expect(steps).toEqual(['Just a single continuous block of thinking without any clear breaks anywhere.'])
    })

    it('handles nullish input', () => {
        expect(splitThinkingSteps(null as unknown as string)).toEqual([])
        expect(splitThinkingSteps(undefined as unknown as string)).toEqual([])
    })
})
