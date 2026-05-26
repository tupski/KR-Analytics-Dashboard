import AIChatFullscreen from '@/components/ai/AIChatFullscreen';

/**
 * Krai — Full-screen AI Chat page.
 * flex-1 + overflow-hidden fills the layout's scrollable container
 * without showing a scrollbar on the outer wrapper.
 */
export default function AIChatPage() {
    return (
        <div className="flex-1 overflow-hidden flex flex-col">
            <AIChatFullscreen />
        </div>
    );
}
