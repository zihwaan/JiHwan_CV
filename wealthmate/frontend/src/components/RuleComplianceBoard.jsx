import { useMemo } from 'react';
import { COLORS } from '../theme';

/**
 * 월별 규칙 준수 보드 — 순수 룰베이스.
 *
 * Backend (`services._eval_rules_for_month`) 가 매 대시보드 응답마다
 * 각 달에 대해 5개 규칙을 Python 수치 비교로 평가해 내려준다.
 * LLM 은 관여하지 않고, 별도 캐시도 없다 — 지출/부수입/자산/급여가 바뀌면
 * 다음 polling(5초) 에 즉시 반영된다.
 *
 * 범위:
 *   - 규칙1(저축률), 규칙4(긴급자금 3개월치): 그 달의 수입·지출로 월별 평가
 *   - 규칙2/3/5(포트폴리오 구성): 현재 스냅샷 기반 — `[현재 스냅샷]` 표시
 */
export default function RuleComplianceBoard({ evalsByMonth = {} }) {
  const months = useMemo(
    () => Object.keys(evalsByMonth).sort().reverse(),
    [evalsByMonth],
  );

  if (!months.length) return null;

  const totalMonths = months.length;
  const avgPassed = months.reduce((s, m) => s + evalsByMonth[m].passed, 0) / totalMonths;

  return (
    <div
      className="rounded-xl p-4 md:p-5 shadow-card"
      style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}
    >
      <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
        <div>
          <h3 className="text-sm font-semibold" style={{ color: COLORS.text }}>
            월별 규칙 준수 현황
          </h3>
          <div className="text-[11px] mt-0.5" style={{ color: COLORS.subtext }}>
            5개 규칙을 DB 값으로 수치 비교하여 월별 준수 여부를 판정합니다 (결정론적, LLM 미사용).
          </div>
        </div>
        <div className="text-[11px] px-2 py-1 rounded font-bold"
             style={{ background: COLORS.primarySoft, color: COLORS.primary }}>
          평균 {avgPassed.toFixed(1)}/5 준수 ({totalMonths}개월)
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {months.map((m) => {
          const ev = evalsByMonth[m];
          const total = ev.passed + ev.violated;
          const ratio = (ev.passed / total) * 100;
          const tone = ev.violated === 0
            ? COLORS.green
            : ev.violated >= 3 ? COLORS.red : COLORS.orange;
          return (
            <div key={m}
                 className="rounded-lg p-3 text-xs"
                 style={{ background: COLORS.cardAlt, border: `1px solid ${COLORS.border}` }}>
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold" style={{ color: COLORS.text }}>{m}</span>
                <span className="font-bold" style={{ color: tone }}>
                  {ev.passed}/{total} 준수
                </span>
              </div>

              {/* stacked compliance bar */}
              <div className="flex w-full h-1.5 rounded overflow-hidden mb-2"
                   style={{ background: COLORS.border }}>
                <div style={{ width: `${ratio}%`, background: tone }} />
                <div style={{
                  width: `${100 - ratio}%`,
                  background: COLORS.red,
                  opacity: 0.7,
                }} />
              </div>

              <ul className="flex flex-col gap-0.5">
                {ev.details.map((d) => (
                  <li key={d.id} className="flex items-start gap-1.5">
                    <span className="shrink-0 w-4 text-center font-bold"
                          style={{ color: d.compliant ? COLORS.green : COLORS.red }}>
                      {d.compliant ? '✓' : '✗'}
                    </span>
                    <span style={{ color: COLORS.textSecondary }}>
                      <b style={{ color: COLORS.text }}>규칙{d.id}</b> {d.title}
                      {d.scope === 'snapshot' && (
                        <span className="ml-1 text-[10px]" style={{ color: COLORS.subtext }}>
                          [현재 스냅샷]
                        </span>
                      )}
                      <span className="ml-1 opacity-75">— {d.note}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
