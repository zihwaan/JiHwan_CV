import { useMemo, useState } from 'react';
import { COLORS } from '../theme';
import { won } from '../format';
import { addIncome, deleteIncome } from '../api';

/**
 * 부수입 편집기 — 월급(users.salary)은 건드리지 않고, 성과급·수당·휴가비 같은
 * 일회성 수입만 관리한다. 같은 달에 여러 건 가능.
 *
 * 데이터는 `incomes_by_month: { "YYYY-MM": [{id,label,amount}, …] }` 형태로
 * 대시보드 엔드포인트(`build_user_context`) 가 이미 내려주고 있으므로
 * 편집 후 `onRefresh` 한 번으로 전체 화면이 리-싱크된다.
 */
const DEFAULT_LABELS = ['성과급', 'OPI', 'TAI', '야근수당', '휴가비', '기타'];

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function IncomeEditor({ userId, incomesByMonth = {}, onRefresh }) {
  const [month, setMonth] = useState(currentMonth());
  const [label, setLabel] = useState('성과급');
  const [customLabel, setCustomLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState(null);

  const monthsWithData = useMemo(
    () => Object.keys(incomesByMonth).sort().reverse(),
    [incomesByMonth],
  );

  const allRows = useMemo(() => {
    const out = [];
    for (const m of Object.keys(incomesByMonth).sort().reverse()) {
      for (const r of incomesByMonth[m]) out.push({ ...r, month: m });
    }
    return out;
  }, [incomesByMonth]);

  const totalAll = allRows.reduce((a, b) => a + b.amount, 0);

  const resolvedLabel = label === '기타' ? customLabel.trim() : label;

  const submit = async (e) => {
    e?.preventDefault?.();
    const amt = Number(String(amount).replace(/[^0-9]/g, ''));
    if (!month || !resolvedLabel || !amt || busy) return;
    setBusy(true);
    setFlash(null);
    try {
      await addIncome(userId, { month, label: resolvedLabel, amount: amt });
      setAmount('');
      if (label === '기타') setCustomLabel('');
      setFlash({ tone: 'ok', text: `${resolvedLabel} ${won(amt)} 기록 완료` });
      setTimeout(() => setFlash(null), 1500);
      onRefresh?.();
    } catch (err) {
      setFlash({ tone: 'err', text: err?.response?.data?.detail || err.message });
      setTimeout(() => setFlash(null), 3000);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (row) => {
    if (busy) return;
    if (!window.confirm(`'${row.month} · ${row.label} · ${won(row.amount)}' 삭제?`)) return;
    setBusy(true);
    try {
      await deleteIncome(userId, row.id);
      onRefresh?.();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="rounded-xl p-4 md:p-5 shadow-card"
      style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}
    >
      <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
        <div>
          <h3 className="text-sm font-semibold" style={{ color: COLORS.text }}>
            부수입 (성과급 · 수당 · 일회성 지급)
          </h3>
          <div className="text-[11px] mt-0.5" style={{ color: COLORS.subtext }}>
            월급은 프로필에서 관리하고, 여기선 변동 수입만 기록합니다. 순자산 추이에 즉시 반영됩니다.
          </div>
        </div>
        <div className="text-[11px]" style={{ color: COLORS.textSecondary }}>
          누적: <b style={{ color: COLORS.text }}>{won(totalAll)}</b> / {allRows.length}건
        </div>
      </div>

      <form onSubmit={submit} className="flex items-center gap-2 flex-wrap mb-3">
        <input
          type="text"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          placeholder="YYYY-MM"
          className="text-xs px-2 py-1.5 rounded w-28 font-mono-num"
          style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, color: COLORS.text }}
          disabled={busy}
        />
        <select
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="text-xs px-2 py-1.5 rounded"
          style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, color: COLORS.text }}
          disabled={busy}
        >
          {DEFAULT_LABELS.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
        {label === '기타' && (
          <input
            type="text"
            value={customLabel}
            onChange={(e) => setCustomLabel(e.target.value)}
            placeholder="라벨 (예: 인센티브)"
            className="text-xs px-2 py-1.5 rounded w-32"
            style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, color: COLORS.text }}
            disabled={busy}
          />
        )}
        <input
          type="text"
          inputMode="numeric"
          value={amount ? Number(amount).toLocaleString('ko-KR') : ''}
          onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ''))}
          placeholder="금액 (원)"
          className="text-xs px-2 py-1.5 rounded flex-1 min-w-[140px] text-right font-mono-num"
          style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, color: COLORS.text }}
          disabled={busy}
        />
        <button
          type="submit"
          disabled={busy || !amount || !resolvedLabel}
          className="text-xs px-3 py-1.5 rounded font-bold disabled:opacity-50"
          style={{ background: COLORS.primary, color: COLORS.onPrimary }}
        >
          {busy ? '저장중…' : '추가'}
        </button>
      </form>

      {allRows.length === 0 ? (
        <div className="text-xs px-3 py-2 rounded"
             style={{ background: COLORS.cardAlt, color: COLORS.subtext }}>
          아직 기록된 부수입이 없습니다. 위에서 성과급·수당·휴가비 등을 월별로 추가해 보세요.
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {monthsWithData.map((m) => {
            const rows = incomesByMonth[m];
            const subtotal = rows.reduce((a, b) => a + b.amount, 0);
            return (
              <div key={m} className="rounded border text-xs"
                   style={{ borderColor: COLORS.border }}>
                <div className="flex items-center justify-between px-2 py-1.5"
                     style={{ background: COLORS.cardAlt }}>
                  <span className="font-semibold" style={{ color: COLORS.text }}>{m}</span>
                  <span className="font-mono-num" style={{ color: COLORS.textSecondary }}>
                    합계 {won(subtotal)}
                  </span>
                </div>
                <div>
                  {rows.map((r) => (
                    <div key={r.id}
                         className="flex items-center justify-between px-2 py-1.5"
                         style={{ borderTop: `1px solid ${COLORS.border}` }}>
                      <span style={{ color: COLORS.text }}>{r.label}</span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono-num font-bold" style={{ color: COLORS.text }}>
                          {won(r.amount)}
                        </span>
                        <button
                          onClick={() => remove({ ...r, month: m })}
                          className="text-[11px] px-2 py-0.5 rounded"
                          style={{
                            background: 'transparent',
                            color: COLORS.red,
                            border: `1px solid ${COLORS.red}55`,
                          }}
                        >
                          삭제
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {flash && (
        <div className="mt-3 text-xs px-3 py-2 rounded"
             style={{
               background: flash.tone === 'ok' ? COLORS.greenSoft : COLORS.redSoft,
               color: flash.tone === 'ok' ? COLORS.green : COLORS.red,
               border: `1px solid ${flash.tone === 'ok' ? COLORS.green : COLORS.red}33`,
             }}>
          {flash.text}
        </div>
      )}
    </div>
  );
}
