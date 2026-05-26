import AIChatFullscreen from '@/components/ai/AIChatFullscreen';

interface Props {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ new?: string }>;
}

/**
 * /chat/[id] — individual conversation page.
 * The `id` is used to load/create the conversation from localStorage.
 * ?new=1 signals the client to create a fresh conversation with this id.
 */
export default async function ChatConversationPage({ params, searchParams }: Props) {
    const { id } = await params;
    const { new: isNew } = await searchParams;

    return (
        <div className="flex-1 overflow-hidden flex flex-col">
            <AIChatFullscreen conversationId={id} forceNew={isNew === '1'} />
        </div>
    );
}
