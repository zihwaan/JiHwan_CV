// server.js
import dotenv from 'dotenv';
import fs from 'fs';
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

// ────────────────────────────────────────────────────────────────────
// DB 초기화 (JSON 파일 기반, 매우 경량)
// lowdb v6+: 두 번째 인수로 "defaultData" 를 넘겨야 초기 파일이 없을 때 에러가 나지 않습니다.
// ────────────────────────────────────────────────────────────────────
const DATA_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH || path.resolve('./data');
await fs.promises.mkdir(DATA_DIR, { recursive: true });   // 폴더가 없으면 생성
const dbFile = path.join(DATA_DIR, 'db.json');
const db = new Low(new JSONFile(dbFile), { comments: [], logins: [], adminMemos: [] });

await db.read();
db.data ||= { comments: [], logins: [], adminMemos: [] };

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

    let img = data.properties?.profile_image ||
              data.kakao_account?.profile?.profile_image_url || '';
    img = img.replace(/^http:\/\//, 'https://');

    return {
      name  : data.properties?.nickname ||
              data.kakao_account?.profile?.nickname ||
              '익명',
      image : img || '/assets/default_avatar.png'
    };
  } catch (_) {
    return null; // 토큰 오류 → 401 반환용
  }
}

function isAdmin(token) {
  try {
    jwt.verify(token, process.env.ADMIN_PASS);
    return true;
  } catch (_) {
    return false;
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
  const user = await verifyKakaoToken(token);
  if (!user) return res.status(401).json({ error: 'INVALID_TOKEN' });

  const { text } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: 'TEXT_REQUIRED' });

  const comment = {
    id   : nanoid(),
    name : user.name,
    image: user.image,
    text : text.trim(),
    time : Date.now()
  };
  db.data.comments.push(comment);
  await db.write();
  res.json({ ok: true });
});

// ────────────────── 로그인 이력 기록 ───────────────────
// 클라이언트에서 Kakao 로그인 성공 후 accessToken 을 보내면 기록
app.post('/api/logins', async (req, res) => {
  const token = (req.headers.authorization || '').split(' ')[1];
  const user = await verifyKakaoToken(token);
  if (!user) return res.status(401).json({ error: 'INVALID_TOKEN' });

  const record = {
    id   : nanoid(),
    name : user.name,
    image: user.image,
    time : Date.now(),
    msg  : '로그인되었습니다.'
  };
  db.data.logins.push(record);
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

// 로그인 이력 조회 (관리자 전용)
app.get('/api/admin/logins', async (req, res) => {
  const token = (req.headers.authorization || '').split(' ')[1];
  if (!isAdmin(token)) return res.status(401).json({ error: 'NOT_ADMIN' });

  await db.read();
  res.json(db.data.logins.sort((a, b) => b.time - a.time));
});

// 댓글 삭제 (관리자 권한)
app.delete('/api/comments/:id', async (req, res) => {
  const token = (req.headers.authorization || '').split(' ')[1];
  if (!isAdmin(token)) return res.status(401).json({ error: 'NOT_ADMIN' });

  await db.read();
  db.data.comments = db.data.comments.filter((c) => c.id !== req.params.id);
  await db.write();
  res.json({ ok: true });
});

// ────────────────── ADMIN MEMOS API ────────────────────
const adminMemosRouter = express.Router();

// Middleware to check for admin privileges for all memo routes
adminMemosRouter.use((req, res, next) => {
  const token = (req.headers.authorization || '').split(' ')[1];
  if (!isAdmin(token)) {
    return res.status(401).json({ error: 'NOT_ADMIN' });
  }
  next();
});

// GET /api/admin/memos - Fetch all memos
adminMemosRouter.get('/', async (req, res) => {
  await db.read();
  const memos = db.data.adminMemos.sort((a, b) => b.time - a.time);
  res.json(memos);
});

// POST /api/admin/memos - Create a new memo
adminMemosRouter.post('/', async (req, res) => {
  const { title, content, color } = req.body;

  if (!title?.trim() || !content?.trim()) {
    return res.status(400).json({ error: 'TITLE_AND_CONTENT_REQUIRED' });
  }

  const newMemo = {
    id: nanoid(),
    title: title.trim(),
    content: content.trim(),
    color: color || '#FFFFCC', // Default color if not provided
    time: Date.now(),
  };

  db.data.adminMemos.push(newMemo);
  await db.write();
  res.json(newMemo);
});

// PUT /api/admin/memos/:id - Update an existing memo
adminMemosRouter.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { title, content, color } = req.body;

  if (title !== undefined && !title.trim()) {
    return res.status(400).json({ error: 'TITLE_CANNOT_BE_EMPTY' });
  }
  if (content !== undefined && !content.trim()) {
    return res.status(400).json({ error: 'CONTENT_CANNOT_BE_EMPTY' });
  }

  await db.read();
  const memoIndex = db.data.adminMemos.findIndex((memo) => memo.id === id);

  if (memoIndex === -1) {
    return res.status(404).json({ error: 'MEMO_NOT_FOUND' });
  }

  const updatedMemo = {
    ...db.data.adminMemos[memoIndex],
    title: title?.trim() !== undefined ? title.trim() : db.data.adminMemos[memoIndex].title,
    content: content?.trim() !== undefined ? content.trim() : db.data.adminMemos[memoIndex].content,
    color: color !== undefined ? color : db.data.adminMemos[memoIndex].color,
    time: Date.now(), // Update timestamp to reflect modification time
  };
  
  // Ensure title and content are not empty after update if they were intended to be updated
  if (title?.trim() === "" && db.data.adminMemos[memoIndex].title !== "") {
      return res.status(400).json({ error: 'TITLE_CANNOT_BE_EMPTY_ON_UPDATE' });
  }
  if (content?.trim() === "" && db.data.adminMemos[memoIndex].content !== "") {
      return res.status(400).json({ error: 'CONTENT_CANNOT_BE_EMPTY_ON_UPDATE' });
  }


  db.data.adminMemos[memoIndex] = updatedMemo;
  await db.write();
  res.json(updatedMemo);
});

// DELETE /api/admin/memos/:id - Delete a memo
adminMemosRouter.delete('/:id', async (req, res) => {
  const { id } = req.params;
  await db.read();
  const initialLength = db.data.adminMemos.length;
  db.data.adminMemos = db.data.adminMemos.filter((memo) => memo.id !== id);

  if (db.data.adminMemos.length === initialLength) {
    return res.status(404).json({ error: 'MEMO_NOT_FOUND' });
  }

  await db.write();
  res.json({ ok: true });
});

app.use('/api/admin/memos', adminMemosRouter);

// ─────────────────── SPA Fallback ──────────────────────
app.get('*', (_, res) => res.sendFile(path.join(path.resolve(), 'index.html')));

// ──────────────────── SERVER ON ────────────────────────
const PORT = process.env.PORT || 8080;
const HOST_MSG = DOMAIN;
app.listen(PORT, () => console.log(`🚀 Server ready @ ${HOST_MSG}`));
