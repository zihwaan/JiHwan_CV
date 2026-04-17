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
// ────────────────────────────────────────────────────────────────────
const DATA_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH || path.resolve('./data');
try {
    if (!fs.existsSync(DATA_DIR)) {
        await fs.promises.mkdir(DATA_DIR, { recursive: true });
        console.log(`Data directory created: ${DATA_DIR}`);
    }
} catch (mkdirError) {
    console.error(`Error creating data directory ${DATA_DIR}:`, mkdirError);
}

const dbFile = path.join(DATA_DIR, 'db.json');
console.log(`Using database file: ${dbFile}`);
const defaultData = { comments: [], logins: [], adminMemos: [], leaderboard: [], salarySettings: { monthlyData: [] } };
const adapter = new JSONFile(dbFile);
const db = new Low(adapter, defaultData);

async function initializeDatabase() {
    try {
        await db.read();
        db.data = db.data || { ...defaultData };
        for (const key in defaultData) {
            if (!db.data[key]) {
                db.data[key] = defaultData[key];
            }
        }
        await db.write();
        console.log('Database initialized and read successfully.');
    } catch (initDbError) {
        console.error('Fatal error initializing database:', initDbError);
        process.exit(1);
    }
}

// Initialize DB before starting the app
await initializeDatabase();


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
    return null;
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
  try {
    await db.read();
    db.data.comments = db.data.comments || [];
    res.json(db.data.comments.sort((a, b) => b.time - a.time));
  } catch (dbError) {
    res.status(500).json({ error: 'DATABASE_READ_ERROR' });
  }
});

// 댓글 등록
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
  try {
    await db.read();
    db.data.comments = db.data.comments || [];
    db.data.comments.push(comment);
    await db.write();
    res.status(201).json({ ok: true });
  } catch (dbError) {
    res.status(500).json({ error: 'DATABASE_WRITE_ERROR' });
  }
});

// ────────────────── 로그인 이력 기록 ───────────────────
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
  try {
    await db.read();
    db.data.logins = db.data.logins || [];
    db.data.logins.push(record);
    await db.write();
    res.status(201).json({ ok: true });
  } catch (dbError) {
    res.status(500).json({ error: 'DATABASE_WRITE_ERROR' });
  }
});

app.post('/api/admin/login', (req, res) => {
  if (req.body.password === process.env.ADMIN_PASS) {
    const token = jwt.sign({ admin: true }, process.env.ADMIN_PASS, { expiresIn: '1h' });
    return res.json({ token });
  }
  res.status(401).json({ error: 'WRONG_PASS' });
});

app.get('/api/admin/logins', async (req, res) => {
  const token = (req.headers.authorization || '').split(' ')[1];
  if (!isAdmin(token)) return res.status(401).json({ error: 'NOT_ADMIN' });

  try {
    await db.read();
    db.data.logins = db.data.logins || [];
    res.json(db.data.logins.sort((a, b) => b.time - a.time));
  } catch (dbError) {
    res.status(500).json({ error: 'DATABASE_READ_ERROR' });
  }
});

app.delete('/api/comments/:id', async (req, res) => {
  const token = (req.headers.authorization || '').split(' ')[1];
  if (!isAdmin(token)) return res.status(401).json({ error: 'NOT_ADMIN' });

  try {
    await db.read();
    db.data.comments = db.data.comments || [];
    const initialLength = db.data.comments.length;
    db.data.comments = db.data.comments.filter((c) => c.id !== req.params.id);
    if (db.data.comments.length === initialLength) return res.status(404).json({ error: 'COMMENT_NOT_FOUND' });
    await db.write();
    res.json({ ok: true });
  } catch (dbError) {
    res.status(500).json({ error: 'DATABASE_ERROR' });
  }
});

// ────────────────── LEADERBOARD API ────────────────────
app.get('/api/leaderboard', async (req, res) => {
  try {
    await db.read();
    db.data.leaderboard = db.data.leaderboard || [];
    const topScores = db.data.leaderboard.sort((a, b) => b.score - a.score).slice(0, 10);
    res.json(topScores);
  } catch (dbError) {
    res.status(500).json({ error: 'DATABASE_READ_ERROR' });
  }
});

app.post('/api/leaderboard', async (req, res) => {
  const { name, score, message } = req.body;
  if (!name?.trim() || !message?.trim() || typeof score !== 'number') {
    return res.status(400).json({ error: 'INVALID_DATA' });
  }

  const newEntry = {
    id: nanoid(),
    name: name.trim().slice(0, 10),
    score,
    message: message.trim().slice(0, 30),
    time: Date.now(),
  };

  try {
    await db.read();
    db.data.leaderboard = db.data.leaderboard || [];
    db.data.leaderboard.push(newEntry);
    await db.write();
    res.status(201).json(newEntry);
  } catch (dbError) {
    res.status(500).json({ error: 'DATABASE_WRITE_ERROR' });
  }
});

// ────────────────── ADMIN MEMOS API ────────────────────
const adminMemosRouter = express.Router();

adminMemosRouter.use((req, res, next) => {
  const token = (req.headers.authorization || '').split(' ')[1];
  if (!isAdmin(token)) return res.status(401).json({ error: 'NOT_ADMIN' });
  next();
});

adminMemosRouter.get('/', async (req, res) => {
  try {
    await db.read();
    db.data.adminMemos = db.data.adminMemos || [];
    res.json(db.data.adminMemos.sort((a, b) => b.time - a.time));
  } catch (dbError) {
    res.status(500).json({ error: 'DATABASE_READ_ERROR' });
  }
});

adminMemosRouter.post('/', async (req, res) => {
  const { title, content, color } = req.body;
  const newMemo = {
    id: nanoid(),
    title: title.trim(),
    content: content.trim(),
    color: color || '#e9ecef',
    time: Date.now(),
  };
  try {
    await db.read();
    db.data.adminMemos = db.data.adminMemos || [];
    db.data.adminMemos.push(newMemo);
    await db.write();
    res.status(201).json(newMemo);
  } catch (dbError) {
    res.status(500).json({ error: 'DATABASE_WRITE_ERROR' });
  }
});

adminMemosRouter.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { title, content, color } = req.body;

  try {
    await db.read();
    db.data.adminMemos = db.data.adminMemos || [];
    const memoIndex = db.data.adminMemos.findIndex((memo) => memo.id === id);

    if (memoIndex === -1) return res.status(404).json({ error: 'MEMO_NOT_FOUND' });

    const originalMemo = db.data.adminMemos[memoIndex];
    const updatedMemo = {
      ...originalMemo,
      title: title?.trim() !== undefined ? title.trim() : originalMemo.title,
      content: content?.trim() !== undefined ? content.trim() : originalMemo.content,
      color: color !== undefined ? color : originalMemo.color,
      time: Date.now(),
    };

    db.data.adminMemos[memoIndex] = updatedMemo;
    await db.write();
    res.json(updatedMemo);
  } catch (dbError) {
    res.status(500).json({ error: 'DATABASE_ERROR' });
  }
});

adminMemosRouter.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await db.read();
    db.data.adminMemos = db.data.adminMemos || [];
    const initialLength = db.data.adminMemos.length;
    db.data.adminMemos = db.data.adminMemos.filter((memo) => memo.id !== id);

    if (db.data.adminMemos.length === initialLength) return res.status(404).json({ error: 'MEMO_NOT_FOUND' });
    await db.write();
    res.json({ ok: true });
  } catch (dbError) {
    res.status(500).json({ error: 'DATABASE_ERROR' });
  }
});

app.use('/api/admin/memos', adminMemosRouter);

// ────────────────── SALARY SETTINGS API ────────────────────
app.get('/api/admin/salary-settings', async (req, res) => {
  const token = (req.headers.authorization || '').split(' ')[1];
  if (!isAdmin(token)) return res.status(401).json({ error: 'NOT_ADMIN' });
  try {
    await db.read();
    res.json(db.data.salarySettings || { monthlyData: [] });
  } catch (dbError) {
    res.status(500).json({ error: 'DATABASE_ERROR' });
  }
});

app.post('/api/admin/salary-settings', async (req, res) => {
  const token = (req.headers.authorization || '').split(' ')[1];
  if (!isAdmin(token)) return res.status(401).json({ error: 'NOT_ADMIN' });
  try {
    await db.read();
    db.data.salarySettings = req.body;
    await db.write();
    res.json({ ok: true });
  } catch (dbError) {
    res.status(500).json({ error: 'DATABASE_ERROR' });
  }
});

// ─────────────────── SPA Fallback ──────────────────────
app.get('*', (_, res) => {
    res.sendFile(path.join(path.resolve(), 'index.html'));
});

// ──────────────────── SERVER ON ────────────────────────
const PORT = process.env.PORT || 8080;
const HOST_MSG = DOMAIN || `http://localhost:${PORT}`;

app.listen(PORT, () => {
  console.log(`🚀 Server ready @ ${HOST_MSG}`);
});
