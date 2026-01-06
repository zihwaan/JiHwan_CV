import mongoose from 'mongoose';
import { nanoid } from 'nanoid';

// MongoDB 연결 설정
const MONGODB_URI = 'mongodb://localhost:27017/jihwan_cv';

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

const Comment = mongoose.model('Comment', commentSchema);

// 데이터 준비 (시간순 정렬)
const comments = [
  {
    name: "최영준",
    time: new Date("2026-01-02T06:55:17+09:00").getTime(),
    text: "2026.01.02 왔다감",
    image: "/assets/default_avatar.png" // 무프사 (기본)
  },
  {
    name: "임현종",
    time: new Date("2026-01-02T17:04:44+09:00").getTime(),
    text: `♨♨지환닷컴♨♨ 2026년$$전원
대박기원♨♨성공률100%증정※
♟ 지환닷컴 ♟ 2026년 펫
무료증정 ¥ 특정조건
§§화이팅§§✽성공의유산✽초상화
획득기회@@ 즉시이동h++p://
jihwan.com/2026/ko/
주간EVENT 무료 서비스/레스토랑급
시설/지환닷컴 화이팅/달콤살벌 성공/
✽【2026】✽ 24시간 영업 연중무휴`,
    image: "/assets/lim.png" // 지정된 이미지
  },
  {
    name: "이재승",
    time: new Date("2026-01-03T00:07:00+09:00").getTime(),
    text: "삼성에서 뵈어요~ 잘보고 갑니다 ㅎㅎ",
    image: "/assets/default_avatar.png" // 무프사 (기본)
  }
];

async function insertComments() {
  try {
    for (const c of comments) {
      // 중복 방지 (같은 내용, 같은 시간이면 패스)
      const exists = await Comment.findOne({ name: c.name, time: c.time });
      if (exists) {
        console.log(`⚠️ Skip: ${c.name} (Already exists)`);
        continue;
      }

      const newComment = new Comment({
        id: nanoid(),
        parentId: null,
        name: c.name,
        image: c.image,
        text: c.text,
        time: c.time,
        replies: []
      });

      await newComment.save();
      console.log(`✅ Inserted: ${c.name} - ${new Date(c.time).toLocaleString()}`);
    }
  } catch (error) {
    console.error('❌ Error inserting comments:', error);
  } finally {
    mongoose.disconnect();
    console.log('👋 Disconnected');
  }
}

insertComments();
