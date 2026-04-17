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
import { createProxyMiddleware } from 'http-proxy-middleware';

dotenv.config();

const WEALTHMATE_BACKEND = process.env.WEALTHMATE_BACKEND_URL || 'http://127.0.0.1:8001';
const WEALTHMATE_DIST = path.resolve('./wealthmate/frontend/dist');

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
const defaultData = { 
    comments: [], 
    logins: [], 
    adminMemos: [], 
    leaderboard: [], 
    salarySettings: { 
        baseSalary: 58000000, 
        fixedExpenses: [
            {id: nanoid(), name: '월세', amount: 600000}, 
            {id: nanoid(), name: '통신비', amount: 100000}
        ], 
        taiRate: 100, 
        opiRate: 20 
    } 
};

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
        console.log('Database initialized and read successfully.');
    } catch (initDbError) {
        console.error('Fatal error initializing database:', initDbError);
        process.exit(1);
    }
}

// Initialize DB before starting the app
await initializeDatabase();

const app = express();
app.use(cors());

// ────────────────────────────────────────────────────────────────────
// WealthMate 서브앱: 반드시 express.json() 과 정적 라우트 앞에 프록시를 둬야
// body parsing이 먼저 일어나서 POST /chat 같은 요청이 깨지는 걸 막을 수 있다.
// ────────────────────────────────────────────────────────────────────
app.use(
  createProxyMiddleware({
    // pathFilter 로 매칭해야 http-proxy-middleware v3 에서 pathRewrite 가
    // 원본 URL (prefix 포함) 에 적용된다. app.use('/prefix', ...) 방식은 v3에서
    // Express 가 prefix 를 먼저 떼어내 rewrite 가 안 먹는 이슈가 있다.
    pathFilter: '/wealthmate/api',
    target: WEALTHMATE_BACKEND,
    changeOrigin: true,
    pathRewrite: { '^/wealthmate/api': '/api' },
    proxyTimeout: 180000,
    timeout: 180000,
    on: {
      error: (err, _req, res) => {
        if (res && !res.headersSent) {
          res.writeHead(502, { 'content-type': 'application/json' });
          res.end(JSON.stringify({
            error: 'WEALTHMATE_BACKEND_UNREACHABLE',
            detail: err?.message || 'unknown',
          }));
        }
      },
    },
  }),
);

// Built SPA assets (Vite build output)
app.use(
  '/wealthmate',
  express.static(WEALTHMATE_DIST, { fallthrough: true, index: false }),
);

app.use(express.json());
app.use(express.static(path.resolve()));

// SPA 라우팅: /wealthmate/* 가 정적 파일/프록시에 걸리지 않았다면 index.html
app.get(/^\/wealthmate(\/.*)?$/, (_req, res, next) => {
  const indexPath = path.join(WEALTHMATE_DIST, 'index.html');
  if (fs.existsSync(indexPath)) return res.sendFile(indexPath);
  return next();
});

// ──────────────────────── UTILS ──────────────────────────
async function verifyKakaoToken(token) {
  if (!token) return null;
  try {
    const res = await axios.get('https://kapi.kakao.com/v2/user/me', {
      headers: { Authorization: `Bearer ${token}` }
    });
    return {
      id   : res.data.id,
      name : res.data.properties?.nickname || 'Unknown',
      image: res.data.properties?.profile_image || ''
    };
  } catch (err) {
    return null;
  }
}

function isAdmin(token) {
  if (!token) return false;
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

// 로그인 이력 기록
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

// 관리자 로그인
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
  if (!isAdmin(token)) return res.status(401).json({ error: 'NOT_ADMIN' });

  try {
    await db.read();
    db.data.comments = db.data.comments || [];
    const initialLength = db.data.comments.length;
    db.data.comments = db.data.comments.filter((c) => c.id !== req.params.id);
    if (db.data.comments.length === initialLength) return res.status(404).json({ error: 'NOT_FOUND' });
    await db.write();
    res.json({ ok: true });
  } catch (dbError) {
    res.status(500).json({ error: 'DATABASE_ERROR' });
  }
});

// 리더보드
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
  const newEntry = { id: nanoid(), name: (name||'').slice(0,10), score, message: (message||'').slice(0,30), time: Date.now() };
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
    res.status(500).json({ error: 'DATABASE_ERROR' });
  }
});

adminMemosRouter.post('/', async (req, res) => {
  const { title, content, color } = req.body;
  const newMemo = { id: nanoid(), title, content, color: color || '#e9ecef', time: Date.now() };
  try {
    await db.read();
    db.data.adminMemos = db.data.adminMemos || [];
    db.data.adminMemos.push(newMemo);
    await db.write();
    res.status(201).json(newMemo);
  } catch (dbError) {
    res.status(500).json({ error: 'DATABASE_ERROR' });
  }
});

adminMemosRouter.put('/:id', async (req, res) => {
  const { title, content, color } = req.body;
  try {
    await db.read();
    db.data.adminMemos = db.data.adminMemos || [];
    const index = db.data.adminMemos.findIndex(m => m.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'NOT_FOUND' });
    
    db.data.adminMemos[index] = {
      ...db.data.adminMemos[index],
      title: title !== undefined ? title : db.data.adminMemos[index].title,
      content: content !== undefined ? content : db.data.adminMemos[index].content,
      color: color !== undefined ? color : db.data.adminMemos[index].color
    };
    await db.write();
    res.json(db.data.adminMemos[index]);
  } catch (dbError) {
    res.status(500).json({ error: 'DATABASE_ERROR' });
  }
});

adminMemosRouter.delete('/:id', async (req, res) => {
  try {
    await db.read();
    db.data.adminMemos = (db.data.adminMemos || []).filter(m => m.id !== req.params.id);
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
    res.json(db.data.salarySettings || defaultData.salarySettings);
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

// SPA Fallback
app.get('*', (_, res) => {
    res.sendFile(path.join(path.resolve(), 'index.html'));
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`🚀 Server ready @ ${PORT}`);
});
