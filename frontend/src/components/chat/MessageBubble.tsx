'use client';

import { Message } from '@/types';

interface MessageBubbleProps {
  message: Message;
}

// Split content on markdown image syntax ![alt](url) so images render inline
function renderContent(content: string) {
  const parts = content.split(/(!\[[^\]]*\]\([^)]+\))/g);
  return parts.map((part, i) => {
    const imageMatch = part.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (imageMatch) {
      return (
        <a key={i} href={imageMatch[2]} target="_blank" rel="noopener noreferrer">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageMatch[2]}
            alt={imageMatch[1] || 'Generated image'}
            className="rounded-lg max-w-full my-2 border border-dark-4"
          />
        </a>
      );
    }
    return part ? <span key={i}>{part}</span> : null;
  });
}

export default function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const timestamp = new Date(message.created_at).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
          isUser
            ? 'bg-omnii-600 text-white rounded-br-md'
            : 'bg-dark-3 text-surface-200 border border-dark-4 rounded-bl-md'
        }`}
      >
        <p className="text-sm whitespace-pre-wrap leading-relaxed">{renderContent(message.content)}</p>
        <p
          className={`text-[10px] mt-1.5 ${
            isUser ? 'text-omnii-200/70' : 'text-surface-600'
          }`}
        >
          {timestamp}
        </p>
      </div>
    </div>
  );
}
