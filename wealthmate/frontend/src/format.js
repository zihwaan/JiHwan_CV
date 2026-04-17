export const won = (n) => {
  if (n == null || isNaN(n)) return '-';
  return `${Math.round(n).toLocaleString('ko-KR')}원`;
};

export const wonShort = (n) => {
  if (n == null || isNaN(n)) return '-';
  const abs = Math.abs(n);
  if (abs >= 1e8) return `${(n / 1e8).toFixed(2)}억`;
  if (abs >= 1e4) return `${(n / 1e4).toFixed(0)}만`;
  return `${n.toLocaleString('ko-KR')}`;
};

export const pct = (n, digits = 1) => {
  if (n == null || isNaN(n)) return '-';
  return `${n.toFixed(digits)}%`;
};

export const signedPct = (n, digits = 2) => {
  if (n == null || isNaN(n)) return '-';
  return `${n >= 0 ? '+' : ''}${n.toFixed(digits)}%`;
};
