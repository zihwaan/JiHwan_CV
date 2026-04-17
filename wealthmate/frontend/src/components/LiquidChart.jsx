import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { COLORS } from '../theme';
import { won, pct } from '../format';

export default function LiquidChart({ liquid = 0, illiquid = 0 }) {
  const total = liquid + illiquid;
  const data = [
    { name: '유동',   value: liquid,   color: COLORS.accent },
    { name: '비유동', value: illiquid, color: COLORS.primary },
  ];

  return (
    <div
      className="rounded-xl p-5 shadow-card"
      style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}
    >
      <h3 className="text-sm font-semibold mb-3" style={{ color: COLORS.text }}>
        유동 / 비유동
      </h3>
      <div style={{ width: '100%', height: 180 }}>
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
              {data.map((d, i) => <Cell key={i} fill={d.color} />)}
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
      <div className="flex justify-around mt-3 text-sm">
        {data.map((d) => {
          const share = total > 0 ? (d.value / total) * 100 : 0;
          return (
            <div key={d.name} className="flex items-center gap-2">
              <span
                className="inline-block w-3 h-3 rounded-sm"
                style={{ background: d.color }}
              />
              <span style={{ color: COLORS.textSecondary }}>{d.name}</span>
              <span className="font-mono-num font-semibold" style={{ color: COLORS.text }}>
                {pct(share)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
