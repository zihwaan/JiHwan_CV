import { COLORS } from '../theme';

export default function StatCard({ label, value, sub, color = COLORS.primary, accent }) {
  return (
    <div
      className="rounded-xl p-5 flex flex-col gap-2 shadow-card relative overflow-hidden"
      style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}
    >
      {/* left accent bar */}
      <div
        className="absolute top-0 left-0 h-full"
        style={{ width: 4, background: accent || color }}
      />
      <div
        className="text-xs uppercase tracking-wider font-semibold"
        style={{ color: COLORS.subtext, paddingLeft: 8 }}
      >
        {label}
      </div>
      <div
        className="text-lg md:text-2xl font-mono-num font-bold truncate"
        style={{ color, paddingLeft: 8 }}
      >
        {value}
      </div>
      {sub && (
        <div className="text-xs" style={{ color: COLORS.muted, paddingLeft: 8 }}>{sub}</div>
      )}
    </div>
  );
}
