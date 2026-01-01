import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { nanoid } from 'nanoid';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/jihwan_cv';

// ────────────────────────────────────────────────────────────────────
// 1. 여기에 수동으로 데이터를 입력하세요 (원하는 만큼 추가 가능)
// ────────────────────────────────────────────────────────────────────
const manualData = [
  {
    name: "홍길동",
    text: "첫 번째 방명록입니다! 파이팅하세요.",
    image: "", // 비워두면 기본 이미지(/assets/default_avatar.png)로 설정됨
    date: "2024-01-01 12:00:00" // 날짜 형식: "YYYY-MM-DD HH:mm:ss"
  },
  {
    name: "김철수",
    text: "수동 이전 테스트 중입니다.",
    image: "https://example.com/my-profile.jpg", 
    date: "2024-05-20 15:30:00"
  },
  // 아래에 계속 추가...
];

// ────────────────────────────────────────────────────────────────────
// 이하 로직은 수정하지 않으셔도 됩니다.
// ────────────────────────────────────────────────────────────────────

const commentSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: String,
  image: String,
  text: String,
  time: Number
});
const Comment = mongoose.model('Comment', commentSchema);

async function runManualInsert() {
  console.log('🚀 수동 데이터 입력을 시작합니다...');

  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ MongoDB 연결 성공');

    const formattedData = manualData.map(item => {
      // 날짜 문자열을 타임스탬프(숫자)로 변환
      const timestamp = item.date ? new Date(item.date).getTime() : Date.now();
      
      return {
        id: nanoid(), // 고유 ID 자동 생성
        name: item.name,
        text: item.text,
        image: item.image || '/assets/default_avatar.png',
        time: timestamp
      };
    });

    if (formattedData.length > 0) {
      await Comment.insertMany(formattedData);
      console.log(`🎉 총 ${formattedData.length}개의 방명록을 성공적으로 저장했습니다!`);
    } else {
      console.log('⚠️ 입력된 데이터가 없습니다. manualData 배열을 채워주세요.');
    }

  } catch (error) {
    console.error('❌ 오류 발생:', error);
  } finally {
    await mongoose.disconnect();
    console.log('👋 종료합니다.');
  }
}

runManualInsert();
