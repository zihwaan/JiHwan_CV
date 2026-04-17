import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { PIE_COLORS, COLORS } from '../theme';
import { won, pct } from '../format';

export default function PortfolioChart({ assets = [], total = 0 }) {
  const data = assets.map((a) => ({ name: a.name, value: a.amount }));

  return (
    <div
      className="rounded-xl p-5 shadow-card"
      style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}
    >
      <h3 className="text-sm font-semibold mb-3" style={{ color: COLORS.text }}>
        포트폴리오 구성
      </h3>
      <div className="flex flex-col sm:flex-row items-center gap-4">
        <div className="w-[180px] h-[180px] shrink-0">
          <ResponsiveContainer>
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                innerRadius={45}
                outerRadius={80}
                stroke={COLORS.card}
                strokeWidth={2}
              >
                {data.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: COLORS.card,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: 8,
                  boxShadow: '0 4px 12px rgba(20,40,160,0.08)',
                }}
                labelStyle={{ color: COLORS.text }}
                itemStyle={{ color: COLORS.text }}
                formatter={(v) => won(v)}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="flex-1 w-full flex flex-col gap-2 text-sm">
          {assets.map((a, i) => {
            const share = total > 0 ? (a.amount / total) * 100 : 0;
            return (
              <div key={a.id ?? a.name} className="flex items-center gap-2">
                <span
                  className="inline-block w-3 h-3 rounded-sm"
                  style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}
                />
                <span
                  className="flex-1 truncate"
                  style={{ color: COLORS.textSecondary }}
                >
                  {a.name}
                </span>
                <span
                  className="font-mono-num font-semibold"
                  style={{ color: COLORS.text }}
                >
                  {pct(share)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
