import {
  ComposedChart, Area, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { COLORS } from '../theme';
import { won, wonShort } from '../format';

/**
 * 순자산 추이 — DB 에서 build_user_context 가 내려주는 net_worth_series 를 그대로 그린다.
 *
 * 백엔드 계산식 (services.py):
 *   nw(m₀) = goal.start_amount
 *   nw(mₖ) = nw(m_{k-1}) + salary + extra_income(k) − (expenses(k) − saving(k))
 *
 * 저축은 "소비"가 아니라 자산 전환이라 빼주고, 월급 + 부수입이 실질적인 유입이 된다.
 * 따라서 이 그래프는 "룰 기반으로 월급/부수입/지출만 읽어서 계산한 순자산 추이".
 */
export default function NetWorthTrendChart({ series = [], goal, totalAssets }) {
  if (!series.length) return null;

  const data = series.map((r) => ({
    month: r.month,
    '순자산': r.net_worth,
    '월급': r.salary,
    '부수입': r.extra_income,
    '지출': -(r.expenses_total - r.saving), // consumption (negative bar)
    '저축': r.saving,
  }));

  return (
    <div
      className="rounded-xl p-4 md:p-5 shadow-card"
      style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}
    >
      <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
        <div>
          <h3 className="text-sm font-semibold" style={{ color: COLORS.text }}>
            순자산 추이
          </h3>
          <div className="text-[11px] mt-0.5" style={{ color: COLORS.subtext }}>
            룰 기반 계산: 시작자산 + 누적(월급 + 부수입 − 비저축 지출). 점선은 목표.
          </div>
        </div>
        <div className="text-[11px] flex gap-3 flex-wrap" style={{ color: COLORS.textSecondary }}>
          <span>현재 총자산: <b style={{ color: COLORS.text }}>{won(totalAssets)}</b></span>
          {series.length > 0 && (
            <span>마지막 계산 순자산:
              <b style={{ color: COLORS.text }}> {won(series[series.length - 1].net_worth)}</b>
            </span>
          )}
        </div>
      </div>

      <div className="w-full" style={{ height: 300 }}>
        <ResponsiveContainer>
          <ComposedChart data={data} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
            <defs>
              <linearGradient id="nwFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={COLORS.primary} stopOpacity={0.4} />
                <stop offset="95%" stopColor={COLORS.primary} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
            <XAxis dataKey="month" stroke={COLORS.subtext}
                   tick={{ fontSize: 11, fill: COLORS.textSecondary }} />
            <YAxis yAxisId="left" stroke={COLORS.subtext}
                   tick={{ fontSize: 11, fill: COLORS.textSecondary }}
                   tickFormatter={(v) => wonShort(v)} />
            <YAxis yAxisId="right" orientation="right" stroke={COLORS.subtext}
                   tick={{ fontSize: 11, fill: COLORS.textSecondary }}
                   tickFormatter={(v) => wonShort(v)} />
            <Tooltip
              contentStyle={{
                background: COLORS.card,
                border: `1px solid ${COLORS.border}`,
                borderRadius: 8,
              }}
              labelStyle={{ color: COLORS.text, fontWeight: 600 }}
              formatter={(v, name) => [won(v), name]}
            />
            <Legend wrapperStyle={{ fontSize: 12, color: COLORS.textSecondary }} />
            {goal?.target_amount && (
              <ReferenceLine
                yAxisId="left"
                y={goal.target_amount}
                stroke={COLORS.accent}
                strokeDasharray="4 4"
                label={{ value: '목표', position: 'right', fill: COLORS.accent, fontSize: 11 }}
              />
            )}
            <Bar yAxisId="right" dataKey="부수입" stackId="cash" fill={COLORS.yellow} />
            <Bar yAxisId="right" dataKey="저축"  stackId="cash" fill={COLORS.primaryLight} />
            <Bar yAxisId="right" dataKey="지출"  fill={COLORS.red} opacity={0.55} />
            <Area
              type="monotone"
              dataKey="순자산"
              yAxisId="left"
              stroke={COLORS.primary}
              strokeWidth={2.5}
              fill="url(#nwFill)"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
