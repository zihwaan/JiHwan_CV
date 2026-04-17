import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from 'recharts';
import { CATEGORY_COLORS, CATEGORY_ORDER, COLORS } from '../theme';
import { won, wonShort } from '../format';

export default function ExpenseChart({ expensesByMonth = {} }) {
  const chartData = Object.entries(expensesByMonth)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, cats]) => ({ month, ...cats }));

  return (
    <div
      className="rounded-xl p-5 shadow-card"
      style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}
    >
      <h3 className="text-sm font-semibold mb-3" style={{ color: COLORS.text }}>
        월별 지출 (카테고리별)
      </h3>
      <div className="w-full" style={{ height: 280, minWidth: 0 }}>
        <ResponsiveContainer>
          <BarChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
            <XAxis
              dataKey="month"
              stroke={COLORS.subtext}
              tick={{ fontSize: 12, fill: COLORS.textSecondary }}
              tickLine={{ stroke: COLORS.border }}
              axisLine={{ stroke: COLORS.borderStrong }}
            />
            <YAxis
              stroke={COLORS.subtext}
              tick={{ fontSize: 11, fill: COLORS.textSecondary }}
              tickFormatter={(v) => wonShort(v)}
              tickLine={{ stroke: COLORS.border }}
              axisLine={{ stroke: COLORS.borderStrong }}
            />
            <Tooltip
              contentStyle={{
                background: COLORS.card,
                border: `1px solid ${COLORS.border}`,
                borderRadius: 8,
                boxShadow: '0 4px 12px rgba(20,40,160,0.08)',
              }}
              labelStyle={{ color: COLORS.text, fontWeight: 600 }}
              itemStyle={{ color: COLORS.text }}
              cursor={{ fill: COLORS.highlight }}
              formatter={(v, name) => [won(v), name]}
            />
            <Legend wrapperStyle={{ fontSize: 12, color: COLORS.textSecondary }} />
            {CATEGORY_ORDER.map((cat) => (
              <Bar
                key={cat}
                dataKey={cat}
                stackId="a"
                fill={CATEGORY_COLORS[cat]}
                radius={cat === '기타' ? [4, 4, 0, 0] : 0}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
