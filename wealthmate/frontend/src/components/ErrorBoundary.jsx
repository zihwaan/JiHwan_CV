import { Component } from 'react';
import { COLORS } from '../theme';

/**
 * Top-level React ErrorBoundary. If a render/commit crash escapes all
 * try/catch in hooks, React replaces the subtree with this fallback
 * instead of a blank white page. The boundary is stateful and only
 * resets on explicit click.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error, info);
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const msg = (error && (error.message || String(error))) || '알 수 없는 오류';
    return (
      <div
        className="h-screen w-screen flex items-center justify-center p-6"
        style={{ background: COLORS.bg }}
      >
        <div
          className="max-w-md w-full rounded-xl p-5 shadow-card"
          style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}
        >
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center text-lg font-bold mb-3"
            style={{ background: COLORS.redSoft, color: COLORS.red }}
          >
            !
          </div>
          <div className="text-base font-bold mb-1" style={{ color: COLORS.text }}>
            문제가 발생했습니다
          </div>
          <div className="text-xs mb-3" style={{ color: COLORS.textSecondary }}>
            대시보드 렌더링 중 오류가 발생했습니다. 새로고침하거나 아래 버튼으로 다시
            시도해 주세요. 문제가 계속되면 개발자 콘솔의 에러를 알려주세요.
          </div>
          <pre className="text-[11px] rounded p-2 mb-3 overflow-auto"
               style={{ background: COLORS.cardAlt, border: `1px solid ${COLORS.border}`,
                        color: COLORS.textSecondary, maxHeight: 140 }}>
            {msg}
          </pre>
          <div className="flex gap-2">
            <button
              onClick={this.reset}
              className="text-xs px-3 py-2 rounded font-bold"
              style={{ background: COLORS.primary, color: COLORS.onPrimary }}>
              다시 시도
            </button>
            <button
              onClick={() => window.location.reload()}
              className="text-xs px-3 py-2 rounded font-semibold"
              style={{ background: 'transparent', color: COLORS.textSecondary,
                       border: `1px solid ${COLORS.border}` }}>
              새로고침
            </button>
          </div>
        </div>
      </div>
    );
  }
}
