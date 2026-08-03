'use client';

import { Message } from '@/types';

interface MessageBubbleProps {
  message: Message;
}

// Renders a self-contained HTML document (e.g. a contract review) in a
// sandboxed frame with a download button
function ReviewDocument({ html }: { html: string }) {
  const downloadReview = () => {
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `contract-review-${new Date().toISOString().slice(0, 10)}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="my-2 w-full">
      <iframe
        srcDoc={html}
        sandbox=""
        title="Contract review document"
        className="w-full bg-white rounded-lg border border-dark-4"
        style={{ height: '65vh', minHeight: '400px' }}
      />
      <button
        onClick={downloadReview}
        className="btn-primary mt-2 text-xs px-3 py-1.5"
        type="button"
      >
        ⬇ Download review (open in browser to print or save as PDF)
      </button>
    </div>
  );
}

// Split content on markdown image syntax ![alt](url) so images render inline
function renderTextParts(content: string) {
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

function renderContent(content: string) {
  // Full HTML documents (e.g. contract reviews) arrive between these markers
  const reviewMatch = content.match(/\[REVIEW_HTML\]([\s\S]*?)\[\/REVIEW_HTML\]/);
  if (reviewMatch) {
    const before = content.slice(0, reviewMatch.index).trim();
    const after = content.slice((reviewMatch.index || 0) + reviewMatch[0].length).trim();
    return (
      <>
        {before && <span>{before}</span>}
        <ReviewDocument html={reviewMatch[1].trim()} />
        {after && <span>{after}</span>}
      </>
    );
  }
  return renderTextParts(content);
}

export default function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const timestamp = new Date(message.created_at).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
  const hasReview = !isUser && message.content.includes('[REVIEW_HTML]');

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`${hasReview ? 'w-[95%] max-w-[95%]' : 'max-w-[75%]'} rounded-2xl px-4 py-2.5 ${
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
