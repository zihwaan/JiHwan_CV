// Samsung 브랜드 톤 — 로얄블루 + 화이트.
// 다크 네이비는 텍스트/헤더, 화이트는 카드, 로얄블루는 강조/인터랙션에 씁니다.
export const COLORS = {
  bg: '#f4f6fb',          // app background — faint blue-white
  card: '#ffffff',        // card surface
  cardAlt: '#f8fafd',     // alt card (table header 등)
  border: '#e1e8f2',      // 1px 라인
  borderStrong: '#c7d4e8',
  highlight: '#eef2fb',

  // Samsung 로얄블루 계열
  primary: '#1428A0',     // Samsung Royal Blue (공식)
  primaryDark: '#0a1d7a',
  primaryLight: '#2e44c9',
  primarySoft: '#e7ebfa', // 연한 배경 뱃지용

  accent: '#0078d4',      // secondary blue (링크·강조)
  accentSoft: '#e4f1fb',

  // 신호 색
  green: '#00a651',
  greenSoft: '#e3f6ec',
  red: '#c8102e',
  redSoft: '#fbe6ea',
  orange: '#ed6c02',
  yellow: '#f5a623',
  purple: '#5e3bc6',

  // 텍스트
  text: '#0b1a3d',        // 본문 — 다크 네이비
  textSecondary: '#3d4a66',
  subtext: '#6b7a96',
  muted: '#9aa7bd',

  // 배경용 컬러 유틸
  onPrimary: '#ffffff',
};

// 포트폴리오 파이 — Samsung 블루 그라데이션 중심 + 보색 악센트
export const PIE_COLORS = [
  '#1428A0', // royal blue
  '#2e44c9', // 연한 로얄블루
  '#4a6cf7', // cornflower
  '#0078d4', // accent blue
  '#00a651', // green
  '#f5a623', // gold
];

// 지출 카테고리 컬러 — 화이트 배경 위에서 대비 확보
export const CATEGORY_COLORS = {
  식비: '#ed6c02',
  교통: '#0078d4',
  주거: '#5e3bc6',
  쇼핑: '#f5a623',
  여가: '#00a651',
  저축: '#1428A0',
  기타: '#8a96ae',
};

export const CATEGORY_ORDER = ['식비', '교통', '주거', '쇼핑', '여가', '저축', '기타'];
