import { useEffect, useRef, useState } from 'react';
import { api } from '../../api';
import { PieChart } from '../../components/ReportCharts';

const STARTERS = [
  'Show this week sales as a pie chart',
  'Read this receipt and list what to restock',
  'What drinks should we push today?',
  'How can we cut food cost at U Coffee?',
];

const MAX_ATTACH = 4;
const MAX_EDGE = 1280;
const JPEG_QUALITY = 0.72;

function AttachIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        d="M8 12.5V7a4 4 0 0 1 8 0v9a5 5 0 0 1-10 0V8.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.readAsDataURL(file);
  });
}

function compressImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Could not process image'));
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', JPEG_QUALITY));
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Could not open image'));
    };
    img.src = objectUrl;
  });
}

async function fileToAttachment(file) {
  if (!file.type.startsWith('image/')) {
    throw new Error('Only image attachments are supported (receipt / restock photos).');
  }
  if (file.size > 12 * 1024 * 1024) {
    throw new Error('Image is too large (max 12MB).');
  }
  const url = file.type === 'image/gif' ? await readFileAsDataUrl(file) : await compressImage(file);
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: file.name || 'photo.jpg',
    url,
  };
}

function toApiMessages(messages) {
  return messages.map((m) => ({
    role: m.role,
    content: m.content || '',
    images: (m.images || []).map((img) => ({ url: img.url })),
  }));
}

/** Split assistant text into prose + optional chart JSON blocks. */
function parseAssistantContent(raw) {
  const text = String(raw || '');
  const charts = [];
  const cleaned = text.replace(/```(?:chart|json)\s*([\s\S]*?)```/gi, (_, body) => {
    try {
      const data = JSON.parse(String(body).trim());
      if (data && data.type === 'pie' && Array.isArray(data.slices)) {
        charts.push({
          type: 'pie',
          title: data.title || 'Pie chart',
          unit: data.unit || 'MYR',
          slices: data.slices,
        });
        return '';
      }
    } catch {
      /* keep original fence if invalid */
      return _;
    }
    return _;
  });
  return { text: cleaned.replace(/\n{3,}/g, '\n\n').trim(), charts };
}

function AssistantMessage({ content }) {
  const { text, charts } = parseAssistantContent(content);
  return (
    <>
      {charts.map((c, i) => (
        <PieChart key={`${c.title}-${i}`} title={c.title} unit={c.unit} slices={c.slices} />
      ))}
      {text ? <div className="pos-chat-text">{text}</div> : null}
    </>
  );
}

export default function ChatGptPage() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const fileRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, sending, attachments]);

  async function onPickFiles(e) {
    const files = [...(e.target.files || [])];
    e.target.value = '';
    if (!files.length) return;

    setError('');
    try {
      const room = MAX_ATTACH - attachments.length;
      if (room <= 0) {
        setError(`You can attach up to ${MAX_ATTACH} photos.`);
        return;
      }
      const next = [];
      for (const file of files.slice(0, room)) {
        next.push(await fileToAttachment(file));
      }
      setAttachments((prev) => [...prev, ...next].slice(0, MAX_ATTACH));
    } catch (err) {
      setError(err.message || 'Could not attach file');
    }
  }

  function removeAttachment(id) {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }

  async function send(text) {
    const content = String(text || '').trim();
    const images = attachments;
    if ((!content && !images.length) || sending) return;

    const userMsg = {
      role: 'user',
      content:
        content ||
        (images.length ? 'Please read this restock / purchase receipt and list what was bought.' : ''),
      images,
    };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput('');
    setAttachments([]);
    setSending(true);
    setError('');

    try {
      const data = await api.posChat(toApiMessages(next));
      setMessages((prev) => [...prev, { role: 'assistant', content: data.reply }]);
    } catch (err) {
      setError(err.message || 'Chat failed');
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  function onSubmit(e) {
    e.preventDefault();
    send(input);
  }

  const canSend = !sending && (Boolean(input.trim()) || attachments.length > 0);

  return (
    <div className="pos-chat">
      <div className="pos-page-head">
        <h1>Chat GPT</h1>
      </div>

      {error && <div className="pos-alert error">{error}</div>}

      <div className="pos-card pos-chat-panel">
        <div className="pos-chat-thread" aria-live="polite">
          {messages.length === 0 && !sending && (
            <div className="pos-chat-empty">
              <p>
                Ask about U Coffee, request a pie chart, or attach a restock / receipt photo.
              </p>
              <div className="pos-chat-starters">
                {STARTERS.map((q) => (
                  <button
                    key={q}
                    type="button"
                    className="pos-btn ghost"
                    onClick={() => (q.includes('receipt') ? fileRef.current?.click() : send(q))}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={`${m.role}-${i}`} className={`pos-chat-bubble ${m.role}`}>
              <span className="pos-chat-role">{m.role === 'user' ? 'You' : 'U Coffee AI'}</span>
              {m.images?.length > 0 && (
                <div className="pos-chat-thumbs">
                  {m.images.map((img) => (
                    <img key={img.id || img.url} src={img.url} alt={img.name || 'Attachment'} />
                  ))}
                </div>
              )}
              {m.role === 'assistant' ? (
                m.content ? <AssistantMessage content={m.content} /> : null
              ) : m.content ? (
                <div className="pos-chat-text">{m.content}</div>
              ) : null}
            </div>
          ))}

          {sending && (
            <div className="pos-chat-bubble assistant">
              <span className="pos-chat-role">U Coffee AI</span>
              <div className="pos-chat-text pos-chat-typing">Reading…</div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {attachments.length > 0 && (
          <div className="pos-chat-attach-preview">
            {attachments.map((a) => (
              <div key={a.id} className="pos-chat-attach-item">
                <img src={a.url} alt={a.name} />
                <button
                  type="button"
                  className="pos-chat-attach-remove"
                  aria-label={`Remove ${a.name}`}
                  onClick={() => removeAttachment(a.id)}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        <form className="pos-chat-composer" onSubmit={onSubmit}>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            capture="environment"
            hidden
            onChange={onPickFiles}
          />
          <button
            type="button"
            className="pos-icon-btn"
            aria-label="Attach restock or receipt photo"
            disabled={sending || attachments.length >= MAX_ATTACH}
            onClick={() => fileRef.current?.click()}
            title="Attach receipt / restock photo"
          >
            <AttachIcon />
          </button>
          <input
            ref={inputRef}
            className="pos-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask, or attach a receipt photo…"
            disabled={sending}
            autoComplete="off"
          />
          <button type="submit" className="pos-btn primary" disabled={!canSend}>
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
