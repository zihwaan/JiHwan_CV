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
    // Decide if you want to throw or exit if directory creation fails.
    // For now, we'll let LowDB attempt to handle file creation.
}

const dbFile = path.join(DATA_DIR, 'db.json');
console.log(`Using database file: ${dbFile}`);
const defaultData = { comments: [], logins: [], adminMemos: [] };
const adapter = new JSONFile(dbFile);
const db = new Low(adapter, defaultData);

async function initializeDatabase() {
    try {
        await db.read();
        // Ensure db.data is not null and has the default structure if the file was empty or just created
        db.data = db.data || { ...defaultData };
        // Ensure all top-level keys exist
        for (const key in defaultData) {
            if (!db.data[key]) {
                db.data[key] = defaultData[key];
            }
        }
        // LowDB v6 doesn't automatically write if db.data was just initialized from defaultData.
        // Let's do an initial write if the file was newly created by JSONFile adapter
        // This part is a bit tricky, as JSONFile creates an empty file if it doesn't exist.
        // A more robust way might be to check if dbFile existed before new Low().
        // For now, we assume if db.data was null after read, it means it's new or empty.
        // However, db.read() should fill db.data if the file exists and is valid JSON.
        // If file doesn't exist, adapter creates it, db.read() might result in db.data being null (older versions)
        // or the defaultData (newer adapter behavior).
        // The `db.data ||= defaultData` or `db.data = db.data || defaultData` is the key.
        // If after db.read(), db.data is still pointing to the initial defaultData object by reference
        // (or was null and then assigned defaultData), an initial write might be needed
        // if the file was truly non-existent or empty.
        // However, with the new Low(adapter, defaultData), db.data should be populated
        // with defaultData if the file is empty/new.
        // A write here ensures the file is created with default structure if it was completely missing.
        // await db.write(); // Consider if this is needed or if first actual data change handles it.
        console.log('Database initialized and read successfully.');
    } catch (initDbError) {
        console.error('Fatal error initializing database:', initDbError);
        // If the database can't be read or initialized, the app likely can't function.
        // You might want to exit the process or implement a more graceful fallback.
        process.exit(1); // Example: exit if DB is critical
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
    console.error('Database read error in GET /api/comments:', dbError);
    res.status(500).json({ error: 'DATABASE_READ_ERROR', message: '서버에서 댓글을 읽어오는 중 오류가 발생했습니다.' });
  }
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
  try {
    await db.read();
    db.data.comments = db.data.comments || [];
    db.data.comments.push(comment);
    await db.write();
    res.status(201).json({ ok: true });
  } catch (dbError) {
    console.error('Database write error in POST /api/comments:', dbError);
    res.status(500).json({ error: 'DATABASE_WRITE_ERROR', message: '서버에 댓글을 저장하는 중 오류가 발생했습니다.' });
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
    console.error('Database write error in POST /api/logins:', dbError);
    res.status(500).json({ error: 'DATABASE_WRITE_ERROR', message: '서버에 로그인 이력을 저장하는 중 오류가 발생했습니다.' });
  }
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

  try {
    await db.read();
    db.data.logins = db.data.logins || [];
    res.json(db.data.logins.sort((a, b) => b.time - a.time));
  } catch (dbError) {
    console.error('Database read error in GET /api/admin/logins:', dbError);
    res.status(500).json({ error: 'DATABASE_READ_ERROR', message: '서버에서 로그인 이력을 읽어오는 중 오류가 발생했습니다.' });
  }
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
    if (db.data.comments.length === initialLength) {
        return res.status(404).json({ error: 'COMMENT_NOT_FOUND' });
    }
    await db.write();
    res.json({ ok: true });
  } catch (dbError) {
    console.error('Database error in DELETE /api/comments/:id:', dbError);
    res.status(500).json({ error: 'DATABASE_ERROR', message: '서버에서 댓글 삭제 중 오류가 발생했습니다.' });
  }
});

// ────────────────── ADMIN MEMOS API ────────────────────
const adminMemosRouter = express.Router();

adminMemosRouter.use((req, res, next) => {
  const token = (req.headers.authorization || '').split(' ')[1];
  if (!isAdmin(token)) {
    return res.status(401).json({ error: 'NOT_ADMIN', message: '관리자 권한이 필요합니다.' });
  }
  next();
});

adminMemosRouter.get('/', async (req, res) => {
  try {
    await db.read();
    db.data.adminMemos = db.data.adminMemos || [];
    const memos = db.data.adminMemos.sort((a, b) => b.time - a.time);
    res.json(memos);
  } catch (dbError) {
    console.error('Database read error in GET /api/admin/memos:', dbError);
    res.status(500).json({ error: 'DATABASE_READ_ERROR', message: '서버에서 메모를 읽어오는 중 오류가 발생했습니다.' });
  }
});

adminMemosRouter.post('/', async (req, res) => {
  const { title, content, color } = req.body;
  if (!title?.trim() || !content?.trim()) {
    return res.status(400).json({ error: 'TITLE_AND_CONTENT_REQUIRED', message: '제목과 내용은 필수입니다.' });
  }
  const newMemo = {
    id: nanoid(),
    title: title.trim(),
    content: content.trim(),
    color: color || '#e9ecef', // Updated default color
    time: Date.now(),
  };
  try {
    await db.read(); // Ensure latest data
    db.data.adminMemos = db.data.adminMemos || [];
    db.data.adminMemos.push(newMemo);
    await db.write();
    res.status(201).json(newMemo);
  } catch (dbError) {
    console.error('Database write error in POST /api/admin/memos:', dbError);
    res.status(500).json({ error: 'DATABASE_WRITE_ERROR', message: '서버에 메모를 저장하는 중 오류가 발생했습니다.' });
  }
});

adminMemosRouter.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { title, content, color } = req.body;

  if (title !== undefined && !title.trim()) {
    return res.status(400).json({ error: 'TITLE_CANNOT_BE_EMPTY', message: '제목은 비워둘 수 없습니다.' });
  }
  if (content !== undefined && !content.trim()) {
    return res.status(400).json({ error: 'CONTENT_CANNOT_BE_EMPTY', message: '내용은 비워둘 수 없습니다.' });
  }

  try {
    await db.read();
    db.data.adminMemos = db.data.adminMemos || [];
    const memoIndex = db.data.adminMemos.findIndex((memo) => memo.id === id);

    if (memoIndex === -1) {
      return res.status(404).json({ error: 'MEMO_NOT_FOUND', message: '해당 ID의 메모를 찾을 수 없습니다.' });
    }

    const originalMemo = db.data.adminMemos[memoIndex];
    const updatedMemo = {
      ...originalMemo,
      title: title?.trim() !== undefined ? title.trim() : originalMemo.title,
      content: content?.trim() !== undefined ? content.trim() : originalMemo.content,
      color: color !== undefined ? color : originalMemo.color,
      time: Date.now(),
    };
    
    // This extra check might be redundant if the initial checks for !title.trim() are sufficient
    // but kept for explicitness if only one field is updated.
    if (updatedMemo.title === "" && originalMemo.title !== "") {
        return res.status(400).json({ error: 'TITLE_CANNOT_BE_EMPTY_ON_UPDATE', message: '수정 시 제목을 비울 수 없습니다.' });
    }
    if (updatedMemo.content === "" && originalMemo.content !== "") {
        return res.status(400).json({ error: 'CONTENT_CANNOT_BE_EMPTY_ON_UPDATE', message: '수정 시 내용을 비울 수 없습니다.' });
    }

    db.data.adminMemos[memoIndex] = updatedMemo;
    await db.write();
    res.json(updatedMemo);
  } catch (dbError) {
    console.error(`Database error in PUT /api/admin/memos/${id}:`, dbError);
    res.status(500).json({ error: 'DATABASE_ERROR', message: '서버에서 메모 업데이트 중 오류가 발생했습니다.' });
  }
});

adminMemosRouter.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await db.read();
    db.data.adminMemos = db.data.adminMemos || [];
    const initialLength = db.data.adminMemos.length;
    db.data.adminMemos = db.data.adminMemos.filter((memo) => memo.id !== id);

    if (db.data.adminMemos.length === initialLength) {
      return res.status(404).json({ error: 'MEMO_NOT_FOUND', message: '삭제할 메모를 찾을 수 없습니다.' });
    }
    await db.write();
    res.json({ ok: true, message: '메모가 성공적으로 삭제되었습니다.' });
  } catch (dbError) {
    console.error(`Database error in DELETE /api/admin/memos/${id}:`, dbError);
    res.status(500).json({ error: 'DATABASE_ERROR', message: '서버에서 메모 삭제 중 오류가 발생했습니다.' });
  }
});

app.use('/api/admin/memos', adminMemosRouter);

// ─────────────────── SPA Fallback ──────────────────────
app.get('*', (_, res) => {
    const indexPath = path.join(path.resolve(), 'index.html');
    // Optional: Check if index.html exists
    // fs.access(indexPath, fs.constants.F_OK, (err) => {
    //    if (err) {
    //        console.error("index.html not found for SPA fallback:", err);
    //        return res.status(404).send('Client application not found.');
    //    }
    //    res.sendFile(indexPath);
    // });
    res.sendFile(indexPath);
});


// ──────────────────── SERVER ON ────────────────────────
const PORT = process.env.PORT || 8080;
const HOST_MSG = DOMAIN || `http://localhost:${PORT}`;

app.listen(PORT, () => {
  console.log(`🚀 Server ready @ ${HOST_MSG}`);
  console.log(`Serving static files from: ${path.resolve()}`);
  console.log(`Database directory: ${DATA_DIR}`);
  console.log(`Database file: ${dbFile}`);
});