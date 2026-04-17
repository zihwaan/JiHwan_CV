import { useState } from 'react';
import Dashboard from './components/Dashboard';
import AgentChat from './components/AgentChat';
import AgentKnowledgeModal from './components/AgentKnowledgeModal';
import AuthBanner from './components/AuthBanner';
import ErrorBoundary from './components/ErrorBoundary';
import OnboardingWizard from './components/OnboardingWizard';
import { useDashboard } from './hooks/useDashboard';
import { useChat } from './hooks/useChat';
import { useAuth } from './hooks/useAuth';
import { USER_ID } from './api';
import { COLORS } from './theme';

function Shell() {
  const { data, refresh, error } = useDashboard(USER_ID, 5000);
  const { status: authStatus, refresh: refreshAuth, markLoginPending } = useAuth();
  const [chatOpen, setChatOpen] = useState(false);
  const { messages, send, loading } = useChat(USER_ID, () => {
    refresh();
    // on mobile after sending a message, keep chat open to show reply
  }, data?.profile?.name);
  const [knowledgeOpen, setKnowledgeOpen] = useState(false);

  // First-load wizard: if the backend reports the user hasn't completed
  // the setup wizard (no name / no salary / no assets & no goal), we
  // show it on top of the dashboard. After completion we refresh the
  // dashboard and the wizard is auto-dismissed because `configured` flips.
  const showWizard = data ? data.configured === false : false;

  return (
    <div className="flex flex-col h-screen" style={{ background: COLORS.bg }}>
      <AuthBanner
        status={authStatus}
        onRefresh={refreshAuth}
        onMarkPending={markLoginPending}
      />
      <div className="flex flex-1 overflow-hidden relative">
        <Dashboard
          data={data}
          onOpenKnowledge={() => setKnowledgeOpen(true)}
          onRefresh={refresh}
        />
        {showWizard && <OnboardingWizard onComplete={refresh} />
        <AgentChat
          messages={messages}
          onSend={send}
          loading={loading}
          disabled={authStatus && !authStatus.ready}
          open={chatOpen}
          onClose={() => setChatOpen(false)}
        />
        {/* mobile FAB — opens chat panel */}
        <button
          className="md:hidden fixed bottom-5 right-5 z-30 w-14 h-14 rounded-full flex items-center justify-center shadow-card-lg transition-transform active:scale-95"
          style={{
            background: `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.primaryLight})`,
            color: COLORS.onPrimary,
            display: chatOpen ? 'none' : 'flex',
          }}
          onClick={() => setChatOpen(true)}
          aria-label="에이전트 채팅 열기"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        </button>
      </div>
      <AgentKnowledgeModal
        open={knowledgeOpen}
        onClose={() => setKnowledgeOpen(false)}
        onMutate={refresh}
      />
      {error && (
        <div
          className="fixed bottom-4 left-4 right-4 md:right-auto px-4 py-3 rounded-lg text-sm font-semibold shadow-card-lg z-40"
          style={{
            background: COLORS.redSoft,
            color: COLORS.red,
            border: `1px solid ${COLORS.red}`,
          }}
        >
          백엔드 연결 오류: {error}
        </div>
      )}
    </div>
  );
}
