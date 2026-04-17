import { useEffect, useMemo, useState } from 'react';
import { COLORS, CATEGORY_COLORS, CATEGORY_ORDER } from '../theme';
import { won, wonShort } from '../format';
import { bulkUpsertExpenses } from '../api';

/**
 * Inline grid editor: rows = categories, columns = months.
 * Edits are staged locally; "저장" pushes all changed cells to
 * /api/expenses/:user_id/bulk in a single request. Changed cells are
 * highlighted. "되돌리기" drops local edits.
 *
 * Rule-based hints are derived on the fly (e.g., row turns amber if
 * that month's 저축률 < 40%) so users can spot issues while editing.
 */
function ymdPrev(ym, n) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 - n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function latestMonthOf(byMonth) {
  const keys = Object.keys(byMonth || {}).sort();
  return keys.length ? keys[keys.length - 1] : '2026-04';
}

export default function MonthlyExpenseEditor({
  userId,
  expensesByMonth,
  salary,
  onRefresh,
}) {
  const latest = latestMonthOf(expensesByMonth);
  const [window, setWindow] = useState(6); // last 6 months by default
  const months = useMemo(
    () => Array.from({ length: window }, (_, i) => ymdPrev(latest, window - 1 - i)),
    [latest, window],
  );

  // local edits: { "YYYY-MM::category": amount }
  const [edits, setEdits] = useState({});
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState(null);

  // reset staged edits if incoming data changed externally
  useEffect(() => { setEdits({}); }, [latest]);

  const cellKey = (m, c) => `${m}::${c}`;
  const serverValue = (m, c) => expensesByMonth?.[m]?.[c] ?? 0;
  const cellValue = (m, c) => {
    const k = cellKey(m, c);
    if (k in edits) return edits[k];
    return serverValue(m, c);
  };
  const isDirty = (m, c) => cellKey(m, c) in edits && edits[cellKey(m, c)] !== serverValue(m, c);
  const dirtyCount = Object.keys(edits).filter((k) => {
    const [m, c] = k.split('::');
    return edits[k] !== serverValue(m, c);
  }).length;

  const setCell = (m, c, raw) => {
    const num = raw === '' ? 0 : Number(String(raw).replace(/[^0-9]/g, ''));
    setEdits((e) => ({ ...e, [cellKey(m, c)]: Number.isFinite(num) ? num : 0 }));
  };

  const revert = () => setEdits({});

  const save = async () => {
    if (!dirtyCount || saving) return;
    setSaving(true);
    try {
      const rows = Object.entries(edits)
        .map(([k, amount]) => {
          const [month, category] = k.split('::');
          return { month, category, amount };
        })
        .filter(({ month, category, amount }) => amount !== serverValue(month, category));
      await bulkUpsertExpenses(userId, rows);
      setEdits({});
      setFlash({ tone: 'ok', text: `${rows.length}개 셀 저장 완료` });
      setTimeout(() => setFlash(null), 1500);
      onRefresh?.();
    } catch (err) {
      setFlash({ tone: 'err', text: err?.response?.data?.detail || err.message || '저장 실패' });
      setTimeout(() => setFlash(null), 3000);
    } finally {
      setSaving(false);
    }
  };

  const monthTotal = (m) =>
    CATEGORY_ORDER.reduce((sum, c) => sum + (cellValue(m, c) || 0), 0);
  const monthSaving = (m) => cellValue(m, '저축') || 0;
  const savingRate = (m) =>
    salary > 0 ? Math.round((monthSaving(m) / salary) * 1000) / 10 : 0;
  const ruleBreach = (m) => savingRate(m) < 40 || monthTotal(m) > salary;

  return (
    <div
      className="rounded-xl p-4 md:p-5 shadow-card"
      style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}
    >
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <div>
          <h3 className="text-sm font-semibold" style={{ color: COLORS.text }}>
            월별 지출 편집기
          </h3>
          <div className="text-[11px] mt-0.5" style={{ color: COLORS.subtext }}>
            셀을 클릭해 금액을 바꾸고 "저장" 을 누르세요. 0 입력 = 삭제.
            저축률 &lt; 40% 또는 지출 &gt; 급여 인 달은 주황으로 표시됩니다.
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={window}
            onChange={(e) => { setWindow(Number(e.target.value)); setEdits({}); }}
            className="text-xs px-2 py-1.5 rounded"
            style={{ background: COLORS.cardAlt, border: `1px solid ${COLORS.border}`, color: COLORS.text }}
          >
            <option value={3}>최근 3개월</option>
            <option value={6}>최근 6개월</option>
            <option value={12}>최근 12개월</option>
          </select>
          <button
            type="button"
            onClick={revert}
            disabled={!dirtyCount}
            className="text-xs px-3 py-1.5 rounded font-semibold disabled:opacity-40"
            style={{ background: COLORS.card, color: COLORS.textSecondary, border: `1px solid ${COLORS.border}` }}
          >
            되돌리기
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!dirtyCount || saving}
            className="text-xs px-3 py-1.5 rounded font-bold disabled:opacity-50"
            style={{ background: COLORS.primary, color: COLORS.onPrimary }}
          >
            {saving ? '저장중…' : `저장${dirtyCount ? ` (${dirtyCount})` : ''}`}
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
          <thead>
            <tr style={{ background: COLORS.cardAlt }}>
              <th className="text-left px-2 py-2 sticky left-0 z-10"
                  style={{ background: COLORS.cardAlt, borderBottom: `1px solid ${COLORS.border}` }}>
                카테고리
              </th>
              {months.map((m) => (
                <th key={m}
                    className="px-2 py-2 text-right font-semibold"
                    style={{ color: ruleBreach(m) ? COLORS.orange : COLORS.textSecondary,
                             borderBottom: `1px solid ${COLORS.border}`,
                             minWidth: 96 }}>
                  {m.slice(5)}월
                  <div className="text-[10px] font-normal" style={{ color: COLORS.subtext }}>
                    저축률 {savingRate(m).toFixed(1)}%
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CATEGORY_ORDER.map((c) => (
              <tr key={c}>
                <td className="px-2 py-1.5 font-semibold sticky left-0 z-10"
                    style={{ background: COLORS.card,
                             borderBottom: `1px solid ${COLORS.border}`,
                             color: CATEGORY_COLORS[c] }}>
                  <span className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle"
                        style={{ background: CATEGORY_COLORS[c] }} />
                  {c}
                </td>
                {months.map((m) => {
                  const v = cellValue(m, c);
                  const dirty = isDirty(m, c);
                  return (
                    <td key={m}
                        className="px-1 py-1"
                        style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={v ? v.toLocaleString('ko-KR') : ''}
                        onChange={(e) => setCell(m, c, e.target.value)}
                        placeholder="0"
                        className="w-full text-right px-1.5 py-1 rounded outline-none font-mono-num"
                        style={{
                          background: dirty ? COLORS.primarySoft : 'transparent',
                          color: dirty ? COLORS.primary : COLORS.text,
                          border: `1px solid ${dirty ? COLORS.primary : 'transparent'}`,
                          fontWeight: dirty ? 700 : 400,
                        }}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr>
              <td className="px-2 py-2 sticky left-0 z-10"
                  style={{ background: COLORS.cardAlt,
                           borderTop: `2px solid ${COLORS.border}`,
                           color: COLORS.text, fontWeight: 700 }}>
                월 합계
              </td>
              {months.map((m) => {
                const total = monthTotal(m);
                return (
                  <td key={m}
                      className="px-2 py-2 text-right font-mono-num font-bold"
                      style={{
                        background: COLORS.cardAlt,
                        borderTop: `2px solid ${COLORS.border}`,
                        color: total > salary ? COLORS.red : COLORS.text,
                      }}>
                    {wonShort(total)}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>

      {flash && (
        <div
          className="mt-3 text-xs px-3 py-2 rounded"
          style={{
            background: flash.tone === 'ok' ? COLORS.greenSoft : COLORS.redSoft,
            color: flash.tone === 'ok' ? COLORS.green : COLORS.red,
            border: `1px solid ${flash.tone === 'ok' ? COLORS.green : COLORS.red}33`,
          }}
        >
          {flash.text}
        </div>
      )}
    </div>
  );
}
