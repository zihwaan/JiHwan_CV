import { useState } from 'react';
import { COLORS } from '../theme';
import { won } from '../format';
import { setupUser, USER_ID } from '../api';

/**
 * 3-step onboarding for a fresh user.
 *   1) 프로필   — name, department, salary, join year
 *   2) 목표     — target amount, target year, start amount
 *   3) 초기 자산 — any number of {name, type, category, amount, return_rate}
 *
 * On submit we POST /api/manage/setup/:user_id which resets the account
 * and writes everything atomically. The parent then refreshes the
 * dashboard which will render normally now that `configured: true`.
 */
const ASSET_TYPES = ['국내주식','해외주식','ETF','예금','저축','가상화폐','채권','부동산','기타'];

function num(raw) {
  if (raw === '' || raw == null) return 0;
  const n = Number(String(raw).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function Field({ label, children, hint }) {
  return (
    <div>
      <label className="block text-[11px] font-bold uppercase tracking-wider mb-1"
             style={{ color: COLORS.subtext }}>{label}</label>
      {children}
      {hint && <div className="text-[11px] mt-1" style={{ color: COLORS.subtext }}>{hint}</div>}
    </div>
  );
}

function Input({ value, onChange, placeholder, type = 'text', mono, disabled }) {
  return (
    <input
      type={type}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      className={`w-full rounded-lg px-3 py-2 text-sm outline-none ${mono ? 'font-mono-num' : ''}`}
      style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, color: COLORS.text }}
    />
  );
}

function MoneyInput({ value, onChange, placeholder }) {
  const display = value ? Number(value).toLocaleString('ko-KR') : '';
  return (
    <div className="relative">
      <input
        type="text"
        inputMode="numeric"
        value={display}
        onChange={(e) => onChange(num(e.target.value))}
        placeholder={placeholder}
        className="w-full rounded-lg pl-3 pr-10 py-2 text-sm text-right outline-none font-mono-num"
        style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, color: COLORS.text }}
      />
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs" style={{ color: COLORS.subtext }}>
        원
      </span>
    </div>
  );
}

export default function OnboardingWizard({ onComplete }) {
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Step 1 — profile
  const [name, setName] = useState('');
  const [department, setDepartment] = useState('');
  const [salary, setSalary] = useState(0);
  const [joinYear, setJoinYear] = useState(new Date().getFullYear());

  // Step 2 — goal
  const [targetAmount, setTargetAmount] = useState(100000000);
  const [targetYear, setTargetYear] = useState(new Date().getFullYear() + 5);
  const [startAmount, setStartAmount] = useState(0);

  // Step 3 — initial assets
  const [assets, setAssets] = useState([]);

  const addAsset = () => setAssets((xs) => [
    ...xs,
    { name: '', type: '예금', category: '유동', amount: 0, return_rate: 0 },
  ]);
  const updateAsset = (idx, patch) => setAssets((xs) =>
    xs.map((a, i) => (i === idx ? { ...a, ...patch } : a))
  );
  const removeAsset = (idx) => setAssets((xs) => xs.filter((_, i) => i !== idx));

  const canAdvance = () => {
    if (step === 0) return name.trim() && salary > 0;
    if (step === 1) return targetAmount > 0 && targetYear >= new Date().getFullYear();
    return true;
  };

  const finish = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await setupUser(USER_ID, {
        name: name.trim(),
        department: department.trim() || null,
        salary: Math.round(salary),
        join_year: Number(joinYear) || null,
        target_amount: Math.round(targetAmount),
        target_year: Number(targetYear),
        start_amount: Math.round(startAmount || 0),
        starting_assets: assets
          .filter((a) => a.name.trim() && a.amount > 0)
          .map((a) => ({
            name: a.name.trim(),
            type: a.type,
            category: a.category,
            amount: Math.round(a.amount),
            return_rate: Number(a.return_rate) || 0,
          })),
      });
      onComplete?.();
    } catch (e) {
      const d = e?.response?.data?.detail;
      setError(typeof d === 'string' ? d : (d?.hint || e.message || '저장 실패'));
    } finally {
      setSubmitting(false);
    }
  };

  const steps = ['프로필', '재무 목표', '초기 자산'];

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center px-3 py-6"
         style={{ background: 'rgba(11,26,61,0.55)', backdropFilter: 'blur(4px)' }}>
      <div className="w-full max-w-2xl rounded-2xl flex flex-col overflow-hidden shadow-card-lg"
           style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`,
                    maxHeight: 'calc(100vh - 3rem)' }}>
        {/* header */}
        <div className="px-5 py-4 shrink-0"
             style={{ background: `linear-gradient(135deg, ${COLORS.primaryDark}, ${COLORS.primary})`,
                      color: COLORS.onPrimary }}>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-lg font-bold">WealthMate 시작하기</h2>
              <div className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.8)' }}>
                기본 정보를 입력하면 바로 대시보드가 활성화됩니다.
              </div>
            </div>
            <div className="text-xs font-semibold flex items-center gap-1">
              {steps.map((label, i) => (
                <span key={label}
                      className={`px-2 py-1 rounded-full ${i === step ? '' : 'opacity-60'}`}
                      style={{
                        background: i === step ? 'rgba(255,255,255,0.25)' : 'transparent',
                      }}>
                  {i + 1}. {label}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* body */}
        <div className="p-5 flex-1 min-h-0 overflow-y-auto" style={{ background: COLORS.bg }}>
          {step === 0 && (
            <div className="flex flex-col gap-4">
              <Field label="이름">
                <Input value={name} onChange={setName} placeholder="예: 변지환" />
              </Field>
              <Field label="부서/소속">
                <Input value={department} onChange={setDepartment} placeholder="예: 반도체연구소" />
              </Field>
              <Field label="월 실수령액 (세후)">
                <MoneyInput value={salary} onChange={setSalary} placeholder="예: 6,100,000" />
              </Field>
              <Field label="입사 연도">
                <Input type="number" value={joinYear} onChange={(v) => setJoinYear(v)}
                       placeholder="예: 2021" />
              </Field>
            </div>
          )}

          {step === 1 && (
            <div className="flex flex-col gap-4">
              <Field label="목표 자산 금액">
                <MoneyInput value={targetAmount} onChange={setTargetAmount}
                            placeholder="예: 100,000,000" />
              </Field>
              <Field label="목표 연도">
                <Input type="number" value={targetYear} onChange={(v) => setTargetYear(v)} />
              </Field>
              <Field label="현재 자산 (시작 시점 기준)"
                     hint="지금까지 모은 금액. 모르면 비워두면 됩니다.">
                <MoneyInput value={startAmount} onChange={setStartAmount}
                            placeholder="예: 20,000,000" />
              </Field>
              <div className="text-xs px-3 py-2 rounded" style={{ background: COLORS.primarySoft, color: COLORS.primary }}>
                목표까지 필요액: <b>{won(Math.max(0, targetAmount - startAmount))}</b>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="flex flex-col gap-3">
              <div className="text-xs" style={{ color: COLORS.textSecondary }}>
                지금 보유 중인 자산을 한 줄씩 추가하세요. 건너뛰고 나중에 에이전트에게
                말해서 추가할 수도 있습니다.
              </div>
              {assets.map((a, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center p-2 rounded"
                     style={{ background: COLORS.cardAlt, border: `1px solid ${COLORS.border}` }}>
                  <input type="text" value={a.name}
                         onChange={(e) => updateAsset(idx, { name: e.target.value })}
                         placeholder="자산명"
                         className="col-span-4 text-xs px-2 py-1.5 rounded"
                         style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, color: COLORS.text }} />
                  <select value={a.type}
                          onChange={(e) => updateAsset(idx, { type: e.target.value })}
                          className="col-span-3 text-xs px-2 py-1.5 rounded"
                          style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, color: COLORS.text }}>
                    {ASSET_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <select value={a.category}
                          onChange={(e) => updateAsset(idx, { category: e.target.value })}
                          className="col-span-2 text-xs px-2 py-1.5 rounded"
                          style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, color: COLORS.text }}>
                    <option value="유동">유동</option>
                    <option value="비유동">비유동</option>
                  </select>
                  <input type="text" inputMode="numeric"
                         value={a.amount ? Number(a.amount).toLocaleString('ko-KR') : ''}
                         onChange={(e) => updateAsset(idx, { amount: num(e.target.value) })}
                         placeholder="금액"
                         className="col-span-2 text-xs px-2 py-1.5 rounded text-right font-mono-num"
                         style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, color: COLORS.text }} />
                  <button onClick={() => removeAsset(idx)}
                          className="col-span-1 text-xs px-2 py-1.5 rounded"
                          style={{ background: 'transparent', color: COLORS.red,
                                   border: `1px solid ${COLORS.red}55` }}>✕</button>
                </div>
              ))}
              <button onClick={addAsset}
                      className="text-xs px-3 py-2 rounded font-semibold self-start"
                      style={{ background: 'transparent', color: COLORS.primary,
                               border: `1px dashed ${COLORS.primary}88` }}>
                + 자산 추가
              </button>
            </div>
          )}

          {error && (
            <div className="mt-3 text-xs px-3 py-2 rounded"
                 style={{ background: COLORS.redSoft, color: COLORS.red,
                          border: `1px solid ${COLORS.red}33` }}>
              {error}
            </div>
          )}
        </div>

        {/* footer */}
        <div className="px-5 py-3 flex items-center justify-between gap-2 shrink-0"
             style={{ borderTop: `1px solid ${COLORS.border}`, background: COLORS.cardAlt }}>
          <button
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0 || submitting}
            className="text-xs px-3 py-2 rounded font-semibold disabled:opacity-40"
            style={{ background: 'transparent', color: COLORS.textSecondary,
                     border: `1px solid ${COLORS.border}` }}>
            이전
          </button>
          <div className="text-[11px]" style={{ color: COLORS.subtext }}>
            {step + 1} / {steps.length}
          </div>
          {step < steps.length - 1 ? (
            <button
              onClick={() => canAdvance() && setStep((s) => s + 1)}
              disabled={!canAdvance() || submitting}
              className="text-xs px-4 py-2 rounded font-bold disabled:opacity-50"
              style={{ background: COLORS.primary, color: COLORS.onPrimary }}>
              다음
            </button>
          ) : (
            <button
              onClick={finish}
              disabled={submitting}
              className="text-xs px-4 py-2 rounded font-bold disabled:opacity-50"
              style={{ background: COLORS.primary, color: COLORS.onPrimary }}>
              {submitting ? '설정중…' : '완료하고 대시보드 열기'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
