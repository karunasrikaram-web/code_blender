import type { CSSProperties, KeyboardEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import PageHeader from '../components/ui/PageHeader';
import { supabase } from '../lib/supabase';

type Role = 'user' | 'assistant';

interface ChatMessage {
  id: number;
  role: Role;
  text: string;
}

interface HistoryTurn {
  role: Role;
  text: string;
}

const HISTORY_TURNS = 10;
const ERROR_TEXT = 'The assistant could not answer. Please try again.';
const DRAFT_TEXT = 'Draft a polite payment reminder for [customer name] about invoice [invoice number]';

const SUGGESTED_QUESTIONS = [
  'Who owes me money right now?',
  'Which invoices are overdue?',
  'How much money am I expected to receive this month?',
  'What are my upcoming expenses?',
  'Will I have enough money next month?',
  'Which customers should I follow up with today?',
  'What happens if my biggest customer pays 15 days late?',
  'How can I improve my cash flow?',
];

const mutedStyle: CSSProperties = {
  color: 'var(--color-muted)',
  fontSize: 'var(--font-size-sm)',
  margin: 'var(--space-1) 0 0',
};

const secondaryButtonStyle: CSSProperties = {
  padding: 'var(--space-2) var(--space-3)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-md)',
  background: 'var(--color-card)',
  color: 'inherit',
  cursor: 'pointer',
  fontSize: 'var(--font-size-sm)',
};

const bubbleBase: CSSProperties = {
  maxWidth: '80%',
  padding: 'var(--space-3) var(--space-4)',
  borderRadius: 'var(--radius-md)',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
};

const userBubbleStyle: CSSProperties = {
  ...bubbleBase,
  background: 'var(--color-primary)',
  color: '#fff',
};

const assistantBubbleStyle: CSSProperties = {
  ...bubbleBase,
  background: 'var(--color-card)',
  border: '1px solid var(--color-border)',
};

export default function AiAssistantPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const nextId = useRef(1);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, loading]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const history: HistoryTurn[] = messages
      .slice(-HISTORY_TURNS)
      .map((m) => ({ role: m.role, text: m.text }));

    const userMessage: ChatMessage = { id: nextId.current++, role: 'user', text: trimmed };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    let reply = ERROR_TEXT;
    try {
      const { data, error } = await supabase.functions.invoke('financial-assistant', {
        body: { message: trimmed, history },
      });
      const replyText = (data as { reply?: unknown } | null)?.reply;
      if (!error && typeof replyText === 'string' && replyText.trim() !== '') {
        reply = replyText;
      }
    } catch {
      reply = ERROR_TEXT;
    }

    const assistantMessage: ChatMessage = { id: nextId.current++, role: 'assistant', text: reply };
    setMessages((prev) => [...prev, assistantMessage]);
    setLoading(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void send(input);
    }
  }

  async function copyReply(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard may be unavailable (permissions or insecure context); nothing else to show.
    }
  }

  function clearConversation() {
    setMessages([]);
  }

  const isEmpty = messages.length === 0;
  const canSend = !loading && input.trim() !== '';

  return (
    <div>
      <PageHeader
        title="AI Financial Assistant"
        description="Answers use your recorded invoices, payments and expenses. These are estimates, not guaranteed financial advice."
      />

      <section
        className="card"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-4)',
          width: '100%',
          boxSizing: 'border-box',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 'var(--space-2)',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <button
            type="button"
            style={secondaryButtonStyle}
            onClick={() => setInput(DRAFT_TEXT)}
          >
            Draft a payment reminder
          </button>
          <button
            type="button"
            style={secondaryButtonStyle}
            onClick={clearConversation}
            disabled={isEmpty && !loading}
          >
            Clear conversation
          </button>
        </div>

        {isEmpty && (
          <div>
            <p style={mutedStyle}>Try a suggested question:</p>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 'var(--space-2)',
                marginTop: 'var(--space-2)',
              }}
            >
              {SUGGESTED_QUESTIONS.map((question) => (
                <button
                  key={question}
                  type="button"
                  style={secondaryButtonStyle}
                  onClick={() => void send(question)}
                  disabled={loading}
                >
                  {question}
                </button>
              ))}
            </div>
          </div>
        )}

        <div
          role="log"
          aria-live="polite"
          aria-label="Conversation"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-3)',
            minHeight: 240,
            maxHeight: '55vh',
            overflowY: 'auto',
            padding: 'var(--space-2)',
          }}
        >
          {messages.map((message) => {
            const isUser = message.role === 'user';
            return (
              <div
                key={message.id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: isUser ? 'flex-end' : 'flex-start',
                }}
              >
                <div style={isUser ? userBubbleStyle : assistantBubbleStyle}>{message.text}</div>
                {!isUser && (
                  <button
                    type="button"
                    onClick={() => void copyReply(message.text)}
                    style={{
                      ...secondaryButtonStyle,
                      marginTop: 'var(--space-1)',
                      padding: 'var(--space-1) var(--space-2)',
                    }}
                  >
                    Copy
                  </button>
                )}
              </div>
            );
          })}

          {loading && (
            <div style={{ display: 'flex', justifyContent: 'flex-start' }} aria-busy="true">
              <div style={assistantBubbleStyle}>Thinking…</div>
            </div>
          )}

          <div ref={endRef} />
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            void send(input);
          }}
          style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'flex-end' }}
        >
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleKeyDown}
            rows={2}
            aria-label="Message the assistant"
            placeholder="Ask about your invoices, payments or expenses…"
            style={{
              flex: 1,
              minWidth: 0,
              resize: 'vertical',
              padding: 'var(--space-2) var(--space-3)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              font: 'inherit',
              boxSizing: 'border-box',
            }}
          />
          <button
            type="submit"
            disabled={!canSend}
            style={{
              padding: 'var(--space-2) var(--space-4)',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              background: 'var(--color-primary)',
              color: '#fff',
              fontWeight: 600,
              cursor: canSend ? 'pointer' : 'not-allowed',
              opacity: canSend ? 1 : 0.5,
            }}
          >
            Send
          </button>
        </form>
      </section>
    </div>
  );
}
