import { useCallback, useEffect, useRef, useState } from 'react';
import { COLORS } from '../theme';
import { won } from '../format';
import {
  getContext, listRules, createRule, updateRule, deleteRule,
  updateProfile, updateGoal, USER_ID,
} from '../api';

const TABS = [
  { key: 'prompt',  label: '시스템 프롬프트' },
  { key: 'rules',   label: '자산 관리 규칙' },
  { key: 'profile', label: '프로필' },
  { key: 'goal',    label: '재무 목표' },
];

function TabBtn({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className="px-4 py-2 text-sm font-semibold rounded-lg transition-all"
      style={{
        background: active ? COLORS.primary : 'transparent',
        color: active ? COLORS.onPrimary : COLORS.textSecondary,
        border: `1px solid ${active ? COLORS.primary : COLORS.border}`,
      }}
    >
      {children}
    </button>
  );
}

function FieldLabel({ children }) {
  return (
    <label
      className="block text-xs font-semibold uppercase tracking-wider mb-1.5"
      style={{ color: COLORS.subtext }}
    >
      {children}
    </label>
  );
}

function TextInput({ value, onChange, type = 'text', placeholder, mono }) {
  return (
    <input
      type={type}
      value={value ?? ''}
      onChange={(e) => onChange(type === 'number'
        ? (e.target.value === '' ? '' : Number(e.target.value))
        : e.target.value)}
      placeholder={placeholder}
      className={`w-full rounded-lg px-3 py-2 text-sm outline-none transition-all ${mono ? 'font-mono-num' : ''}`}
      style={{
        background: COLORS.card,
        border: `1px solid ${COLORS.border}`,
        color: COLORS.text,
      }}
      onFocus={(e) => {
        e.target.style.borderColor = COLORS.primary;
        e.target.style.boxShadow = `0 0 0 3px ${COLORS.primary}22`;
      }}
      onBlur={(e) => {
        e.target.style.borderColor = COLORS.border;
        e.target.style.boxShadow = 'none';
      }}
    />
  );
}

function PrimaryBtn({ onClick, disabled, children }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="rounded-lg px-4 py-2 text-sm font-bold disabled:opacity-40 transition-all"
      style={{
        background: `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.primaryLight})`,
        color: COLORS.onPrimary,
        boxShadow: '0 2px 6px rgba(20,40,160,0.25)',
      }}
    >
      {children}
    </button>
  );
}

function GhostBtn({ onClick, children, danger }) {
  return (
    <button
      onClick={onClick}
      className="rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors"
      style={{
        background: 'transparent',
        color: danger ? COLORS.red : COLORS.textSecondary,
        border: `1px solid ${danger ? COLORS.red + '55' : COLORS.border}`,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = danger ? COLORS.redSoft : COLORS.highlight;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
      }}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------

function PromptTab({ context }) {
  if (!context) return null;
  return (
    <div className="flex flex-col gap-4">
      <div
        className="rounded-lg p-3 text-xs flex items-start gap-3"
        style={{ background: COLORS.accentSoft, color: COLORS.accent }}
      >
        <span className="font-bold">i</span>
        <div>
          아래 텍스트가 매 채팅마다 에이전트에게 주입되는 시스템 프롬프트입니다. 이
          프롬프트의 재료 (프로필·규칙·목표)를 다른 탭에서 수정하면 즉시 반영됩니다.
        </div>
      </div>
      <div className="flex flex-wrap gap-4 text-xs" style={{ color: COLORS.textSecondary }}>
        <div><span style={{ color: COLORS.subtext }}>길이</span>{' '}
          <span className="font-mono-num font-bold">{context.system_prompt.length.toLocaleString()} chars</span>
        </div>
        <div><span style={{ color: COLORS.subtext }}>Tool 수</span>{' '}
          <span className="font-mono-num font-bold">{context.tools.length}</span>
        </div>
        <div><span style={{ color: COLORS.subtext }}>규칙 위반</span>{' '}
          <span
            className="font-mono-num font-bold"
            style={{ color: context.rule_violations.length ? COLORS.red : COLORS.green }}
          >
            {context.rule_violations.length}
          </span>
        </div>
      </div>
      <pre
        className="rounded-lg p-4 text-xs leading-relaxed whitespace-pre-wrap overflow-auto"
        style={{
          background: COLORS.cardAlt,
          border: `1px solid ${COLORS.border}`,
          color: COLORS.text,
          maxHeight: 480,
          fontFamily: 'ui-monospace, Menlo, Consolas, monospace',
        }}
      >
        {context.system_prompt}
      </pre>
      <div>
        <FieldLabel>사용 가능한 Tools</FieldLabel>
        <div className="flex flex-col gap-2">
          {context.tools.map((t) => (
            <div
              key={t.name}
              className="rounded-lg p-3 text-xs"
              style={{ background: COLORS.cardAlt, border: `1px solid ${COLORS.border}` }}
            >
              <div className="font-mono-num font-bold" style={{ color: COLORS.primary }}>
                {t.name}
              </div>
              <div className="mt-1" style={{ color: COLORS.textSecondary }}>
                {t.description}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function RulesTab({ rules, onRefresh }) {
  const [editing, setEditing] = useState({}); // ruleId -> content
  const [newRule, setNewRule] = useState('');
  const [busy, setBusy] = useState(false);

  const startEdit = (r) => setEditing({ ...editing, [r.id]: r.content });
  const cancelEdit = (id) => {
    const { [id]: _, ...rest } = editing;
    setEditing(rest);
  };
  const saveEdit = async (id) => {
    setBusy(true);
    try {
      await updateRule(USER_ID, id, editing[id]);
      cancelEdit(id);
      onRefresh();
    } finally { setBusy(false); }
  };
  const remove = async (id) => {
    if (!window.confirm('이 규칙을 삭제할까요?')) return;
    setBusy(true);
    try {
      await deleteRule(USER_ID, id);
      onRefresh();
    } finally { setBusy(false); }
  };
  const add = async () => {
    const v = newRule.trim();
    if (!v) return;
    setBusy(true);
    try {
      await createRule(USER_ID, v);
      setNewRule('');
      onRefresh();
    } finally { setBusy(false); }
  };

  return (
    <div className="flex flex-col gap-4">
      <div
        className="rounded-lg p-3 text-xs"
        style={{ background: COLORS.accentSoft, color: COLORS.accent }}
      >
        규칙은 시스템 프롬프트에 규칙 번호와 함께 주입되며, 에이전트가 조언 시 인용합니다.
        위반 여부는 Python 코드가 계산해 별도로 프롬프트에 포함됩니다.
      </div>

      <div className="flex flex-col gap-2">
        {rules.map((r, idx) => {
          const isEditing = r.id in editing;
          return (
            <div
              key={r.id}
              className="rounded-lg p-3 flex items-start gap-3"
              style={{ background: COLORS.card, border: `1px solid ${COLORS.border}` }}
            >
              <div
                className="rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5"
                style={{ background: COLORS.primarySoft, color: COLORS.primary }}
              >
                {idx + 1}
              </div>
              <div className="flex-1">
                {isEditing ? (
                  <textarea
                    value={editing[r.id]}
                    onChange={(e) => setEditing({ ...editing, [r.id]: e.target.value })}
                    rows={2}
                    className="w-full rounded-md px-2 py-1.5 text-sm outline-none"
                    style={{
                      background: COLORS.cardAlt,
                      border: `1px solid ${COLORS.primary}`,
                      color: COLORS.text,
                      resize: 'vertical',
                    }}
                    autoFocus
                  />
                ) : (
                  <div className="text-sm" style={{ color: COLORS.text }}>
                    {r.content}
                  </div>
                )}
                <div className="mt-1 flex items-center gap-2">
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded font-semibold"
                    style={{
                      background: r.scope === 'global' ? COLORS.primarySoft : COLORS.accentSoft,
                      color: r.scope === 'global' ? COLORS.primary : COLORS.accent,
                    }}
                  >
                    {r.scope === 'global' ? 'GLOBAL' : 'USER'}
                  </span>
                  <span className="text-[10px] font-mono-num" style={{ color: COLORS.muted }}>
                    id={r.id}
                  </span>
                </div>
              </div>
              <div className="flex gap-1 shrink-0">
                {isEditing ? (
                  <>
                    <GhostBtn onClick={() => cancelEdit(r.id)}>취소</GhostBtn>
                    <PrimaryBtn
                      onClick={() => saveEdit(r.id)}
                      disabled={busy || !editing[r.id]?.trim()}
                    >
                      저장
                    </PrimaryBtn>
                  </>
                ) : (
                  <>
                    <GhostBtn onClick={() => startEdit(r)}>수정</GhostBtn>
                    <GhostBtn onClick={() => remove(r.id)} danger>삭제</GhostBtn>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div
        className="rounded-lg p-3 flex gap-2 items-center"
        style={{ background: COLORS.cardAlt, border: `1px dashed ${COLORS.borderStrong}` }}
      >
        <input
          value={newRule}
          onChange={(e) => setNewRule(e.target.value)}
          placeholder="새 규칙 추가 — 예: 채권 비중을 10% 이상 유지한다"
          className="flex-1 rounded-md px-3 py-2 text-sm outline-none"
          style={{
            background: COLORS.card,
            border: `1px solid ${COLORS.border}`,
            color: COLORS.text,
          }}
        />
        <PrimaryBtn onClick={add} disabled={busy || !newRule.trim()}>추가</PrimaryBtn>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function ProfileTab({ profile, onRefresh }) {
  const [form, setForm] = useState(profile);
  const [busy, setBusy] = useState(false);

  useEffect(() => setForm(profile), [profile]);

  const save = async () => {
    setBusy(true);
    try {
      await updateProfile(USER_ID, {
        name: form.name,
        department: form.department,
        salary: Number(form.salary),
        join_year: Number(form.join_year),
      });
      onRefresh();
    } finally { setBusy(false); }
  };

  const dirty = JSON.stringify(form) !== JSON.stringify(profile);

  return (
    <div className="flex flex-col gap-4">
      <div
        className="rounded-lg p-3 text-xs"
        style={{ background: COLORS.accentSoft, color: COLORS.accent }}
      >
        프로필 정보는 매 대화마다 에이전트에게 전달돼 조언의 기준이 됩니다 (저축률 계산에 월 실수령액 사용).
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <FieldLabel>이름</FieldLabel>
          <TextInput value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
        </div>
        <div>
          <FieldLabel>부서</FieldLabel>
          <TextInput value={form.department} onChange={(v) => setForm({ ...form, department: v })} />
        </div>
        <div>
          <FieldLabel>월 실수령액 (원)</FieldLabel>
          <TextInput
            type="number"
            value={form.salary}
            onChange={(v) => setForm({ ...form, salary: v })}
            mono
          />
          <div className="text-xs mt-1 font-mono-num" style={{ color: COLORS.muted }}>
            {won(form.salary)}
          </div>
        </div>
        <div>
          <FieldLabel>입사 연도</FieldLabel>
          <TextInput
            type="number"
            value={form.join_year}
            onChange={(v) => setForm({ ...form, join_year: v })}
            mono
          />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <GhostBtn onClick={() => setForm(profile)}>되돌리기</GhostBtn>
        <PrimaryBtn onClick={save} disabled={busy || !dirty}>저장</PrimaryBtn>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function GoalTab({ goal, onRefresh }) {
  const [form, setForm] = useState({
    target_amount: goal?.target_amount,
    target_year: goal?.target_year,
    start_amount: goal?.start_amount,
    start_date: goal?.start_date,
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => setForm({
    target_amount: goal?.target_amount,
    target_year: goal?.target_year,
    start_amount: goal?.start_amount,
    start_date: goal?.start_date,
  }), [goal]);

  const save = async () => {
    setBusy(true);
    try {
      await updateGoal(USER_ID, {
        target_amount: Number(form.target_amount),
        target_year: Number(form.target_year),
        start_amount: Number(form.start_amount),
        start_date: form.start_date,
      });
      onRefresh();
    } finally { setBusy(false); }
  };

  const dirty = form.target_amount !== goal?.target_amount
    || form.target_year !== goal?.target_year
    || form.start_amount !== goal?.start_amount
    || form.start_date !== goal?.start_date;

  return (
    <div className="flex flex-col gap-4">
      <div
        className="rounded-lg p-3 text-xs"
        style={{ background: COLORS.accentSoft, color: COLORS.accent }}
      >
        목표 금액/연도가 달성률과 월 필요 저축액 계산의 기준이 됩니다.
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <FieldLabel>목표 금액 (원)</FieldLabel>
          <TextInput
            type="number"
            value={form.target_amount}
            onChange={(v) => setForm({ ...form, target_amount: v })}
            mono
          />
          <div className="text-xs mt-1 font-mono-num" style={{ color: COLORS.muted }}>
            {won(form.target_amount)}
          </div>
        </div>
        <div>
          <FieldLabel>목표 연도</FieldLabel>
          <TextInput
            type="number"
            value={form.target_year}
            onChange={(v) => setForm({ ...form, target_year: v })}
            mono
          />
        </div>
        <div>
          <FieldLabel>시작 시점 자산 (원)</FieldLabel>
          <TextInput
            type="number"
            value={form.start_amount}
            onChange={(v) => setForm({ ...form, start_amount: v })}
            mono
          />
          <div className="text-xs mt-1 font-mono-num" style={{ color: COLORS.muted }}>
            {won(form.start_amount)}
          </div>
        </div>
        <div>
          <FieldLabel>시작일 (YYYY-MM)</FieldLabel>
          <TextInput
            value={form.start_date}
            onChange={(v) => setForm({ ...form, start_date: v })}
            placeholder="2024-01"
          />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <GhostBtn onClick={() => setForm({
          target_amount: goal?.target_amount,
          target_year: goal?.target_year,
          start_amount: goal?.start_amount,
          start_date: goal?.start_date,
        })}>되돌리기</GhostBtn>
        <PrimaryBtn onClick={save} disabled={busy || !dirty}>저장</PrimaryBtn>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

export default function AgentKnowledgeModal({ open, onClose, onMutate }) {
  const [tab, setTab] = useState('prompt');
  const [context, setContext] = useState(null);
  const [rules, setRules] = useState([]);
  const bodyRef = useRef(null);

  const refresh = useCallback(async () => {
    const [ctxRes, rulesRes] = await Promise.all([
      getContext(USER_ID),
      listRules(USER_ID),
    ]);
    setContext(ctxRes.data);
    setRules(rulesRes.data);
    if (onMutate) onMutate();
  }, [onMutate]);

  useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);

  // reset scroll to top when switching tabs — otherwise the previous tab's
  // scroll position persists and the new tab looks "cut off at the top".
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [tab]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center px-2 md:px-4 py-[2vh]"
      style={{ background: 'rgba(11,26,61,0.55)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl rounded-2xl overflow-hidden flex flex-col shadow-card-lg"
        style={{
          background: COLORS.card,
          border: `1px solid ${COLORS.border}`,
          // explicit height + min-height:0 on body ensures the inner
          // overflow-y-auto actually activates and the top of each tab's
          // content is reachable (bug: earlier "items-center + maxHeight"
          // combo made the scroll origin drift under the tabs bar).
          height: 'min(96vh, 900px)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* header */}
        <div
          className="px-4 md:px-6 py-3 md:py-4 flex items-center justify-between gap-3 shrink-0"
          style={{
            background: `linear-gradient(135deg, ${COLORS.primaryDark}, ${COLORS.primary})`,
            color: COLORS.onPrimary,
          }}
        >
          <div className="min-w-0">
            <h2 className="text-base md:text-lg font-bold">에이전트 지식 관리</h2>
            <div className="text-[11px] md:text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.8)' }}>
              에이전트가 매 대화마다 참조하는 RAG 컨텍스트를 확인하고 수정합니다
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-lg flex items-center justify-center text-lg font-bold transition-colors"
            style={{ background: 'rgba(255,255,255,0.15)', color: COLORS.onPrimary }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.28)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
            aria-label="닫기"
          >
            ×
          </button>
        </div>

        {/* tabs */}
        <div
          className="px-3 md:px-6 py-2 md:py-3 flex gap-2 overflow-x-auto shrink-0"
          style={{ borderBottom: `1px solid ${COLORS.border}`, background: COLORS.cardAlt }}
        >
          {TABS.map((t) => (
            <TabBtn key={t.key} active={tab === t.key} onClick={() => setTab(t.key)}>
              {t.label}
            </TabBtn>
          ))}
        </div>

        {/* body — flex-1 + min-h-0 + explicit ref for tab-change scroll-reset. */}
        <div ref={bodyRef} className="p-4 md:p-6 overflow-y-auto flex-1 min-h-0" style={{ background: COLORS.bg }}>
          {tab === 'prompt'  && <PromptTab  context={context} />}
          {tab === 'rules'   && <RulesTab   rules={rules} onRefresh={refresh} />}
          {tab === 'profile' && context && (
            <ProfileTab profile={context.profile} onRefresh={refresh} />
          )}
          {tab === 'goal'    && context && (
            <GoalTab    goal={context.goal}   onRefresh={refresh} />
          )}
        </div>
      </div>
    </div>
  );
}
