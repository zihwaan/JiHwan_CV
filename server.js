// server.js
import dotenv from 'dotenv';
import express from 'express';
import fs from 'fs';
import axios from 'axios';
import cors from 'cors';
import path from 'path';
import mongoose from 'mongoose';
import { nanoid } from 'nanoid';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import pty from 'node-pty';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { GoogleGenerativeAI } from '@google/generative-ai';

dotenv.config();

const DOMAIN = process.env.DOMAIN ? `https://${process.env.DOMAIN}` : ``;
const PORT = process.env.PORT || 8080;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/jihwan_cv';

// Initialize Gemini
const genAI = new GoogleGenerativeAI("AIzaSyAoSGrfoox32BVHr8B67ByQIfipo2eUQ48"); // Hardcoded key as per request
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

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
  parentId: { type: String, default: null },
  name: String,
  image: String,
  text: String,
  time: Number,
  replies: { type: Array, default: [] } 
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
  userId: { type: String, required: true }, 
  name: String,
  image: String,
  score: Number,
  message: String,
  time: Number
});

// New NanoBanana Schema
const nanoBananaSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    userImage: String, // Base64 (could be large, but useful for admin review)
    generatedSvg: String,
    gender: String,
    mbti: String,
    personality: String,
    time: Number
});

const Comment = mongoose.model('Comment', commentSchema);
const Login = mongoose.model('Login', loginSchema);
const Leaderboard = mongoose.model('Leaderboard', leaderboardSchema);
const AdminMemo = mongoose.model('AdminMemo', adminMemoSchema);
const GameScore = mongoose.model('GameScore', gameScoreSchema);
const NanoBanana = mongoose.model('NanoBanana', nanoBananaSchema);

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
// Express App & Socket.io Setup
// ────────────────────────────────────────────────────────────────────
const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

app.use(cors({ origin: DOMAIN || true }));
app.use(express.json({ limit: '50mb' })); // Increased limit for images
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

// ... (Existing Comment, Login APIs) ...
app.get('/api/comments', async (_, res) => {
  try {
    const comments = await Comment.find().lean();
    let allComments = [];
    comments.forEach(c => {
        allComments.push({
            id: c.id,
            parentId: c.parentId || null,
            name: c.name,
            image: c.image,
            text: c.text,
            time: c.time
        });
        if (c.replies && Array.isArray(c.replies) && c.replies.length > 0) {
            c.replies.forEach(r => {
                allComments.push({
                    id: r.id,
                    parentId: c.id, 
                    name: r.name,
                    image: r.image,
                    text: r.text,
                    time: r.time
                });
            });
        }
    });
    allComments.sort((a, b) => b.time - a.time);
    res.json(allComments);
  } catch (dbError) {
    res.status(500).json({ error: 'DATABASE_READ_ERROR' });
  }
});

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

    if (replyTo) {
        let parentName = "누군가";
        let parentText = "";
        let parent = await Comment.findOne({ id: replyTo });
        if (!parent) {
             const holder = await Comment.findOne({ 'replies.id': replyTo });
             if (holder) {
                 const r = holder.replies.find(r => r.id === replyTo);
                 if(r) { parentName = r.name; parentText = r.text; }
             }
        } else {
            parentName = parent.name; parentText = parent.text;
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
    res.status(500).json({ error: 'DATABASE_WRITE_ERROR' });
  }
});

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
    const logins = await Login.find().sort({ time: -1 });
    res.json(logins);
  } catch (dbError) {
    res.status(500).json({ error: 'DATABASE_READ_ERROR' });
  }
});

app.delete('/api/comments/:id', async (req, res) => {
  const token = (req.headers.authorization || '').split(' ')[1];
  if (!isAdmin(token)) return res.status(401).json({ error: 'NOT_ADMIN' });

  try {
    const { id } = req.params;
    const result = await Comment.findOneAndDelete({ id: id });
    if (result) {
        await Comment.deleteMany({ parentId: id });
        return res.json({ ok: true });
    }
    const parent = await Comment.findOne({ 'replies.id': id });
    if (parent) {
        parent.replies = parent.replies.filter(r => r.id !== id);
        await parent.save();
        return res.json({ ok: true });
    }
    return res.status(404).json({ error: 'COMMENT_NOT_FOUND' });
  } catch (dbError) {
    res.status(500).json({ error: 'DATABASE_ERROR' });
  }
});

// ────────────────── NanoBanana Generation API ────────────────────
app.post('/api/nano/generate', async (req, res) => {
    const { image, gender, mbti, personality } = req.body;
    if (!image || !gender || !mbti || !personality) {
        return res.status(400).json({ error: 'MISSING_FIELDS' });
    }

    try {
        // Prepare image for Gemini (Base64 without header)
        const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
        
        const prompt = `
        You are an expert vector artist.
        Analyze the provided user image to understand their key facial features (hair style, glasses, expression, accessories).
        
        Then, generate a SINGLE <svg> code block for a cute, consistent Chibi-style avatar of this person.
        
        Traits to incorporate:
        - Gender: ${gender}
        - MBTI: ${mbti}
        - Personality: ${personality}
        
        Style Guidelines:
        - Flat vector art.
        - Kawaii / Chibi proportions (large head, small body).
        - Pastel color palette.
        - Simple geometric shapes.
        - No background (transparent).
        - Size: 300x300 viewBox.
        
        Output ONLY the raw SVG code. No markdown formatting (\`\
`svg ... `\
`)
, no text descriptions. Just the <svg>...</svg> string.
        `;

        const result = await model.generateContent([
            prompt,
            {
                inlineData: {
                    data: base64Data,
                    mimeType: "image/jpeg" 
                }
            }
        ]);
        
        const responseText = result.response.text();
        
        // Clean up response if it contains markdown code blocks
        let cleanSvg = responseText.replace(/```svg/g, '').replace(/```/g, '').trim();
        
        // Ensure it starts with <svg and ends with </svg>
        const svgStart = cleanSvg.indexOf('<svg');
        const svgEnd = cleanSvg.lastIndexOf('</svg>');
        if (svgStart !== -1 && svgEnd !== -1) {
            cleanSvg = cleanSvg.substring(svgStart, svgEnd + 6);
        }

        // Save to DB
        const newBanana = new NanoBanana({
            id: nanoid(),
            userImage: image, // Store full base64 (might be heavy, but requested)
            generatedSvg: cleanSvg,
            gender,
            mbti,
            personality,
            time: Date.now()
        });
        await newBanana.save();

        res.json({ svg: cleanSvg });

    } catch (err) {
        console.error('NanoBanana Error:', err);
        res.status(500).json({ error: 'GENERATION_FAILED' });
    }
});

app.get('/api/admin/bananas', async (req, res) => {
    const token = (req.headers.authorization || '').split(' ')[1];
    if (!isAdmin(token)) return res.status(401).json({ error: 'NOT_ADMIN' });
    
    try {
        const bananas = await NanoBanana.find().sort({ time: -1 });
        res.json(bananas);
    } catch (dbError) {
        res.status(500).json({ error: 'DB_ERROR' });
    }
});


// Leaderboard & Game APIs (kept same)
app.get('/api/leaderboard', async (req, res) => {
  try {
    const topScores = await Leaderboard.find().sort({ score: -1 }).limit(10);
    res.json(topScores);
  } catch (dbError) { res.status(500).json({ error: 'DB_ERROR' }); }
});

app.post('/api/leaderboard', async (req, res) => {
  const { name, score, message } = req.body;
  if (!name?.trim() || !message?.trim() || typeof score !== 'number') {
    return res.status(400).json({ error: 'INVALID_DATA' });
  }
  try {
    const newEntry = new Leaderboard({
      id: nanoid(),
      name: name.trim().slice(0, 10),
      score,
      message: message.trim().slice(0, 30),
      time: Date.now(),
    });
    await newEntry.save();
    res.status(201).json(newEntry);
  } catch (dbError) { res.status(500).json({ error: 'DB_ERROR' }); }
});

app.post('/api/game/score', async (req, res) => {
  const token = (req.headers.authorization || '').split(' ')[1];
  const user = await verifyKakaoToken(token);
  if (!user) return res.status(401).json({ error: 'INVALID_TOKEN' });

  const { score } = req.body;
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
      } else { savedScore = existingScore.score; }
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
    const betterScoresCount = await GameScore.countDocuments({ score: { $gt: savedScore } });
    const isTop15 = betterScoresCount < 15;
    return res.json({ newRecord: isNewRecord, score: savedScore, isTop10: isTop15 }); 
  } catch (err) { res.status(500).json({ error: 'DB_ERROR' }); }
});

app.put('/api/game/message', async (req, res) => {
    const token = (req.headers.authorization || '').split(' ')[1];
    const user = await verifyKakaoToken(token);
    if (!user) return res.status(401).json({ error: 'INVALID_TOKEN' });
    const { message } = req.body;
    try {
        const record = await GameScore.findOne({ userId: user.id });
        if (!record) return res.status(404).json({ error: 'NO_RECORD' });
        const betterScoresCount = await GameScore.countDocuments({ score: { $gt: record.score } });
        if (betterScoresCount >= 15) return res.status(403).json({ error: 'NOT_TOP_15' });
        record.message = message.trim().slice(0, 50); 
        await record.save();
        res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: 'DB_ERROR' }); }
});

app.get('/api/game/myscore', async (req, res) => {
  const token = (req.headers.authorization || '').split(' ')[1];
  const user = await verifyKakaoToken(token);
  if (!user) return res.status(401).json({ error: 'INVALID_TOKEN' });
  try {
    const record = await GameScore.findOne({ userId: user.id });
    res.json({ score: record ? record.score : 0 });
  } catch (err) { res.status(500).json({ error: 'DB_ERROR' }); }
});

app.get('/api/game/leaderboard', async (req, res) => {
  try {
    const topScores = await GameScore.find({}, { name: 1, image: 1, score: 1, message: 1, time: 1, _id: 0 })
      .sort({ score: -1 })
      .limit(15);
    res.json(topScores);
  } catch (err) { res.status(500).json({ error: 'DB_ERROR' }); }
});

// Admin Memos Router
const adminMemosRouter = express.Router();
adminMemosRouter.use((req, res, next) => {
  const token = (req.headers.authorization || '').split(' ')[1];
  if (!isAdmin(token)) return res.status(401).json({ error: 'NOT_ADMIN' });
  next();
});
adminMemosRouter.get('/', async (req, res) => {
  try { const memos = await AdminMemo.find().sort({ time: -1 }); res.json(memos); } 
  catch (dbError) { res.status(500).json({ error: 'DB_ERROR' }); }
});
adminMemosRouter.post('/', async (req, res) => {
  const { title, content, color } = req.body;
  if (!title?.trim() || !content?.trim()) return res.status(400).json({ error: 'INVALID' });
  try {
    const newMemo = new AdminMemo({ id: nanoid(), title, content, color, time: Date.now() });
    await newMemo.save(); res.status(201).json(newMemo);
  } catch (dbError) { res.status(500).json({ error: 'DB_ERROR' }); }
});
adminMemosRouter.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { title, content, color } = req.body;
  try {
    const updatedMemo = await AdminMemo.findOneAndUpdate({ id: id }, { title, content, color, time: Date.now() }, { new: true });
    if (!updatedMemo) return res.status(404).json({ error: 'NOT_FOUND' });
    res.json(updatedMemo);
  } catch (dbError) { res.status(500).json({ error: 'DB_ERROR' }); }
});
adminMemosRouter.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await AdminMemo.findOneAndDelete({ id: id });
    if (!result) return res.status(404).json({ error: 'NOT_FOUND' });
    res.json({ ok: true });
  } catch (dbError) { res.status(500).json({ error: 'DB_ERROR' }); }
});
app.use('/api/admin/memos', adminMemosRouter);

// ────────────────── FIX / AGENT API (Terminal) ────────────────────
const fixRouter = express.Router();
let ALLOWED_ADMINS = (process.env.ALLOWED_KAKAO_IDS || '').split(',').filter(Boolean);

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
    if (code === process.env.ADMIN_PASS) {
        if (!ALLOWED_ADMINS.includes(req.user.id)) {
            ALLOWED_ADMINS.push(req.user.id);
            console.log(`[Admin] New admin authorized: ${req.user.name} (${req.user.id})`);
        }
        res.json({ ok: true });
    } else {
        res.status(401).json({ error: 'WRONG_CODE' });
    }
});

app.use('/api/fix', fixRouter);
app.get('/fix', (_, res) => res.sendFile(path.join(path.resolve(), 'fix.html')));

// ────────────────── WebSocket (Terminal) Logic ────────────────────
io.on('connection', async (socket) => {
    const token = socket.handshake.auth.token;
    if (!token) return socket.disconnect(true);

    const user = await verifyKakaoToken(token);
    if (!user || !ALLOWED_ADMINS.includes(user.id)) {
        console.log(`[Socket] Unauthorized attempt blocked`);
        return socket.disconnect(true);
    }

    console.log(`[Terminal] Session started: ${user.name}`);
    
    const SSH_KEY_PATH = path.join(process.cwd(), 'zihwan.pem');
    const SSH_HOST = 'ec2-user@ec2-13-210-76-184.ap-southeast-2.compute.amazonaws.com';
    
    // Force SSH connection logic
    let shellCmd = 'ssh';
    let shellArgs = ['-i', SSH_KEY_PATH, '-o', 'StrictHostKeyChecking=no', '-tt', SSH_HOST];
    
    if (fs.existsSync(SSH_KEY_PATH)) {
        try {
            fs.chmodSync(SSH_KEY_PATH, 0o400);
            console.log(`[Terminal] Using SSH to ${SSH_HOST}`);
        } catch (e) {
            console.error('[Terminal] Warning: Failed to set key permissions:', e);
        }
    } else {
        console.error('[Terminal] Error: zihwan.pem not found!');
        socket.emit('data', '\r\n\x1b[31mError: SSH Key (zihwan.pem) missing. Cannot connect to host.\x1b[0m\r\n');
        return socket.disconnect(true);
    }

    // Create a pseudo-terminal
    const shell = pty.spawn(shellCmd, shellArgs, {
        name: 'xterm-256color',
        cols: 80,
        rows: 24,
        cwd: process.cwd(),
        env: process.env
    });

    // Pipe outputs to socket
    shell.onData((data) => socket.emit('data', data));

    // Handle inputs from client
    socket.on('input', (data) => {
        shell.write(data);
    });
    
    // Handle resize
    socket.on('resize', ({ cols, rows }) => {
        try {
            shell.resize(cols, rows);
        } catch (e) {
            console.error('Resize error:', e);
        }
    });

    // Handle exit
    shell.onExit(({ exitCode, signal }) => {
         console.log(`[Terminal] Shell exited with code ${exitCode}`);
         socket.disconnect();
    });

    socket.on('disconnect', () => {
        try {
            shell.kill();
        } catch(e) {}
        console.log(`[Terminal] Session ended: ${user.name}`);
    });
});

app.get('*', (_, res) => res.sendFile(path.join(path.resolve(), 'index.html')));

// ──────────────────── SERVER ON ────────────────────────
server.listen(PORT, () => {
  console.log(`🚀 Server ready @ ${DOMAIN || `http://localhost:${PORT}`}`);
});
