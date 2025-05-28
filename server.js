// server.js
import dotenv from 'dotenv';
import express from 'express';
import axios from 'axios';
import cors from 'cors';
import path from 'path';
import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import { nanoid } from 'nanoid';
import jwt from 'jsonwebtoken';

dotenv.config();

const DOMAIN = process.env.DOMAIN ? `https://${process.env.DOMAIN}` : ``;

// DB 초기화 (JSON 파일 기반, 매우 경량)
// lowdb v6+: 두 번째 인수로 "defaultData" 를 넘겨야 초기 파일이 없을 때 에러가 나지 않습니다.
const db = new Low(new JSONFile('db.json'), { comments: [] });
await db.read();
db.data ||= { comments: [] };

const app = express();
app.use(cors({ origin: DOMAIN || true }));
app.use(express.json());
app.use(express.static(path.resolve()));

// ──────────────────────── UTILS ────────────────────────
async function verifyKakaoToken(token) {
  try {
    const { data } = await axios.get('https://kapi.kakao.com/v2/user/me', {
      headers: { Authorization: `Bearer ${token}` }
    });
    return data.properties?.nickname || '익명';
  } catch (_) {
    return null; // 토큰 오류 → 401 반환용
  }
}

// ──────────────────────── API ──────────────────────────
// 전체 댓글 조회
app.get('/api/comments', async (_, res) => {
  await db.read();
  res.json(db.data.comments.sort((a, b) => b.time - a.time));
});

// 댓글 등록 (Kakao 토큰 필요)
app.post('/api/comments', async (req, res) => {
  const token = (req.headers.authorization || '').split(' ')[1];
  const name = await verifyKakaoToken(token);
  if (!name) return res.status(401).json({ error: 'INVALID_TOKEN' });

  const { text } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: 'TEXT_REQUIRED' });

  const comment = { id: nanoid(), name, text: text.trim(), time: Date.now() };
  db.data.comments.push(comment);
  await db.write();
  res.json({ ok: true });
});

// 관리자 로그인 (비밀번호 → JWT)
app.post('/api/admin/login', (req, res) => {
  if (req.body.password === process.env.ADMIN_PASS) {
    const token = jwt.sign({ admin: true }, process.env.ADMIN_PASS, { expiresIn: '1h' });
    return res.json({ token });
  }
  res.status(401).json({ error: 'WRONG_PASS' });
});

// 댓글 삭제 (관리자 권한)
app.delete('/api/comments/:id', async (req, res) => {
  const token = (req.headers.authorization || '').split(' ')[1];
  try {
    jwt.verify(token, process.env.ADMIN_PASS);
  } catch (_) {
    return res.status(401).json({ error: 'NOT_ADMIN' });
  }
  await db.read();
  db.data.comments = db.data.comments.filter((c) => c.id !== req.params.id);
  await db.write();
  res.json({ ok: true });
});

// SPA Fallback (새로고침 대응)
app.get('*', (_, res) => res.sendFile(path.join(path.resolve(), 'index.html')));

const PORT = process.env.PORT || 3000;
const HOST_MSG = DOMAIN || `http://localhost:${PORT}`;
app.listen(PORT, () => console.log(`🚀 Server ready @ ${HOST_MSG}`));