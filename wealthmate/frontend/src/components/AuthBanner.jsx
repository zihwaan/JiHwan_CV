import { useCallback, useEffect, useState } from 'react';
import { COLORS } from '../theme';
import { listKeys, createKey, activateKey, deleteKey } from '../api';

/**
 * Agent connection banner — API-key-only.
 *
 * - No keys saved yet → inline "add key" form only.
 * - Keys saved, one is active, status.ready=true → thin green confirmation
 *   strip with a "Manage" button that reveals the key picker.
 * - Keys saved but none active (user deleted the active one, etc.) → list
 *   with activate buttons.
 *
 * Every key lives server-side in backend/.keys.json; we never fetch the
 * plaintext — just a masked preview.
 */
export default function AuthBanner({ status, onRefresh }) {
  const [keys, setKeys] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState(null);

  // add-key form state
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newKey, setNewKey] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [addError, setAddError] = useState(null);

  const fetchKeys = useCallback(async () => {
    try {
      const { data } = await listKeys();
      setKeys(data.keys || []);
      setActiveId(data.active_id);
      setError(null);
    } catch (e) {
      setError(e?.response?.data?.detail || e.message || 'API Key 목록 조회 실패');
    }
  }, []);

  useEffect(() => { fetchKeys(); }, [fetchKeys]);

  // show the add form automatically when no keys exist
  useEffect(() => {
    if (status && !status.ready && keys.length === 0) {
      setShowAdd(true);
      setExpanded(true);
    }
  }, [status, keys.length]);

  if (!status) return null;

  const submitAdd = async (e) => {
    e?.preventDefault?.();
    const name = newName.trim();
    const key = newKey.trim();
    if (!name || !key || submitting) return;
    setSubmitting(true);
    setAddError(null);
    try {
      await createKey(name, key, true);
      setNewName('');
      setNewKey('');
      setShowAdd(false);
      await fetchKeys();
      await onRefresh?.();
    } catch (err) {
      const d = err?.response?.data?.detail || err?.response?.data;
      setAddError(d?.hint || d?.detail || d?.reason || err.message || 'API Key 저장 실패');
    } finally {
      setSubmitting(false);
    }
  };

  const handleActivate = async (id) => {
    if (busyId) return;
    setBusyId(id);
    try {
      await activateKey(id);
      await fetchKeys();
      await onRefresh?.();
    } catch (err) {
      setError(err.message || 'API Key 활성화 실패');
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (id, name) => {
    if (busyId) return;
    if (!window.confirm(`'${name}' 키를 삭제할까요? 활성화된 키라면 연결이 끊깁니다.`)) return;
    setBusyId(id);
    try {
      await deleteKey(id);
      await fetchKeys();
      await onRefresh?.();
    } catch (err) {
      setError(err.message || 'API Key 삭제 실패');
    } finally {
      setBusyId(null);
    }
  };

  // ─── READY, collapsed ───
  if (status.ready && !expanded) {
    return (
      <div
        className="px-4 py-2 text-xs flex items-center justify-between flex-wrap gap-2"
        style={{
          background: COLORS.greenSoft,
          color: COLORS.green,
          borderBottom: `1px solid ${COLORS.green}33`,
        }}
      >
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: COLORS.green }} />
          <span className="font-semibold">에이전트 연결 정상</span>
          <span style={{ color: COLORS.textSecondary }}>
            · 활성 키: {status.active_name || '(unknown)'}
          </span>
        </div>
        <button
          onClick={() => setExpanded(true)}
          className="text-xs px-2 py-1 rounded font-semibold"
          style={{ background: 'transparent', color: COLORS.green, border: `1px solid ${COLORS.green}55` }}
        >
          키 관리
        </button>
      </div>
    );
  }

  // ─── FULL banner ───
  return (
    <div
      className="px-4 md:px-5 py-3"
      style={{
        background: status.ready ? COLORS.greenSoft : `linear-gradient(90deg, ${COLORS.primarySoft}, ${COLORS.accentSoft})`,
        borderBottom: `1px solid ${COLORS.borderStrong}`,
      }}
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold shrink-0"
            style={{
              background: status.ready ? COLORS.green : COLORS.primary,
              color: COLORS.onPrimary,
            }}
          >
            {status.ready ? '✓' : '!'}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold" style={{ color: COLORS.text }}>
              {status.ready
                ? `에이전트 연결됨 — 활성 키: ${status.active_name || ''}`
                : '에이전트 사용을 위해 Anthropic API Key 가 필요합니다'}
            </div>
            <div className="text-xs mt-0.5" style={{ color: COLORS.textSecondary }}>
              <a
                href="https://console.anthropic.com/settings/keys"
                target="_blank"
                rel="noreferrer"
                className="underline font-semibold"
                style={{ color: COLORS.primary }}
              >
                console.anthropic.com/settings/keys
              </a>
              {' '}에서 API 키를 발급받아 이름과 함께 저장하세요. 키는 서버의{' '}
              <code className="text-[11px]">backend/.keys.json</code> (mode 0600)에 저장되며, 한 번에 하나만 활성화됩니다.
            </div>

            {/* saved keys list */}
            {keys.length > 0 && (
              <div className="mt-3 flex flex-col gap-1.5">
                {keys.map((k) => {
                  const isActive = k.id === activeId;
                  return (
                    <div
                      key={k.id}
                      className="flex items-center justify-between gap-2 px-3 py-2 rounded text-xs"
                      style={{
                        background: isActive ? COLORS.greenSoft : COLORS.card,
                        border: `1px solid ${isActive ? COLORS.green : COLORS.border}`,
                      }}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <input
                          type="radio"
                          name="active-key"
                          checked={isActive}
                          disabled={busyId === k.id}
                          onChange={() => handleActivate(k.id)}
                        />
                        <span className="font-bold truncate" style={{ color: COLORS.text }}>
                          {k.name}
                        </span>
                        <span className="font-mono-num opacity-70" style={{ color: COLORS.subtext }}>
                          {k.masked}
                        </span>
                        {isActive && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                                style={{ background: COLORS.green, color: COLORS.onPrimary }}>
                            ACTIVE
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => handleDelete(k.id, k.name)}
                        disabled={busyId === k.id}
                        className="text-[11px] px-2 py-1 rounded font-semibold disabled:opacity-50"
                        style={{
                          background: 'transparent',
                          color: COLORS.red,
                          border: `1px solid ${COLORS.red}55`,
                        }}
                      >
                        삭제
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* add key form */}
            {showAdd ? (
              <form onSubmit={submitAdd} className="mt-3 flex items-center gap-2 flex-wrap">
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="이름 (예: personal)"
                  autoComplete="off"
                  spellCheck={false}
                  className="text-xs px-2 py-1.5 rounded w-36"
                  style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, color: COLORS.text }}
                  disabled={submitting}
                />
                <input
                  type="password"
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                  placeholder="sk-ant-api03-..."
                  autoComplete="off"
                  spellCheck={false}
                  className="text-xs px-2 py-1.5 rounded flex-1 min-w-[240px] font-mono-num"
                  style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, color: COLORS.text }}
                  disabled={submitting}
                />
                <button
                  type="submit"
                  disabled={!newName.trim() || !newKey.trim() || submitting}
                  className="text-xs px-3 py-1.5 rounded font-bold disabled:opacity-50"
                  style={{ background: COLORS.primary, color: COLORS.onPrimary }}
                >
                  {submitting ? '검증중…' : '저장 + 활성화'}
                </button>
                {keys.length > 0 && (
                  <button
                    type="button"
                    onClick={() => { setShowAdd(false); setAddError(null); }}
                    className="text-xs px-2 py-1.5 rounded font-semibold"
                    style={{ background: 'transparent', color: COLORS.textSecondary, border: `1px solid ${COLORS.border}` }}
                  >
                    취소
                  </button>
                )}
              </form>
            ) : (
              <button
                onClick={() => { setShowAdd(true); setAddError(null); }}
                className="mt-3 text-xs px-3 py-1.5 rounded font-semibold"
                style={{
                  background: 'transparent',
                  color: COLORS.primary,
                  border: `1px dashed ${COLORS.primary}88`,
                }}
              >
                + 새 API Key 추가
              </button>
            )}

            {(addError || error) && (
              <div
                className="mt-2 text-xs px-3 py-2 rounded whitespace-pre-wrap"
                style={{
                  background: COLORS.redSoft,
                  color: COLORS.red,
                  border: `1px solid ${COLORS.red}33`,
                }}
              >
                {addError || error}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          {status.ready && (
            <button
              onClick={() => setExpanded(false)}
              className="rounded-lg px-3 py-2 text-xs font-semibold"
              style={{
                background: COLORS.card,
                color: COLORS.textSecondary,
                border: `1px solid ${COLORS.border}`,
              }}
            >
              접기
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
