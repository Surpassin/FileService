'use client';

import { Message } from '@/types';

interface MessageBubbleProps {
  message: Message;
}

// Renders a self-contained HTML document (e.g. a contract review) in a
// sandboxed frame with a download button
function ReviewDocument({ html }: { html: string }) {
  const dateStamp = new Date().toISOString().slice(0, 10);

  // Word opens HTML documents natively; the Office XML hint sets print layout
  const downloadWord = () => {
    const wordHtml = html.replace(
      /<head>/i,
      '<head><xml><w:WordDocument xmlns:w="urn:schemas-microsoft-com:office:word"><w:View>Print</w:View></w:WordDocument></xml>'
    );
    const blob = new Blob(['\ufeff', wordHtml], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Contract Review ${dateStamp}.doc`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Opens the review in a print dialog — choose "Save as PDF" as the destination
  const downloadPdf = () => {
    const w = window.open('', '_blank');
    if (!w) {
      alert('Please allow pop-ups for this site to save as PDF.');
      return;
    }
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 600);
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
      <div className="flex gap-2 mt-2">
        <button onClick={downloadWord} className="btn-primary text-xs px-3 py-1.5" type="button">
          ⬇ Download as Word
        </button>
        <button onClick={downloadPdf} className="btn-primary text-xs px-3 py-1.5" type="button">
          ⬇ Save as PDF
        </button>
      </div>
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
  // Full HTML documents (e.g. contract reviews) arrive between these markers.
  // If the closing marker was cut off, render from the open marker to the end
  // so a truncated review still displays as a document rather than raw code.
  const openIdx = content.indexOf('[REVIEW_HTML]');
  if (openIdx !== -1) {
    const closeIdx = content.indexOf('[/REVIEW_HTML]', openIdx);
    const before = content.slice(0, openIdx).trim();
    const html = closeIdx !== -1
      ? content.slice(openIdx + 13, closeIdx).trim()
      : content.slice(openIdx + 13).trim();
    const after = closeIdx !== -1 ? content.slice(closeIdx + 14).trim() : '';
    return (
      <>
        {before && <span>{before}</span>}
        <ReviewDocument html={html} />
        {closeIdx === -1 && (
          <span className="text-xs text-surface-500">
            ⚠ This review may have been cut short — ask the agent to continue or regenerate if the end is missing.
          </span>
        )}
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
