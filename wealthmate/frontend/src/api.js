import axios from 'axios';

// 같은 오리진(zihwan.com)에서 서빙되므로 상대경로. Express가 /wealthmate/api/* 를
// FastAPI(127.0.0.1:8001) 로 프록시하면서 prefix 를 벗겨준다.
const API = axios.create({
  baseURL: '/wealthmate/api',
  timeout: 180000, // CLI fallback은 2-step (planner + responder) 으로 1~2분 걸릴 수 있음
});

// ────────────────────────────────────────────────────────────────────
// Access PIN gate — for production deploys where the backend has
// WEALTHMATE_ACCESS_PIN configured. Frontend stores the PIN in
// localStorage and sends it on every request. If a 401 with header
// `x-wm-pin-required` comes back, we prompt the user once and retry.
// ────────────────────────────────────────────────────────────────────
const PIN_KEY = 'wm:access_pin';
export const getStoredPin = () => {
  try { return window.localStorage.getItem(PIN_KEY) || ''; } catch { return ''; }
};
export const setStoredPin = (pin) => {
  try {
    if (pin) window.localStorage.setItem(PIN_KEY, pin);
    else window.localStorage.removeItem(PIN_KEY);
  } catch {}
};

API.interceptors.request.use((config) => {
  const pin = getStoredPin();
  if (pin) config.headers['x-wm-pin'] = pin;
  return config;
});

// When the SPA gets a 401 because no / stale PIN, bounce back to the hub
// where the shared Bootstrap modal handles masked-input PIN entry. This
// keeps the UX identical to the admin cards (no ugly native prompt).
let _redirectingToHub = false;
function redirectToHubForPin() {
  if (_redirectingToHub) return;
  _redirectingToHub = true;
  setStoredPin('');
  try {
    window.location.replace('/?locked=wm');
  } catch {
    window.location.href = '/?locked=wm';
  }
}

API.interceptors.response.use(
  (resp) => resp,
  async (err) => {
    const status = err?.response?.status;
    const requiresPin = err?.response?.headers?.['x-wm-pin-required'];
    const reason = err?.response?.data?.detail?.reason;
    if (status === 401 && (requiresPin || reason === 'pin_required' || reason === 'pin_mismatch')) {
      redirectToHubForPin();
      return new Promise(() => {}); // swallow — we're navigating away
    }
    throw err;
  },
);

export const getGateStatus = () => API.get('/auth/gate_status');

export const getDashboard = (userId) => API.get(`/dashboard/${userId}`);
export const bulkUpsertExpenses = (userId, rows) =>
  API.post(`/expenses/${userId}/bulk`, { rows });

// extra (non-salary) incomes — bonuses, allowances, one-off payouts
export const listIncomes = (userId, month) =>
  API.get(`/incomes/${userId}`, { params: month ? { month } : {} });
export const addIncome = (userId, { month, label, amount }) =>
  API.post(`/incomes/${userId}`, { month, label, amount });
export const deleteIncome = (userId, incomeId) =>
  API.delete(`/incomes/${userId}/${incomeId}`);
export const sendChat = (userId, message) =>
  API.post('/chat', { user_id: userId, message });

// agent knowledge / RAG inspection
export const getContext = (userId) => API.get(`/context/${userId}`);

// profile
export const updateProfile = (userId, body) => API.put(`/profile/${userId}`, body);

// goal
export const getGoal = (userId) => API.get(`/goals/${userId}`);
export const updateGoal = (userId, body) => API.put(`/goals/${userId}`, body);

// rules
export const listRules = (userId) => API.get(`/rules/${userId}`);
export const createRule = (userId, content) =>
  API.post(`/rules/${userId}`, { content });
export const updateRule = (userId, ruleId, content) =>
  API.put(`/rules/${userId}/${ruleId}`, { content });
export const deleteRule = (userId, ruleId) =>
  API.delete(`/rules/${userId}/${ruleId}`);

// auth — API-key-only flow with named multi-key storage
export const getAuthStatus = () => API.get('/auth/status');
export const listKeys = () => API.get('/auth/keys');
export const createKey = (name, apiKey, activate = true) =>
  API.post('/auth/keys', { name, api_key: apiKey, activate });
export const activateKey = (id) => API.post(`/auth/keys/${id}/activate`);
export const deleteKey = (id) => API.delete(`/auth/keys/${id}`);

// lifecycle — onboarding wizard, data export, reset
export const setupUser = (userId, body) => API.post(`/manage/setup/${userId}`, body);
export const exportUser = (userId) => API.get(`/manage/export/${userId}`);
export const resetUser = (userId) => API.post(`/manage/reset/${userId}`, { confirm: userId });

export const USER_ID = 'user-jihwan-001';
