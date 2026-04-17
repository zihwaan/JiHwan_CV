import { useEffect, useRef, useState } from 'react';
import { COLORS } from '../theme';

// Very small Markdown-ish renderer for agent replies. Handles the 95% of
// cases the agent actually produces: **bold**, *italic*, `code`, bullet/
// numbered lists, paragraph breaks. Not a full parser — deliberately
// minimal so we don't ship 20KB of react-markdown + micromark for this.
function InlineFormat({ text }) {
  // tokenize **bold**, *italic*, `code` in one pass
  const parts = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let last = 0;
  let m;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith('**'))      parts.push(<strong key={i}>{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith('`'))  parts.push(<code key={i} style={{ background: '#eef2fb', padding: '0 4px', borderRadius: 3 }}>{tok.slice(1, -1)}</code>);
    else                           parts.push(<em key={i}>{tok.slice(1, -1)}</em>);
    i += 1;
    last = m.index + tok.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

function Markdown({ text }) {
  const lines = (text || '').split('\n');
  const blocks = [];
  let listBuf = null; // { type: 'ul'|'ol', items: [] }
  let paraBuf = [];

  const flushPara = () => {
    if (paraBuf.length) {
      blocks.push({ kind: 'p', text: paraBuf.join('\n') });
      paraBuf = [];
    }
  };
  const flushList = () => {
    if (listBuf) { blocks.push(listBuf); listBuf = null; }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const mUl = line.match(/^\s*[-*]\s+(.*)$/);
    const mOl = line.match(/^\s*(\d+)\.\s+(.*)$/);
    if (mUl) {
      flushPara();
      if (!listBuf || listBuf.type !== 'ul') { flushList(); listBuf = { type: 'ul', items: [] }; }
      listBuf.items.push(mUl[1]);
    } else if (mOl) {
      flushPara();
      if (!listBuf || listBuf.type !== 'ol') { flushList(); listBuf = { type: 'ol', items: [] }; }
      listBuf.items.push(mOl[2]);
    } else if (line === '') {
      flushList();
      flushPara();
    } else {
      flushList();
      paraBuf.push(line);
    }
  }
  flushList();
  flushPara();

  return (
    <>
      {blocks.map((b, i) => {
        if (b.kind === 'p') {
          return <p key={i} className="m-0 whitespace-pre-wrap leading-relaxed">
            <InlineFormat text={b.text} />
          </p>;
        }
        const Tag = b.type === 'ol' ? 'ol' : 'ul';
        return (
          <Tag key={i} className={`m-0 pl-5 ${b.type === 'ol' ? 'list-decimal' : 'list-disc'}`}>
            {b.items.map((it, j) => (
              <li key={j} className="leading-relaxed"><InlineFormat text={it} /></li>
            ))}
          </Tag>
        );
      })}
    </>
  );
}

function MessageBubble({ m }) {
  if (m.role === 'user') {
    return (
      <div className="flex justify-end">
        <div
          className="max-w-[85%] rounded-2xl px-4 py-2.5 text-sm shadow-card"
          style={{
            background: `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.primaryLight})`,
            color: COLORS.onPrimary,
            borderBottomRightRadius: 6,
          }}
        >
          {m.text}
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2 max-w-[92%]">
      <div
        className="rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-card flex flex-col gap-2"
        style={{
          background: COLORS.card,
          border: `1px solid ${m.isError ? COLORS.red : COLORS.border}`,
          color: m.isError ? COLORS.red : COLORS.text,
          borderBottomLeftRadius: 6,
        }}
      >
        {m.isError
          ? <span className="whitespace-pre-wrap">{m.text}</span>
          : <Markdown text={m.text} />}
      </div>
      {m.action && (
        <div
          className="self-start rounded-full px-3 py-1 text-xs font-semibold flex items-center gap-1.5"
          style={{
            background: COLORS.greenSoft,
            color: COLORS.green,
            border: `1px solid ${COLORS.green}33`,
          }}
          title={m.action.result}
        >
          <span style={{ fontSize: 10 }}>●</span>
          DB 업데이트 — {m.action.type}
        </div>
      )}
    </div>
  );
}

export default function AgentChat({ messages, onSend, loading, disabled, open, onClose }) {
  const [input, setInput] = useState('');
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const submit = () => {
    const v = input.trim();
    if (!v || loading || disabled) return;
    onSend(v);
    setInput('');
  };

  const onKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  // mobile: full-screen overlay when `open` is true, hidden otherwise
  // desktop (md+): always visible sidebar, 400px wide
  const mobileClasses = open
    ? 'fixed inset-0 z-40 flex'
    : 'hidden';
  return (
    <aside
      className={`${mobileClasses} md:relative md:flex md:inset-auto md:z-auto md:w-[400px] flex-col shrink-0`}
      style={{
        borderLeft: `1px solid ${COLORS.border}`,
        background: COLORS.card,
      }}
    >
      {/* header */}
      <div
        className="px-5 py-4 flex items-center gap-3"
        style={{
          borderBottom: `1px solid ${COLORS.border}`,
          background: `linear-gradient(135deg, ${COLORS.primaryDark}, ${COLORS.primary})`,
        }}
      >
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center text-lg font-bold shadow-card shrink-0"
          style={{ background: COLORS.onPrimary, color: COLORS.primary }}
        >
          W
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold" style={{ color: COLORS.onPrimary }}>
            재테크 AI 어시스턴트
          </div>
          <div className="flex gap-1.5 mt-1 flex-wrap">
            <span
              className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
              style={{ background: 'rgba(255,255,255,0.2)', color: COLORS.onPrimary }}
            >
              Rule-based
            </span>
            <span
              className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
              style={{ background: 'rgba(255,255,255,0.2)', color: COLORS.onPrimary }}
            >
              RAG 연동
            </span>
          </div>
        </div>
        {/* mobile close button */}
        <button
          onClick={onClose}
          className="md:hidden w-9 h-9 rounded-lg flex items-center justify-center text-xl font-bold transition-colors shrink-0"
          style={{ background: 'rgba(255,255,255,0.15)', color: COLORS.onPrimary }}
          aria-label="채팅 닫기"
        >
          ×
        </button>
      </div>

      {/* messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 flex flex-col gap-3"
        style={{ background: COLORS.bg }}
      >
        {messages.map((m, i) => <MessageBubble key={i} m={m} />)}
        {loading && (
          <div
            className="self-start rounded-2xl px-4 py-3 shadow-card"
            style={{
              background: COLORS.card,
              border: `1px solid ${COLORS.border}`,
              borderBottomLeftRadius: 6,
            }}
          >
            <span className="dot" style={{ color: COLORS.primary, fontSize: 10 }}>●</span>
            <span className="dot ml-1" style={{ color: COLORS.primary, fontSize: 10 }}>●</span>
            <span className="dot ml-1" style={{ color: COLORS.primary, fontSize: 10 }}>●</span>
          </div>
        )}
      </div>

      {/* input */}
      <div
        className="p-3 flex gap-2 shrink-0"
        style={{
          borderTop: `1px solid ${COLORS.border}`,
          background: COLORS.card,
          paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))',
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKey}
          disabled={loading || disabled}
          placeholder={disabled
            ? 'Claude 계정으로 로그인 후 사용 가능'
            : '예: 이번달 식비 42만원 썼어'}
          className="flex-1 rounded-lg px-3 py-2.5 text-sm outline-none disabled:opacity-50 transition-all min-w-0"
          style={{
            background: COLORS.bg,
            border: `1px solid ${COLORS.border}`,
            color: COLORS.text,
          }}
          onFocus={(e) => {
            e.target.style.borderColor = COLORS.primary;
            e.target.style.boxShadow = `0 0 0 3px ${COLORS.primary}22`;
          }}
          onBlur={(e) => {
            e.target.style.borderColor = COLORS.border;
            e.target.style.boxShadow = 'none';
          }}
        />
        <button
          onClick={submit}
          disabled={loading || disabled || !input.trim()}
          className="rounded-lg px-4 sm:px-5 py-2.5 text-sm font-bold disabled:opacity-40 transition-all shrink-0"
          style={{
            background: `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.primaryLight})`,
            color: COLORS.onPrimary,
            boxShadow: '0 2px 8px rgba(20,40,160,0.25)',
          }}
        >
          전송
        </button>
      </div>
    </aside>
  );
}
