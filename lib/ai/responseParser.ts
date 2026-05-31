/**
 * AI Response Parser
 * 
 * Handles both non-streaming JSON and streaming SSE responses from AI providers.
 * Some providers/proxies return SSE format even when streaming is not explicitly enabled.
 * 
 * P0-3 FIX: Robust parsing that accepts any OpenAI-compatible response format
 * and never fails due to unknown fields.
 */

/**
 * Parse AI response that can be any of:
 * 1. Regular JSON: { choices: [{ message: { content: "..." } }] }
 * 2. SSE format: data: {...}\ndata: {...}\ndata: [DONE]
 * 3. Alternative formats with unknown fields
 * 
 * @param raw - Raw response text from fetch
 * @returns Parsed JSON object
 * @throws Error with safe message if parsing fails
 */
export function parseAIResponse(raw: string): any {
    const trimmed = raw.trim();

    if (!trimmed) {
        throw new Error('Respons AI kosong — tidak ada data dari provider.');
    }

    // Detect SSE format
    if (trimmed.startsWith('data:') || trimmed.includes('\ndata:')) {
        return parseSSEResponse(trimmed);
    }

    // Regular JSON format — safe parse
    try {
        return JSON.parse(trimmed);
    } catch {
        // Not JSON at all — return a reconstructed response with raw text as content
        return {
            id: 'raw-fallback',
            object: 'chat.completion',
            created: Math.floor(Date.now() / 1000),
            model: 'unknown',
            choices: [{
                index: 0,
                message: {
                    role: 'assistant',
                    content: trimmed.substring(0, 8000),
                },
                finish_reason: 'stop',
            }],
        };
    }
}

/**
 * Parse SSE (Server-Sent Events) format response.
 * Extracts and concatenates content from multiple data chunks.
 * 
 * @param raw - Raw SSE response text
 * @returns Reconstructed JSON object with combined content
 */
function parseSSEResponse(raw: string): any {
    let finalContent = '';
    let lastValidChunk: any = null;
    let role = 'assistant';
    let toolCalls: any[] = [];

    const lines = raw.split(/\r?\n/);

    for (const line of lines) {
        const cleanLine = line.trim();

        // Skip non-data lines
        if (!cleanLine.startsWith('data:')) continue;

        // Extract payload after "data: "
        const payload = cleanLine.replace(/^data:\s*/, '');

        // Skip empty or [DONE] markers
        if (!payload || payload === '[DONE]') continue;

        try {
            const chunk = JSON.parse(payload);
            lastValidChunk = chunk;

            // Extract content from delta (streaming) or message (non-streaming)
            const choice = chunk.choices?.[0];
            if (choice) {
                // Streaming format: delta.content
                if (choice.delta?.content) {
                    finalContent += choice.delta.content;
                }
                // Non-streaming format: message.content
                if (choice.message?.content) {
                    finalContent += choice.message.content;
                }
                // Extract role if available
                if (choice.delta?.role) {
                    role = choice.delta.role;
                }
                if (choice.message?.role) {
                    role = choice.message.role;
                }
                // Extract tool calls if present
                if (choice.delta?.tool_calls) {
                    toolCalls = mergeToolCalls(toolCalls, choice.delta.tool_calls);
                }
                if (choice.message?.tool_calls) {
                    toolCalls = choice.message.tool_calls;
                }
            }
        } catch {
            // Skip malformed SSE chunks silently
        }
    }

    // Reconstruct OpenAI-compatible response format
    if (!lastValidChunk) {
        throw new Error('Respons SSE tidak valid — tidak ada data chunk yang ditemukan.');
    }

    // Build response object based on last chunk structure
    const response: any = {
        id: lastValidChunk.id || 'sse-reconstructed',
        object: lastValidChunk.object || 'chat.completion',
        created: lastValidChunk.created || Math.floor(Date.now() / 1000),
        model: lastValidChunk.model || 'unknown',
        choices: [
            {
                index: 0,
                message: {
                    role,
                    content: finalContent || null,
                },
                finish_reason: lastValidChunk.choices?.[0]?.finish_reason || 'stop',
            },
        ],
    };

    // Add tool calls if present
    if (toolCalls.length > 0) {
        response.choices[0].message.tool_calls = toolCalls;
    }

    // Preserve usage info if available
    if (lastValidChunk.usage) {
        response.usage = lastValidChunk.usage;
    }

    return response;
}

/**
 * Merge streaming tool calls (delta format) into accumulated tool calls.
 * Handles incremental tool call construction in streaming responses.
 */
function mergeToolCalls(existing: any[], delta: any[]): any[] {
    const merged = [...existing];

    for (const deltaCall of delta) {
        const index = deltaCall.index ?? merged.length;

        if (!merged[index]) {
            merged[index] = {
                id: deltaCall.id || '',
                type: deltaCall.type || 'function',
                function: {
                    name: deltaCall.function?.name || '',
                    arguments: deltaCall.function?.arguments || '',
                },
            };
        } else {
            // Append to existing tool call
            if (deltaCall.id) merged[index].id = deltaCall.id;
            if (deltaCall.function?.name) {
                merged[index].function.name += deltaCall.function.name;
            }
            if (deltaCall.function?.arguments) {
                merged[index].function.arguments += deltaCall.function.arguments;
            }
        }
    }

    return merged;
}
