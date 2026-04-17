import { useState, useCallback, useEffect, useRef } from 'react';
import { sendChat } from '../api';

// "변지환" → "지환님", "남궁민수" → "민수님" (assumes Korean naming).
function toFirstName(name) {
  if (!name) return '사용자';
  const s = String(name).trim();
  if (s.length >= 3) return s.slice(-2);   // 3+ chars → last two
  return s;
}

function greeting(name) {
  return `안녕하세요, ${toFirstName(name)}님! 재테크 AI 어시스턴트입니다. 자산이나 지출에 대해 물어보세요.`;
}

function extractError(e) {
  // axios error → backend returned HTTPException(status, {error, message, hint})
  const detail = e.response?.data?.detail;
  if (detail && typeof detail === 'object') {
    const parts = [];
    if (detail.error) parts.push(`[${detail.error}]`);
    if (detail.message) parts.push(detail.message);
    if (detail.hint) parts.push(`\n💡 ${detail.hint}`);
    return parts.join(' ');
  }
  if (typeof detail === 'string') return detail;
  if (e.code === 'ECONNABORTED') {
    return '응답이 너무 오래 걸립니다 (타임아웃). 에이전트가 아직 생각 중일 수 있으니 잠시 후 재시도해 주세요.';
  }
  return e.message || String(e);
}

export function useChat(userId, onAfterReply, userName) {
  const [messages, setMessages] = useState(() => [
    { role: 'agent', text: greeting(userName) },
  ]);
  const [loading, setLoading] = useState(false);
  const userMessagedRef = useRef(false);

  // keep the intro message in sync with the DB-sourced name — but only
  // while the user hasn't sent anything yet. Otherwise we'd rewrite chat
  // history on every profile update, which is surprising.
  useEffect(() => {
    if (userMessagedRef.current) return;
    setMessages((cur) => {
      if (cur.length !== 1 || cur[0].role !== 'agent') return cur;
      return [{ role: 'agent', text: greeting(userName) }];
    });
  }, [userName]);

  const send = useCallback(async (text) => {
    const trimmed = (text || '').trim();
    if (!trimmed || loading) return;

    userMessagedRef.current = true;
    setMessages((m) => [...m, { role: 'user', text: trimmed }]);
    setLoading(true);
    try {
      const { data } = await sendChat(userId, trimmed);
      setMessages((m) => [...m, {
        role: 'agent',
        text: data.reply,
        action: data.action,
      }]);
      if (onAfterReply) onAfterReply();
    } catch (e) {
      setMessages((m) => [...m, {
        role: 'agent',
        text: `(오류) ${extractError(e)}`,
        isError: true,
      }]);
    } finally {
      setLoading(false);
    }
  }, [userId, loading, onAfterReply]);

  return { messages, send, loading };
}
