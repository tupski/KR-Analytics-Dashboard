import { redirect } from 'next/navigation';

/**
 * /analytics-ai/chat → redirected to /chat for cleaner URL.
 */
export default function OldChatPage() {
    redirect('/chat');
}
