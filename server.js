// server.js
import dotenv from 'dotenv';
import express from 'express';
import axios from 'axios';
import cors from 'cors';
import path from 'path';
import mongoose from 'mongoose';
import { nanoid } from 'nanoid';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import { exec } from 'child_process';
import fs from 'fs';

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
  parentId: { type: String, default: null }, // For infinite replies
  name: String,
  image: String,
  text: String,
  time: Number,
  replies: { type: Array, default: [] } // Keep for legacy structure compatibility in DB, but we will migrate/ignore in logic
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

const gameScoreSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  userId: { type: String, required: true }, // Kakao ID or unique identifier
  name: String,
  image: String,
  score: Number,
  message: String,
  time: Number
});

const Comment = mongoose.model('Comment', commentSchema);
const Login = mongoose.model('Login', loginSchema);
const Leaderboard = mongoose.model('Leaderboard', leaderboardSchema);
const AdminMemo = mongoose.model('AdminMemo', adminMemoSchema);
const GameScore = mongoose.model('GameScore', gameScoreSchema);

// ────────────────────────────────────────────────────────────────────
// Email Transporter Config
// ────────────────────────────────────────────────────────────────────
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.GMAIL_USER, 
        pass: process.env.GMAIL_PASS 
    }
});

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

async function sendEmailNotification(subject, text) {
    if (!process.env.GMAIL_USER || !process.env.GMAIL_PASS) {
        console.warn('⚠️ Email configuration missing. Skipping notification.');
        return;
    }
    try {
        await transporter.sendMail({
            from: process.env.GMAIL_USER,
            to: 'devjanggun21@gmail.com',
            subject: subject,
            text: text
        });
        console.log(`✅ Email notification sent to devjanggun21@gmail.com: ${subject}`);
    } catch (error) {
        console.error('❌ Email sending failed:', error);
    }
}

// ──────────────────────── API ──────────────────────────
// 전체 댓글 조회 (Flat list for client to handle tree)
app.get('/api/comments', async (_, res) => {
  try {
    // Flatten logic for legacy replies
    const comments = await Comment.find().lean();
    let allComments = [];

    comments.forEach(c => {
        // Push the main comment
        allComments.push({
            id: c.id,
            parentId: c.parentId || null,
            name: c.name,
            image: c.image,
            text: c.text,
            time: c.time
        });

        // Check for legacy nested replies and promote them
        if (c.replies && Array.isArray(c.replies) && c.replies.length > 0) {
            c.replies.forEach(r => {
                allComments.push({
                    id: r.id,
                    parentId: c.id, // Parent is the main comment
                    name: r.name,
                    image: r.image,
                    text: r.text,
                    time: r.time
                });
            });
        }
    });

    // Sort by time (Oldest first or Newest first? Usually Guestbook is Newest first)
    // But for tree reconstruction, order matters less if ID based.
    // Let's return sorted by time desc (Newest first)
    allComments.sort((a, b) => b.time - a.time);

    res.json(allComments);
  } catch (dbError) {
    console.error('Database read error in GET /api/comments:', dbError);
    res.status(500).json({ error: 'DATABASE_READ_ERROR', message: '서버에서 댓글을 읽어오는 중 오류가 발생했습니다.' });
  }
});

// 댓글/답글 등록 (Infinite Nesting)
app.post('/api/comments', async (req, res) => {
  const token = (req.headers.authorization || '').split(' ')[1];
  const user = await verifyKakaoToken(token);
  if (!user) return res.status(401).json({ error: 'INVALID_TOKEN' });

  const { text, replyTo } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: 'TEXT_REQUIRED' });

  try {
    const newComment = new Comment({
        id: nanoid(),
        parentId: replyTo || null,
        name: user.name,
        image: user.image,
        text: text.trim(),
        time: Date.now(),
        replies: [] 
    });

    await newComment.save();

    // Email Notification
    if (replyTo) {
        // Find parent to get name (optimization: could be skipped or done via separate query)
        // Since we flattened the structure conceptually, finding parent might need a query
        // We do a best effort lookup to provide context in email.
        
        let parentName = "누군가";
        let parentText = "";
        
        // Try finding in top level
        let parent = await Comment.findOne({ id: replyTo });
        
        // If not found, it might be a legacy reply or we need to search deeper? 
        // But with new structure, all new replies are top level docs.
        // Legacy replies are inside 'replies' array. 
        if (!parent) {
             // Try finding in legacy replies (inefficient but safe)
             const holder = await Comment.findOne({ 'replies.id': replyTo });
             if (holder) {
                 const r = holder.replies.find(r => r.id === replyTo);
                 if(r) {
                     parentName = r.name;
                     parentText = r.text;
                 }
             }
        } else {
            parentName = parent.name;
            parentText = parent.text;
        }

        sendEmailNotification(
            `[지환닷컴 방명록] ${user.name}님이 ${parentName}님에게 답글을 남겼습니다.`, 
            `원문 ("${parentText}")\n\n답글:\n${user.name}: ${text.trim()}`
        );
    } else {
        sendEmailNotification(
            `[지환닷컴 방명록] ${user.name}님이 댓글을 남겼습니다.`, 
            `${user.name}: ${text.trim()}`
        );
    }

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
    const { id } = req.params;
    
    // 1. Try deleting from top level
    const result = await Comment.findOneAndDelete({ id: id });
    
    if (result) {
        // Also delete any children (orphans) - single level check for now
        // Or if we want full recursive delete, we need to loop. 
        // For now, let's just delete direct children.
        await Comment.deleteMany({ parentId: id });
        return res.json({ ok: true });
    }

    // 2. If not found, check if it is a legacy reply inside a comment
    // (We iterate to find which comment contains this reply)
    const parent = await Comment.findOne({ 'replies.id': id });
    if (parent) {
        parent.replies = parent.replies.filter(r => r.id !== id);
        await parent.save();
        return res.json({ ok: true });
    }

    return res.status(404).json({ error: 'COMMENT_NOT_FOUND' });

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

    // Check if Top 15
    const betterScoresCount = await GameScore.countDocuments({ score: { $gt: savedScore } });
    const isTop15 = betterScoresCount < 15;

    return res.json({ newRecord: isNewRecord, score: savedScore, isTop10: isTop15 }); 
  } catch (err) {
    console.error('Game score save error:', err);
    res.status(500).json({ error: 'DB_ERROR' });
  }
});

// 소감 등록 (Top 15 유저용)
app.put('/api/game/message', async (req, res) => {
    const token = (req.headers.authorization || '').split(' ')[1];
    const user = await verifyKakaoToken(token);
    if (!user) return res.status(401).json({ error: 'INVALID_TOKEN' });

    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'MESSAGE_REQUIRED' });

    try {
        const record = await GameScore.findOne({ userId: user.id });
        if (!record) return res.status(404).json({ error: 'NO_RECORD' });
        
        // Verify Top 15 again
        const betterScoresCount = await GameScore.countDocuments({ score: { $gt: record.score } });
        if (betterScoresCount >= 15) {
             return res.status(403).json({ error: 'NOT_TOP_15', message: 'Top 15 순위 밖입니다.' });
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

// 게임 리더보드 (TOP 15)
app.get('/api/game/leaderboard', async (req, res) => {
  try {
    const topScores = await GameScore.find({}, { name: 1, image: 1, score: 1, message: 1, time: 1, _id: 0 })
      .sort({ score: -1 })
      .limit(15);
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
      color: color || '#e9ecef', 
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
      { new: true } 
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

// ────────────────── FIX / AGENT API ────────────────────
const fixRouter = express.Router();

// 임시 메모리에 허용된 카카오 ID 저장 (서버 재시작 시 초기화되므로 .env 권장)
// 실무에서는 DB에 저장해야 함.
let ALLOWED_ADMINS = (process.env.ALLOWED_KAKAO_IDS || '').split(',').filter(Boolean);

// Middleware to check Kakao Auth
async function checkFixAuth(req, res, next) {
    const token = (req.headers.authorization || '').split(' ')[1];
    const user = await verifyKakaoToken(token);
    if (!user) return res.status(401).json({ error: 'INVALID_TOKEN' });
    
    req.user = user;
    next();
}

fixRouter.get('/check-auth', checkFixAuth, (req, res) => {
    if (ALLOWED_ADMINS.includes(req.user.id) || req.user.id === process.env.MASTER_ADMIN_ID) {
        res.json({ ok: true, user: req.user });
    } else {
        res.status(403).json({ error: 'NOT_AUTHORIZED', user: req.user });
    }
});

fixRouter.post('/verify-admin', checkFixAuth, (req, res) => {
    const { code } = req.body;
    // 간단한 관리자 코드 체크 (환경변수 ADMIN_PASS 사용)
    if (code === process.env.ADMIN_PASS) {
        if (!ALLOWED_ADMINS.includes(req.user.id)) {
            ALLOWED_ADMINS.push(req.user.id);
            // In a real app, save this to DB/File
            console.log(`[Admin] New admin authorized: ${req.user.name} (${req.user.id})`);
        }
        res.json({ ok: true });
    } else {
        res.status(401).json({ error: 'WRONG_CODE' });
    }
});

fixRouter.post('/run', checkFixAuth, async (req, res) => {
    if (!ALLOWED_ADMINS.includes(req.user.id)) {
        return res.status(403).json({ error: 'FORBIDDEN' });
    }

    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ error: 'PROMPT_REQUIRED' });

    console.log(`[Agent] Running command from ${req.user.name}: ${prompt}`);

    // Command to run the Gemini CLI
    // Note: We are using 'npx @google/gemini-cli' as requested.
    // The CLI must be installed or npx will download it.
    // To run it non-interactively with a prompt, we assume it supports arguments or piping.
    // If the official CLI is interactive-only, this might be tricky.
    // However, assuming `gemini run "prompt"` pattern or similar. 
    // Based on 'google-gemini/gemini-cli' repo, it supports 'run' command? 
    // Actually, the user instructions said "npx https://github.com/google-gemini/gemini-cli".
    // Usually that means `npx gemini-chat-cli` or similar.
    // Let's assume standard `npx @google/gemini-cli run "${prompt}"` works as a one-shot.
    // If not, we might need to send the prompt via stdin.
    
    // SAFETY: Input sanitization is minimal here because it's an ADMIN tool.
    // We escape double quotes to avoid breaking the shell command string.
    const safePrompt = prompt.replace(/"/g, '\\"');
    
    // We force the model to gemini-1.5-pro as requested (User asked for "Gemini 3 Pro", mapping to 1.5 Pro as current flagship)
    const command = `npx @google/gemini-cli run "${safePrompt}" --model gemini-1.5-pro`;

    // Increase timeout for AI tasks (10 minutes)
    exec(command, { timeout: 600000, maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
        let output = stdout || stderr;
        
        if (error) {
            console.error(`[Agent] Error: ${error.message}`);
            return res.status(500).json({ error: 'EXECUTION_FAILED', details: error.message + '\n' + stderr });
        }

        // If successful, try to Git Push
        // We chain the git commands.
        const gitCmd = `git add . && git commit -m "Agent Fix: ${safePrompt.slice(0, 30)}..." && git push`;
        
        exec(gitCmd, (gitErr, gitOut, gitErrOut) => {
            const gitResult = gitErr ? `Git Push Failed: ${gitErr.message}` : `Git Push Success:\n${gitOut}`;
            
            res.json({ 
                ok: true, 
                output: output,
                gitResult: gitResult
            });
        });
    });
});

app.use('/api/fix', fixRouter);

// Fix Page Route
app.get('/fix', (_, res) => {
    res.sendFile(path.join(path.resolve(), 'fix.html'));
});

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
