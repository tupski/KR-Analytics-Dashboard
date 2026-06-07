'use client'

import { useState, useEffect, useMemo } from 'react'
import { ChevronDown, Check } from 'lucide-react'
import { sanitizeThinkingStep } from '@/lib/ai/normalizeAiText'

interface KraiThinkingStepsProps {
  steps: string[]
  isStreaming: boolean
  isComplete?: boolean
  maxPreviewLines?: number
}

export function KraiThinkingSteps({
  steps,
  isStreaming,
  isComplete,
  maxPreviewLines = 5
}: KraiThinkingStepsProps) {
  const [isExpanded, setIsExpanded] = useState(true)

  // Filter out raw model reasoning (English chain-of-thought)
  const sanitizedSteps = useMemo(
    () => steps.map(s => sanitizeThinkingStep(s)).filter(Boolean) as string[],
    [steps],
  )

  // Auto-expand while streaming, collapse when complete
  useEffect(() => {
    if (isStreaming) setIsExpanded(true)
    if (isComplete && steps.length > 0) setIsExpanded(false)
  }, [isStreaming, isComplete, steps.length])

  if (!sanitizedSteps.length && !isStreaming) return null

  const displaySteps = isExpanded ? sanitizedSteps : sanitizedSteps.slice(0, maxPreviewLines)
  const hasMore = sanitizedSteps.length > maxPreviewLines

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
      </button>

      {isExpanded && (
        <div className="max-h-48 overflow-y-auto space-y-1 px-3 pb-2">
          {displaySteps.map((step, i) => (
            <div
              key={i}
              className={`flex gap-2 ${isStreaming && i === sanitizedSteps.length - 1 ? 'animate-fade-in' : ''}`}
            >
              <span className="text-gray-400 shrink-0 text-xs w-4 text-right">{i + 1}.</span>
              <p className="text-xs text-gray-600 leading-relaxed">{step}</p>
            </div>
          ))}
          {hasMore && !isExpanded && (
            <button
              onClick={() => setIsExpanded(true)}
              className="text-xs text-blue-600 hover:text-blue-700 font-medium"
            >
              Lihat semua langkah ({sanitizedSteps.length})
            </button>
          )}
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
}
