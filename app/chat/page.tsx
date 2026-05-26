import { redirect } from 'next/navigation';

/**
 * /chat — redirects to a brand new conversation.
 * The actual chat page lives at /chat/[id].
 * We generate the ID server-side so the URL is stable from first load.
 */
export default function ChatIndexPage() {
    // Generate a random conversation ID and redirect.
    // crypto.randomUUID() is available in Node 19+ and Edge runtime.
    const newId = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
    redirect(`/chat/${newId}?new=1`);
}
