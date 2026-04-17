import { COLORS } from '../theme';
import { won, pct, signedPct } from '../format';

export default function AssetTable({ assets = [], total = 0 }) {
  return (
    <div
      className="rounded-xl p-5 shadow-card"
      style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}
    >
      <h3 className="text-sm font-semibold mb-3" style={{ color: COLORS.text }}>
        보유 자산 상세
      </h3>
      <div className="overflow-x-auto -mx-1">
        <table className="w-full text-sm" style={{ minWidth: 560 }}>
          <thead>
            <tr
              className="text-xs uppercase tracking-wider"
              style={{
                color: COLORS.subtext,
                background: COLORS.cardAlt,
                borderBottom: `1px solid ${COLORS.border}`,
              }}
            >
              <th className="text-left px-3 py-3 font-semibold">자산명</th>
              <th className="text-left px-3 py-3 font-semibold">유형</th>
              <th className="text-left px-3 py-3 font-semibold">분류</th>
              <th className="text-right px-3 py-3 font-semibold">평가금액</th>
              <th className="text-right px-3 py-3 font-semibold">비중</th>
              <th className="text-right px-3 py-3 font-semibold">수익률</th>
            </tr>
          </thead>
          <tbody>
            {assets.map((a) => {
              const share = total > 0 ? (a.amount / total) * 100 : 0;
              const isLiquid = a.category === '유동';
              const positive = a.return_rate >= 0;
              return (
                <tr
                  key={a.id}
                  className="transition-colors"
                  style={{ borderBottom: `1px solid ${COLORS.border}` }}
                  onMouseEnter={(e) => e.currentTarget.style.background = COLORS.highlight}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <td className="px-3 py-3 font-medium" style={{ color: COLORS.text }}>
                    {a.name}
                  </td>
                  <td className="px-3 py-3" style={{ color: COLORS.textSecondary }}>
                    {a.type}
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className="px-2 py-0.5 rounded-md text-xs font-semibold"
                      style={{
                        background: isLiquid ? COLORS.accentSoft : COLORS.primarySoft,
                        color: isLiquid ? COLORS.accent : COLORS.primary,
                        border: `1px solid ${isLiquid ? COLORS.accent : COLORS.primary}22`,
                      }}
                    >
                      {a.category}
                    </span>
                  </td>
                  <td
                    className="px-3 py-3 text-right font-mono-num font-semibold"
                    style={{ color: COLORS.text }}
                  >
                    {won(a.amount)}
                  </td>
                  <td
                    className="px-3 py-3 text-right font-mono-num"
                    style={{ color: COLORS.textSecondary }}
                  >
                    {pct(share)}
                  </td>
                  <td
                    className="px-3 py-3 text-right font-mono-num font-bold"
                    style={{ color: positive ? COLORS.green : COLORS.red }}
                  >
                    {signedPct(a.return_rate)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
