import { useCallback, useEffect, useRef, useState } from 'react';
import { getDashboard } from '../api';

export function useDashboard(userId, intervalMs = 5000) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const inFlight = useRef(false);

  const fetchNow = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const res = await getDashboard(userId);
      setData(res.data);
      setError(null);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      inFlight.current = false;
    }
  }, [userId]);

  useEffect(() => {
    fetchNow();
    const id = setInterval(fetchNow, intervalMs);
    return () => clearInterval(id);
  }, [fetchNow, intervalMs]);

  return { data, error, refresh: fetchNow };
}
