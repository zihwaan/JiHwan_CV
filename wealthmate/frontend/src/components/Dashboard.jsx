import StatCard from './StatCard';
import PortfolioChart from './PortfolioChart';
import LiquidChart from './LiquidChart';
import GoalGauge from './GoalGauge';
import ExpenseChart from './ExpenseChart';
import AssetTable from './AssetTable';
import MonthlyExpenseEditor from './MonthlyExpenseEditor';
import NetWorthTrendChart from './NetWorthTrendChart';
import IncomeEditor from './IncomeEditor';
import RuleComplianceBoard from './RuleComplianceBoard';
import { COLORS } from '../theme';
import { won, pct, signedPct } from '../format';
import { USER_ID } from '../api';

export default function Dashboard({ data, onOpenKnowledge, onRefresh }) {
  if (!data) {
    return (
      <div
        className="flex-1 flex items-center justify-center"
        style={{ color: COLORS.subtext }}
      >
        <div className="text-center">
          <div
            className="w-12 h-12 rounded-full mx-auto mb-3 animate-pulse"
            style={{ background: COLORS.primarySoft }}
          />
          대시보드 로딩 중...
        </div>
      </div>
    );
  }

  const { profile, assets, total_assets, mom_return, cumulative_return,
    liquid_amount, illiquid_amount, goal, expenses_by_month,
    net_worth_series, incomes_by_month, rule_evals_by_month } = data;

  return (
    <main className="flex-1 overflow-y-auto" style={{ background: COLORS.bg }}>
      {/* header — Samsung 로얄블루 배너 */}
      <header
        className="px-4 md:px-6 py-4 md:py-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
        style={{
          background: `linear-gradient(135deg, ${COLORS.primaryDark} 0%, ${COLORS.primary} 100%)`,
          color: COLORS.onPrimary,
        }}
      >
        <div className="flex items-center gap-3 md:gap-4 min-w-0">
          <div
            className="w-10 h-10 md:w-12 md:h-12 rounded-lg flex items-center justify-center font-black text-lg md:text-xl shadow-card-lg shrink-0"
            style={{ background: COLORS.onPrimary, color: COLORS.primary }}
          >
            W
          </div>
          <div className="min-w-0">
            <h1 className="text-lg md:text-xl font-bold tracking-tight">
              WealthMate
            </h1>
            <div
              className="text-[11px] md:text-xs mt-0.5 truncate"
              style={{ color: 'rgba(255,255,255,0.85)' }}
            >
              {profile.name} · {profile.department} · 월 실수령 {won(profile.salary)}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={onOpenKnowledge}
            className="text-xs px-3 py-1.5 rounded-full font-semibold flex items-center gap-2 transition-all shrink-0"
            style={{
              background: COLORS.onPrimary,
              color: COLORS.primary,
              boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
            title="에이전트가 아는 정보를 확인/수정"
          >
            <span style={{ fontSize: 12 }}>⚙</span>
            에이전트 지식
          </button>
          <div
            className="text-xs px-3 py-1.5 rounded-full flex items-center gap-2 font-semibold shrink-0"
            style={{ background: 'rgba(255,255,255,0.15)', color: COLORS.onPrimary }}
          >
            <span
              className="live-dot inline-block w-2 h-2 rounded-full"
              style={{ background: '#7cf5a5' }}
            />
            <span className="hidden sm:inline">LIVE · 5초 자동 갱신</span>
            <span className="sm:hidden">LIVE</span>
          </div>
        </div>
      </header>

      <div className="p-4 md:p-6">
        {/* 4 stat cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-3 md:mb-4">
          <StatCard
            label="총 자산"
            value={won(total_assets)}
            sub="실시간 집계"
            color={COLORS.primary}
            accent={COLORS.primary}
          />
          <StatCard
            label="전월 대비"
            value={signedPct(mom_return)}
            sub="MoM Return"
            color={mom_return >= 0 ? COLORS.green : COLORS.red}
            accent={mom_return >= 0 ? COLORS.green : COLORS.red}
          />
          <StatCard
            label="누적 수익률"
            value={signedPct(cumulative_return)}
            sub="시작 시점 대비"
            color={cumulative_return >= 0 ? COLORS.green : COLORS.red}
            accent={cumulative_return >= 0 ? COLORS.green : COLORS.red}
          />
          <StatCard
            label={`목표 (${goal?.target_year ?? '-'}년)`}
            value={pct(goal?.progress_pct ?? 0)}
            sub={`${won(goal?.target_amount ?? 0)} 중`}
            color={COLORS.primary}
            accent={COLORS.accent}
          />
        </div>

        {/* 2 pies */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4 mb-3 md:mb-4">
          <PortfolioChart assets={assets} total={total_assets} />
          <LiquidChart liquid={liquid_amount} illiquid={illiquid_amount} />
        </div>

        <div className="mb-3 md:mb-4">
          <GoalGauge goal={goal} totalAssets={total_assets} />
        </div>

        <div className="mb-3 md:mb-4">
          <NetWorthTrendChart
            series={net_worth_series}
            goal={goal}
            totalAssets={total_assets}
          />
        </div>

        <div className="mb-3 md:mb-4">
          <RuleComplianceBoard evalsByMonth={rule_evals_by_month} />
        </div>

        <div className="mb-3 md:mb-4">
          <ExpenseChart expensesByMonth={expenses_by_month} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 md:gap-4 mb-3 md:mb-4">
          <div className="lg:col-span-2">
            <MonthlyExpenseEditor
              userId={USER_ID}
              expensesByMonth={expenses_by_month}
              salary={profile.salary}
              onRefresh={onRefresh}
            />
          </div>
          <div>
            <IncomeEditor
              userId={USER_ID}
              incomesByMonth={incomes_by_month}
              onRefresh={onRefresh}
            />
          </div>
        </div>

        <div className="pb-4 md:pb-0">
          <AssetTable assets={assets} total={total_assets} />
        </div>
      </div>
    </main>
  );
}
