import dotenv from 'dotenv';
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';

dotenv.config();

// MongoDB 연결 설정 (환경 변수 또는 기본 로컬 주소)
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/jihwan_cv';

// ────────────────────────────────────────────────────────────────────
// 스키마 정의 (server.js와 동일해야 함)
// ────────────────────────────────────────────────────────────────────
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

// ────────────────────────────────────────────────────────────────────
// 마이그레이션 로직
// ────────────────────────────────────────────────────────────────────
async function migrate() {
  console.log('🚀 데이터 마이그레이션을 시작합니다...');

  // 1. db.json 파일 읽기
  const dbPath = path.resolve('db.json');
  if (!fs.existsSync(dbPath)) {
    console.error(`❌ 오류: '${dbPath}' 파일을 찾을 수 없습니다.`);
    console.error('Railway에서 다운로드한 db.json 파일을 프로젝트 루트 폴더에 놓아주세요.');
    process.exit(1);
  }

  const rawData = fs.readFileSync(dbPath, 'utf-8');
  const jsonData = JSON.parse(rawData);
  console.log('✅ db.json 파일을 성공적으로 읽었습니다.');

  // 2. MongoDB 연결
  try {
    await mongoose.connect(MONGODB_URI);
    console.log(`✅ MongoDB에 연결되었습니다: ${MONGODB_URI}`);
  } catch (err) {
    console.error('❌ MongoDB 연결 실패:', err);
    process.exit(1);
  }

  // 3. 데이터 삽입 (기존 데이터 중복 방지 로직 포함 가능하나, 초기 이전용으로 단순화)
  try {
    // 댓글 (Comments)
    if (jsonData.comments && jsonData.comments.length > 0) {
      console.log(`📦 댓글 ${jsonData.comments.length}개 이동 중...`);
      await Comment.deleteMany({}); // 기존 데이터 초기화 (선택 사항)
      await Comment.insertMany(jsonData.comments);
    }

    // 로그인 기록 (Logins)
    if (jsonData.logins && jsonData.logins.length > 0) {
      console.log(`📦 로그인 기록 ${jsonData.logins.length}개 이동 중...`);
      await Login.deleteMany({});
      await Login.insertMany(jsonData.logins);
    }

    // 리더보드 (Leaderboard)
    if (jsonData.leaderboard && jsonData.leaderboard.length > 0) {
      console.log(`📦 리더보드 ${jsonData.leaderboard.length}개 이동 중...`);
      await Leaderboard.deleteMany({});
      await Leaderboard.insertMany(jsonData.leaderboard);
    }

    // 관리자 메모 (AdminMemos)
    if (jsonData.adminMemos && jsonData.adminMemos.length > 0) {
      console.log(`📦 관리자 메모 ${jsonData.adminMemos.length}개 이동 중...`);
      await AdminMemo.deleteMany({});
      await AdminMemo.insertMany(jsonData.adminMemos);
    }

    console.log('🎉 모든 데이터 마이그레이션이 완료되었습니다!');

  } catch (error) {
    console.error('❌ 데이터 저장 중 오류 발생:', error);
  } finally {
    await mongoose.disconnect();
    console.log('👋 MongoDB 연결을 종료합니다.');
    process.exit(0);
  }
}

migrate();
