'use client'

import { useState, useMemo, memo } from 'react'
import { ChevronDown, Check } from 'lucide-react'
import { sanitizeThinkingStep } from '@/lib/ai/normalizeAiText'

interface KraiThinkingStepsProps {
  steps: string[]
  isStreaming: boolean
  isComplete?: boolean
  maxPreviewLines?: number
}

const MAX_VISIBLE_STEPS = 8

const KraiThinkingSteps = memo(function KraiThinkingSteps({
  steps,
  isStreaming,
  isComplete,
  maxPreviewLines = 2
}: KraiThinkingStepsProps) {
  // T6: Collapse by default during streaming
  const [isExpanded, setIsExpanded] = useState(false)

  // Filter out raw model reasoning (English chain-of-thought)
  const sanitizedSteps = useMemo(
    () => steps.map(s => sanitizeThinkingStep(s)).filter(Boolean) as string[],
    [steps],
  )

  if (!sanitizedSteps.length && !isStreaming) return null

  // T6: When collapsed, show count only (no raw reasoning text); when expanded, show last N
  const displaySteps = isExpanded
    ? sanitizedSteps.slice(-MAX_VISIBLE_STEPS)
    : []
  const hasMore = sanitizedSteps.length > MAX_VISIBLE_STEPS
  const showEarlierHint = isExpanded && hasMore && sanitizedSteps.length - MAX_VISIBLE_STEPS > 0

  return (
    <div className="bg-gray-50/50 border border-gray-100 rounded-lg overflow-hidden mb-2">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between gap-2 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100/50 transition-colors"
      >
        <div className="flex items-center gap-1.5">
          <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${isExpanded ? '' : '-rotate-90'}`} />
          <span>🧠 Langkah KRAI {sanitizedSteps.length > 0 && <span className="font-medium">({sanitizedSteps.length})</span>}</span>
        </div>
        {isComplete && !isStreaming && (
          <Check className="w-3 h-3 text-emerald-500" />
        )}
        {isStreaming && !isExpanded && (
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
        )}
      </button>

      {isExpanded && (
        <div className="max-h-48 overflow-y-auto space-y-1 px-3 pb-2">
          {showEarlierHint && (
            <p className="text-[10px] text-gray-400 italic">
              {sanitizedSteps.length - MAX_VISIBLE_STEPS} langkah sebelumnya disembunyikan
            </p>
          )}
          {displaySteps.map((step, i) => (
            <div
              key={i}
              className="flex gap-2"
            >
              <span className="text-gray-400 shrink-0 text-xs w-4 text-right">
                {sanitizedSteps.length - displaySteps.length + i + 1}.
              </span>
              {/* T6: Plain text only — no Markdown rendering for thinking steps */}
              <p className="text-xs text-gray-600 leading-relaxed">{step}</p>
            </div>
          ))}
          {isStreaming && (
            <div className="flex items-center gap-2 text-xs text-blue-500 pt-1">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
              <span>Sedang berpikir...</span>
            </div>
          )}
          {isComplete && !isStreaming && sanitizedSteps.length > 0 && (
            <div className="text-xs text-emerald-600 flex items-center gap-1 pt-1">
              <Check className="w-3 h-3" />
              Selesai berpikir
            </div>
          )}
        </div>
      )}
    </div>
  )
})

export { KraiThinkingSteps }
