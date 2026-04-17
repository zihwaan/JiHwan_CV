import axios from 'axios';

// 같은 오리진(zihwan.com)에서 서빙되므로 상대경로. Express가 /wealthmate/api/* 를
// FastAPI(127.0.0.1:8001) 로 프록시하면서 prefix 를 벗겨준다.
const API = axios.create({
  baseURL: '/wealthmate/api',
  timeout: 180000, // CLI fallback은 2-step (planner + responder) 으로 1~2분 걸릴 수 있음
});

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

export const USER_ID = 'user-jihwan-001';
