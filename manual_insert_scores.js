import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { nanoid } from 'nanoid';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/jihwan_cv';

const scoresData = [
  {"name":"안성현","image":"https://img1.kakaocdn.net/thumb/R640x640.q70/?fname=http://t1.kakaocdn.net/account_images/default_profile.jpeg","score":73,"time":1767372414785,"message":"🍎"},
  {"name":"지환","image":"https://k.kakaocdn.net/dn/j2tPw/dJMcabW9lZK/cUHL0kf2fn8VenZBthUld1/img_640x640.jpg","score":68,"time":1767358878473,"message":"아싸 1등~"},
  {"name":"서휘경","image":"https://img1.kakaocdn.net/thumb/R640x640.q70/?fname=http://t1.kakaocdn.net/account_images/default_profile.jpeg","score":63,"time":1767364471002,"message":"가보자고"},
  {"name":"황정현","image":"https://img1.kakaocdn.net/thumb/R640x640.q70/?fname=http://t1.kakaocdn.net/account_images/default_profile.jpeg","score":63,"time":1767519761790,"message":"딱기다려"},
  {"name":"이재승","image":"https://img1.kakaocdn.net/thumb/R640x640.q70/?fname=http://t1.kakaocdn.net/account_images/default_profile.jpeg","score":61,"time":1767366886089,"message":"올라가야 지"},
  {"name":"서진","image":"https://img1.kakaocdn.net/thumb/R640x640.q70/?fname=http://t1.kakaocdn.net/account_images/default_profile.jpeg","score":55,"time":1767368211201,"message":"우왕"},
  {"name":"이유빈","image":"https://img1.kakaocdn.net/thumb/R640x640.q70/?fname=http://t1.kakaocdn.net/account_images/default_profile.jpeg","score":50,"time":1767527655245,"message":"메롱"},
  {"name":"정무호","image":"https://k.kakaocdn.net/dn/CQGKY/dJMcafyj7vb/FCE92kQZTqwjgExXStOaJ0/img_640x640.jpg","score":49,"time":1767575886458,"message":"😋"},
  {"name":"고은준","image":"https://k.kakaocdn.net/dn/bs6BLU/btsQZUCmY1G/kla1NDPRLtw74ljTEQ2nr0/img_640x640.jpg","score":47,"time":1767303696307},
  {"name":"서유덕","image":"https://img1.kakaocdn.net/thumb/R640x640.q70/?fname=http://t1.kakaocdn.net/account_images/default_profile.jpeg","score":43,"time":1767409157254,"message":"변지ㄸ 화이팅"},
  {"name":"박서진","image":"https://img1.kakaocdn.net/thumb/R640x640.q70/?fname=http://t1.kakaocdn.net/account_images/default_profile.jpeg","score":42,"time":1767340406234},
  {"name":"박민성","image":"https://img1.kakaocdn.net/thumb/R640x640.q70/?fname=http://t1.kakaocdn.net/account_images/default_profile.jpeg","score":34,"time":1767366801267},
  {"name":"임현종","image":"https://k.kakaocdn.net/dn/iBUHV/btsQpZI47OH/NSHAGW4Ddtpu4CKGlqk4Sk/img_640x640.jpg","score":32,"time":1767341229742,"message":"재밌노"},
  {"name":"주세영","image":"https://img1.kakaocdn.net/thumb/R640x640.q70/?fname=http://t1.kakaocdn.net/account_images/default_profile.jpeg","score":29,"time":1767316001575},
  {"name":" 위훈성","image":"https://img1.kakaocdn.net/thumb/R640x640.q70/?fname=http://t1.kakaocdn.net/account_images/default_profile.jpeg","score":27,"time":1767372973573}
];

const gameScoreSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  userId: { type: String, required: true }, 
  name: String,
  image: String,
  score: Number,
  message: String,
  time: Number
});

const GameScore = mongoose.model('GameScore', gameScoreSchema);

async function runScoreMigration() {
  console.log('🚀 사과게임 점수 마이그레이션을 시작합니다...');

  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ MongoDB 연결 성공');

    const formattedData = scoresData.map(item => ({
      id: nanoid(),
      userId: `migrated_${nanoid(10)}`, // Generate dummy user ID
      name: item.name,
      image: item.image,
      score: item.score,
      message: item.message || '',
      time: item.time
    }));

    if (formattedData.length > 0) {
      await GameScore.deleteMany({}); // Clear existing to prevent duplicates/conflicts during retry
      await GameScore.insertMany(formattedData);
      console.log(`🎉 총 ${formattedData.length}개의 게임 점수를 성공적으로 복구했습니다!`);
    }

  } catch (error) {
    console.error('❌ 오류 발생:', error);
  } finally {
    await mongoose.disconnect();
    console.log('👋 종료합니다.');
    process.exit(0);
  }
}

runScoreMigration();
