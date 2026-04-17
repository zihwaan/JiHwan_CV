import { useCallback, useEffect, useState } from 'react';
import { getAuthStatus } from '../api';

/**
 * Polls /api/auth/status.
 *
 * 두 가지 모드가 state 기반이라 useEffect가 모드 전환을 제대로 감지합니다.
 *
 *  - idle     : 평시 15초 간격 (이전 ref 기반 구현 버그 수정)
 *  - pending  : 로그인 버튼 클릭 직후 2초 간격, 2분간 유지
 */
export function useAuth({
  idleIntervalMs = 15000,
  pendingIntervalMs = 2000,
  pendingTimeoutMs = 120000,
} = {}) {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false);

  const fetchNow = useCallback(async () => {
    try {
      const { data } = await getAuthStatus();
      setStatus(data);
      setError(null);
      if (data.ready) setPending(false); // 연결되면 fast-poll 종료
      return data;
    } catch (e) {
      setError(e.message || String(e));
      return null;
    }
  }, []);

  // main polling loop — pending 이 바뀌면 setInterval이 재생성됨
  useEffect(() => {
    fetchNow();
    const interval = pending ? pendingIntervalMs : idleIntervalMs;
    const id = setInterval(fetchNow, interval);
    return () => clearInterval(id);
  }, [fetchNow, pending, idleIntervalMs, pendingIntervalMs]);

  // auto-stop pending after timeout (login 창 방치 방지)
  useEffect(() => {
    if (!pending) return;
    const id = setTimeout(() => setPending(false), pendingTimeoutMs);
    return () => clearTimeout(id);
  }, [pending, pendingTimeoutMs]);

  // 탭 포커스 돌아왔을 때 즉시 재확인 (유저가 터미널에서 로그인 후 복귀 시)
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') fetchNow();
    };
    const onFocus = () => fetchNow();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onFocus);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
    };
  }, [fetchNow]);

  const markLoginPending = useCallback(() => setPending(true), []);

  return { status, error, pending, refresh: fetchNow, markLoginPending };
}
