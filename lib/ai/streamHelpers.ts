/**
 * NDJSON Stream Helpers
 *
 * Utilities for creating NDJSON (Newline-Delimited JSON) streams.
 * Used by AI API routes to stream thinking steps and answers in realtime.
 *
 * NDJSON Format:
 *   {"type":"thinking","delta":"..."}
 *   {"type":"answer","delta":"..."}
 *   {"type":"usage","data":{...}}
 *   {"type":"done","finishReason":"stop","isTruncated":false}
 *   {"type":"error","message":"..."}
 */

// ── NDJSON Event Types ────────────────────────────────────────────────────

export interface NDJSONThinkingEvent {
    type: 'thinking';
    delta: string;
}

export interface NDJSONAnswerEvent {
    type: 'answer';
    delta: string;
}

export interface NDJSONUsageEvent {
    type: 'usage';
    data: Record<string, unknown>;
}

export interface NDJSONDoneEvent {
    type: 'done';
    finishReason: string;
    isTruncated: boolean;
}

export interface NDJSONErrorEvent {
    type: 'error';
    message: string;
}

export type NDJSONEvent =
    | NDJSONThinkingEvent
    | NDJSONAnswerEvent
    | NDJSONUsageEvent
    | NDJSONDoneEvent
    | NDJSONErrorEvent;

// ── NDJSON Stream Writer ──────────────────────────────────────────────────

export interface NDJSONStreamWriter {
    writeThinking(delta: string): void;
    writeAnswer(delta: string): void;
    writeUsage(data: Record<string, unknown>): void;
    writeDone(finishReason?: string, isTruncated?: boolean): void;
    writeError(message: string): void;
}

// ── Create NDJSON Response ────────────────────────────────────────────────

/**
 * Create a Response with NDJSON stream.
 * Calls the provided callback with an NDJSONStreamWriter that enqueues
 * newline-delimited JSON events into a ReadableStream.
 *
 * Stream auto-closes when callback completes.
 * Errors caught and written as error events.
 *
 * @example
 * ```ts
 * return createNDJSONResponse(async (w) => {
 *   w.writeThinking("Langkah pertama...");
 *   w.writeAnswer("Jawaban final...");
 *   w.writeUsage({ prompt_tokens: 100, completion_tokens: 50 });
 *   w.writeDone("stop");
 * });
 * ```
 */
export function createNDJSONResponse(
    cb: (writer: NDJSONStreamWriter) => Promise<void>,
): Response {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
        async start(controller) {
            const enqueue = (event: NDJSONEvent) => {
                controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'));
            };

            const writer: NDJSONStreamWriter = {
                writeThinking: (delta) => enqueue({ type: 'thinking', delta }),
                writeAnswer: (delta) => enqueue({ type: 'answer', delta }),
                writeUsage: (data) => enqueue({ type: 'usage', data }),
                writeDone: (finishReason = 'stop', isTruncated = false) =>
                    enqueue({ type: 'done', finishReason, isTruncated }),
                writeError: (message) => enqueue({ type: 'error', message }),
            };

            try {
                await cb(writer);
            } catch (err) {
                try {
                    enqueue({
                        type: 'error',
                        message: err instanceof Error ? err.message : String(err),
                    });
                } catch { /* swallow */ }
                try {
                    enqueue({ type: 'done', finishReason: 'error', isTruncated: false });
                } catch { /* swallow */ }
            } finally {
                try { controller.close(); } catch { /* swallow */ }
            }
        },
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
        },
    });
}

// ── SSE Parser for Streaming Responses ────────────────────────────────────

/**
 * Result from processing a single SSE chunk.
 */
interface SSEChunkResult {
    contentDelta: string;
    thinkingDelta: string;
    done: boolean;
}

/**
 * Parse a single SSE chunk (OpenAI-compatible format).
 * Returns content/thinking deltas and done status.
 */
export function parseOpenAISSEChunk(line: string): SSEChunkResult {
    const result: SSEChunkResult = {
        contentDelta: '',
        thinkingDelta: '',
        done: false,
    };

    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) return result;

    const payload = trimmed.replace(/^data:\s*/, '').trim();

    if (!payload || payload === '[DONE]') {
        if (payload === '[DONE]') result.done = true;
        return result;
    }

    try {
        const parsed = JSON.parse(payload);
        const choice = parsed?.choices?.[0];

        if (choice) {
            // delta (streaming) or message (non-streaming in SSE)
            const msg = choice.delta || choice.message;
            if (msg) {
                if (typeof msg.reasoning_content === 'string') {
                    result.thinkingDelta += msg.reasoning_content;
                }
                if (typeof msg.reasoning === 'string') {
                    result.thinkingDelta += msg.reasoning;
                }
                if (typeof msg.content === 'string') {
                    result.contentDelta += msg.content;
                }
            }
            // finish_reason signals done
            if (choice.finish_reason && choice.finish_reason !== 'null') {
                result.done = true;
            }
        }

        // Capture usage data from the chunk (stream_options.include_usage)
        if (parsed.usage) {
            (result as any)._usage = parsed.usage;
        }
    } catch {
        // Skip malformed JSON
    }

    return result;
}

/**
 * Parse a single Anthropic SSE line.
 * Anthropic uses named events: message_start, content_block_delta, message_stop, etc.
 */
export function parseAnthropicSSEChunk(
    eventType: string,
    payload: string,
): SSEChunkResult {
    const result: SSEChunkResult = {
        contentDelta: '',
        thinkingDelta: '',
        done: false,
    };

    if (!payload) return result;

    try {
        const parsed = JSON.parse(payload);

        switch (eventType) {
            case 'content_block_delta': {
                const delta = parsed.delta;
                if (delta?.type === 'text_delta' && typeof delta.text === 'string') {
                    result.contentDelta += delta.text;
                }
                if (delta?.type === 'thinking_delta' && typeof delta.thinking === 'string') {
                    result.thinkingDelta += delta.thinking;
                }
                break;
            }
            case 'message_stop':
                result.done = true;
                break;
            case 'message_start':
            case 'content_block_start':
            case 'content_block_stop':
            case 'ping':
                // No-op for these events
                break;
        }
    } catch {
        // Skip malformed JSON
    }

    return result;
}

// ── Stream Reader ─────────────────────────────────────────────────────────

/**
 * Read an AI provider streaming response and write NDJSON events.
 * Supports both OpenAI-compatible SSE and Anthropic event streams.
 *
 * @param reader - ReadableStreamDefaultReader from the fetch response body
 * @param writer - NDJSON stream writer
 * @param format - Provider format ('openai' or 'anthropic')
 * @returns Accumulated answer text and usage data
 */
export async function readProviderStream(
    reader: ReadableStreamDefaultReader<Uint8Array>,
    writer: NDJSONStreamWriter,
    format: 'openai' | 'anthropic',
): Promise<{ answer: string; thinking: string; usage?: Record<string, unknown> }> {
    const decoder = new TextDecoder();
    let buffer = '';
    let answer = '';
    let thinking = '';
    let usage: Record<string, unknown> | undefined;

    if (format === 'anthropic') {
        // Anthropic uses event: + data: lines
        let currentEvent = '';
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                const cleanLine = line.trim();
                if (cleanLine.startsWith('event:')) {
                    currentEvent = cleanLine.replace(/^event:\s*/, '').trim();
                } else if (cleanLine.startsWith('data:')) {
                    const payload = cleanLine.replace(/^data:\s*/, '').trim();
                    const chunk = parseAnthropicSSEChunk(currentEvent, payload);
                    if (chunk.thinkingDelta) {
                        thinking += chunk.thinkingDelta;
                        writer.writeThinking(chunk.thinkingDelta);
                    }
                    if (chunk.contentDelta) {
                        answer += chunk.contentDelta;
                        writer.writeAnswer(chunk.contentDelta);
                    }
                    if (chunk.done) {
                        // Extract usage from the message_delta event
                    }
                }
            }
        }
    } else {
        // OpenAI-compatible SSE
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                const chunk = parseOpenAISSEChunk(line);
                if (chunk.thinkingDelta) {
                    thinking += chunk.thinkingDelta;
                    writer.writeThinking(chunk.thinkingDelta);
                }
                if (chunk.contentDelta) {
                    answer += chunk.contentDelta;
                    writer.writeAnswer(chunk.contentDelta);
                }
                // Extract usage from chunk
                const usageData = (chunk as any)._usage;
                if (usageData) {
                    usage = usageData;
                }
            }
        }
    }

    return { answer, thinking, usage };
}
