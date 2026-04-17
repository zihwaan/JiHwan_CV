import { COLORS } from '../theme';
import { won, pct } from '../format';

export default function GoalGauge({ goal, totalAssets }) {
  if (!goal) return null;
  const { target_amount, start_amount, progress_pct, monthly_needed, months_left } = goal;
  const pctClamped = Math.max(0, Math.min(100, progress_pct));

  return (
    <div
      className="rounded-xl p-5 shadow-card"
      style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}
    >
      <div className="flex items-start justify-between mb-4 gap-3 flex-wrap">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold" style={{ color: COLORS.text }}>
            목표 달성 현황
          </h3>
          <div className="text-xs mt-0.5" style={{ color: COLORS.subtext }}>
            재무 목표까지의 진행도
          </div>
        </div>
        <div
          className="text-[11px] md:text-xs text-right px-3 py-2 rounded-lg shrink-0"
          style={{ background: COLORS.primarySoft, color: COLORS.primary }}
        >
          월 <span className="font-mono-num font-bold">{won(monthly_needed)}</span> 추가 필요
          <br />잔여 <span className="font-mono-num font-bold">{months_left}</span>개월
        </div>
      </div>
      <div
        className="w-full rounded-full overflow-hidden"
        style={{ background: COLORS.highlight, height: 22 }}
      >
        <div
          className="h-full rounded-full transition-all duration-700 relative"
          style={{
            width: `${pctClamped}%`,
            background: `linear-gradient(90deg, ${COLORS.primaryDark} 0%, ${COLORS.primary} 50%, ${COLORS.accent} 100%)`,
            boxShadow: 'inset 0 -2px 4px rgba(255,255,255,0.15)',
          }}
        >
          <span
            className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] font-bold font-mono-num"
            style={{ color: '#fff' }}
          >
            {pct(progress_pct)}
          </span>
        </div>
      </div>
      <div className="flex justify-between gap-2 text-xs mt-4 font-mono-num">
        <div>
          <div className="uppercase tracking-wider" style={{ color: COLORS.muted, fontSize: 10 }}>
            시작
          </div>
          <div className="font-semibold mt-1" style={{ color: COLORS.textSecondary }}>
            {won(start_amount)}
          </div>
        </div>
        <div className="text-center">
          <div className="uppercase tracking-wider" style={{ color: COLORS.muted, fontSize: 10 }}>
            현재
          </div>
          <div className="font-bold mt-1" style={{ color: COLORS.primary }}>
            {won(totalAssets)}
          </div>
        </div>
        <div className="text-right">
          <div className="uppercase tracking-wider" style={{ color: COLORS.muted, fontSize: 10 }}>
            목표
          </div>
          <div className="font-semibold mt-1" style={{ color: COLORS.textSecondary }}>
            {won(target_amount)}
          </div>
        </div>
      </div>
    </div>
  );
}
