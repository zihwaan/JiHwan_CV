// server.js
import dotenv from 'dotenv';
import express from 'express';
import axios from 'axios';
import cors from 'cors';
import path from 'path';
import mongoose from 'mongoose';
import { nanoid } from 'nanoid';
import jwt from 'jsonwebtoken';

dotenv.config();

const DOMAIN = process.env.DOMAIN ? `https://${process.env.DOMAIN}` : ``;
const PORT = process.env.PORT || 8080;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/jihwan_cv';

// ────────────────────────────────────────────────────────────────────
// MongoDB 연결 및 스키마 정의
// ────────────────────────────────────────────────────────────────────
mongoose.connect(MONGODB_URI)
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => {
    console.error('❌ MongoDB Connection Error:', err);
    process.exit(1);
  });

const commentSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: String,
  image: String,
  text: String,
  time: Number
});

const loginSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: String,
  image: String,
  time: Number,
  msg: String
});

const leaderboardSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: String,
  score: Number,
  message: String,
  time: Number
});

const adminMemoSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  title: String,
  content: String,
  color: String,
  time: Number
});

const Comment = mongoose.model('Comment', commentSchema);
const Login = mongoose.model('Login', loginSchema);
const Leaderboard = mongoose.model('Leaderboard', leaderboardSchema);
const AdminMemo = mongoose.model('AdminMemo', adminMemoSchema);

const gameScoreSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  userId: { type: String, required: true }, // Kakao ID or unique identifier
  name: String,
  image: String,
  score: Number,
  message: String,
  time: Number
});
const GameScore = mongoose.model('GameScore', gameScoreSchema);

// ────────────────────────────────────────────────────────────────────
// Express 앱 설정
// ────────────────────────────────────────────────────────────────────
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
      id: data.id.toString(),
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
    const comments = await Comment.find().sort({ time: -1 });
    res.json(comments);
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

  try {
    const comment = new Comment({
      id: nanoid(),
      name: user.name,
      image: user.image,
      text: text.trim(),
      time: Date.now()
    });
    await comment.save();
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

  try {
    const record = new Login({
      id: nanoid(),
      name: user.name,
      image: user.image,
      time: Date.now(),
      msg: '로그인되었습니다.'
    });
    await record.save();
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
    const logins = await Login.find().sort({ time: -1 });
    res.json(logins);
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
    const result = await Comment.findOneAndDelete({ id: req.params.id });
    if (!result) {
        return res.status(404).json({ error: 'COMMENT_NOT_FOUND' });
    }
    res.json({ ok: true });
  } catch (dbError) {
    console.error('Database error in DELETE /api/comments/:id:', dbError);
    res.status(500).json({ error: 'DATABASE_ERROR', message: '서버에서 댓글 삭제 중 오류가 발생했습니다.' });
  }
});

// ────────────────── LEADERBOARD API ────────────────────
app.get('/api/leaderboard', async (req, res) => {
  try {
    const topScores = await Leaderboard.find().sort({ score: -1 }).limit(10);
    res.json(topScores);
  } catch (dbError) {
    console.error('Database read error in GET /api/leaderboard:', dbError);
    res.status(500).json({ error: 'DATABASE_READ_ERROR', message: '서버에서 리더보드를 읽어오는 중 오류가 발생했습니다.' });
  }
});

app.post('/api/leaderboard', async (req, res) => {
  const { name, score, message } = req.body;
  if (!name?.trim() || !message?.trim() || typeof score !== 'number') {
    return res.status(400).json({ error: 'INVALID_DATA', message: '이름, 점수, 메시지는 필수입니다.' });
  }

  try {
    const newEntry = new Leaderboard({
      id: nanoid(),
      name: name.trim().slice(0, 10), // Max 10 chars
      score,
      message: message.trim().slice(0, 30), // Max 30 chars
      time: Date.now(),
    });
    await newEntry.save();
    res.status(201).json(newEntry);
  } catch (dbError) {
    console.error('Database write error in POST /api/leaderboard:', dbError);
    res.status(500).json({ error: 'DATABASE_WRITE_ERROR', message: '서버에 리더보드 정보를 저장하는 중 오류가 발생했습니다.' });
  }
});

// ────────────────── GAME API ──────────────────────────
// 게임 점수 저장 (최고 기록만 갱신)
app.post('/api/game/score', async (req, res) => {
  const token = (req.headers.authorization || '').split(' ')[1];
  const user = await verifyKakaoToken(token);
  if (!user) return res.status(401).json({ error: 'INVALID_TOKEN' });

  const { score } = req.body;
  if (typeof score !== 'number') return res.status(400).json({ error: 'INVALID_SCORE' });

  try {
    const existingScore = await GameScore.findOne({ userId: user.id });
    let savedScore = score;
    let isNewRecord = false;

    if (existingScore) {
      if (score > existingScore.score) {
        existingScore.score = score;
        existingScore.time = Date.now();
        existingScore.name = user.name;
        existingScore.image = user.image;
        await existingScore.save();
        savedScore = score;
        isNewRecord = true;
      } else {
        savedScore = existingScore.score;
      }
    } else {
      const newScore = new GameScore({
        id: nanoid(),
        userId: user.id,
        name: user.name,
        image: user.image,
        score,
        time: Date.now()
      });
      await newScore.save();
      savedScore = score;
      isNewRecord = true;
    }

    // Check if Top 10
    const betterScoresCount = await GameScore.countDocuments({ score: { $gt: savedScore } });
    const isTop10 = betterScoresCount < 10;

    return res.json({ newRecord: isNewRecord, score: savedScore, isTop10 });
  } catch (err) {
    console.error('Game score save error:', err);
    res.status(500).json({ error: 'DB_ERROR' });
  }
});

// 소감 등록 (Top 10 유저용)
app.put('/api/game/message', async (req, res) => {
    const token = (req.headers.authorization || '').split(' ')[1];
    const user = await verifyKakaoToken(token);
    if (!user) return res.status(401).json({ error: 'INVALID_TOKEN' });

    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'MESSAGE_REQUIRED' });

    try {
        const record = await GameScore.findOne({ userId: user.id });
        if (!record) return res.status(404).json({ error: 'NO_RECORD' });
        
        // Verify Top 10 again to be safe
        const betterScoresCount = await GameScore.countDocuments({ score: { $gt: record.score } });
        if (betterScoresCount >= 10) {
             return res.status(403).json({ error: 'NOT_TOP_10', message: 'Top 10 순위 밖입니다.' });
        }

        record.message = message.trim().slice(0, 50); // Max 50 chars
        await record.save();
        res.json({ ok: true });
    } catch (err) {
        console.error('Game message update error:', err);
        res.status(500).json({ error: 'DB_ERROR' });
    }
});

// 내 최고 점수 조회
app.get('/api/game/myscore', async (req, res) => {
  const token = (req.headers.authorization || '').split(' ')[1];
  const user = await verifyKakaoToken(token);
  if (!user) return res.status(401).json({ error: 'INVALID_TOKEN' });

  try {
    const record = await GameScore.findOne({ userId: user.id });
    res.json({ score: record ? record.score : 0 });
  } catch (err) {
    res.status(500).json({ error: 'DB_ERROR' });
  }
});

// 게임 리더보드 (TOP 10)
app.get('/api/game/leaderboard', async (req, res) => {
  try {
    const topScores = await GameScore.find({}, { name: 1, image: 1, score: 1, message: 1, time: 1, _id: 0 })
      .sort({ score: -1 })
      .limit(10);
    res.json(topScores);
  } catch (err) {
    res.status(500).json({ error: 'DB_ERROR' });
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
    const memos = await AdminMemo.find().sort({ time: -1 });
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

  try {
    const newMemo = new AdminMemo({
      id: nanoid(),
      title: title.trim(),
      content: content.trim(),
      color: color || '#e9ecef', // Updated default color
      time: Date.now(),
    });
    await newMemo.save();
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
    const updateData = {};
    if (title !== undefined) updateData.title = title.trim();
    if (content !== undefined) updateData.content = content.trim();
    if (color !== undefined) updateData.color = color;
    updateData.time = Date.now();

    const updatedMemo = await AdminMemo.findOneAndUpdate(
      { id: id },
      updateData,
      { new: true } // Return updated document
    );

    if (!updatedMemo) {
      return res.status(404).json({ error: 'MEMO_NOT_FOUND', message: '해당 ID의 메모를 찾을 수 없습니다.' });
    }

    res.json(updatedMemo);
  } catch (dbError) {
    console.error(`Database error in PUT /api/admin/memos/${id}:`, dbError);
    res.status(500).json({ error: 'DATABASE_ERROR', message: '서버에서 메모 업데이트 중 오류가 발생했습니다.' });
  }
});

adminMemosRouter.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await AdminMemo.findOneAndDelete({ id: id });

    if (!result) {
      return res.status(404).json({ error: 'MEMO_NOT_FOUND', message: '삭제할 메모를 찾을 수 없습니다.' });
    }
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
    res.sendFile(indexPath);
});


// ──────────────────── SERVER ON ────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 Server ready @ ${DOMAIN || `http://localhost:${PORT}`}`);
  console.log(`Serving static files from: ${path.resolve()}`);
});
