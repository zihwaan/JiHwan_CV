import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/jihwan_cv';

const commentSchema = new mongoose.Schema({
  id: String,
  name: String,
  text: String,
  time: Number
});
const Comment = mongoose.model('Comment', commentSchema);

const gameScoreSchema = new mongoose.Schema({
  id: String,
  name: String,
  score: Number,
  message: String,
  time: Number
});
const GameScore = mongoose.model('GameScore', gameScoreSchema);

async function cleanup() {
  console.log('🧹 중복 데이터 정리를 시작합니다...');
  try {
    await mongoose.connect(MONGODB_URI);
    
    // 1. 방명록(Comments) 중복 제거
    const comments = await Comment.find({});
    const uniqueComments = new Map();
    const commentsToDelete = [];

    for (const c of comments) {
      // 시간(Timezone 차이) 무시하고 내용과 이름만으로 중복 확인
      const key = `${c.name}|${c.text}`;
      if (uniqueComments.has(key)) {
        commentsToDelete.push(c._id);
      } else {
        uniqueComments.set(key, c._id);
      }
    }

    if (commentsToDelete.length > 0) {
      console.log(`🗑️ 중복된 방명록 ${commentsToDelete.length}개를 삭제합니다.`);
      await Comment.deleteMany({ _id: { $in: commentsToDelete } });
    } else {
      console.log('✅ 중복된 방명록이 없습니다.');
    }

    // 2. 게임 점수(GameScore) 중복 제거
    const scores = await GameScore.find({});
    const uniqueScores = new Map();
    const scoresToDelete = [];

    for (const s of scores) {
      const key = `${s.name}|${s.score}`;
      if (uniqueScores.has(key)) {
        scoresToDelete.push(s._id);
      } else {
        uniqueScores.set(key, s._id);
      }
    }

    if (scoresToDelete.length > 0) {
      console.log(`🗑️ 중복된 게임 점수 ${scoresToDelete.length}개를 삭제합니다.`);
      await GameScore.deleteMany({ _id: { $in: scoresToDelete } });
    } else {
      console.log('✅ 중복된 게임 점수가 없습니다.');
    }

  } catch (e) {
    console.error('Error:', e);
  } finally {
    await mongoose.disconnect();
    console.log('✨ 정리 완료.');
    process.exit(0);
  }
}

cleanup();
