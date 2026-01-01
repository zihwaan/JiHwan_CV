import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { nanoid } from 'nanoid';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/jihwan_cv';

// ────────────────────────────────────────────────────────────────────
// 1. 요청하신 데이터를 기반으로 수동 입력 목록을 생성했습니다.
// ────────────────────────────────────────────────────────────────────
const manualData = [
  { name: "안성현", date: "2025-07-24 23:11:41", text: "😽", image: "/assets/ansung.jpg" },
  { name: "신채훈", date: "2025-06-13 23:09:27", text: "비밀 댓글입니다.", image: "/assets/chea.jpg" },
  { name: "서혜지", date: "2025-05-30 17:52:25", text: "진짜 폼 미쳤네요••• 스팸인 줄 알고 누를까말까 고민 백만번 했는데, 고민하길 잘했다^___^\n항상 대성하세요~~🎉🥳🎊 갓지환~", image: "/assets/hwe.jpg" },
  { name: "장혁", date: "2025-05-29 20:50:57", text: "디도스 공격을 위해 다크웹에 뿌리겠습니다 링크", image: "/assets/jangyuek.jpeg" },
  { name: "지환", date: "2025-05-29 20:43:49", text: "다들 감사합니다^^;;", image: "/assets/jihwan.jpg" },
  { name: "구자혁", date: "2025-05-29 10:34:48", text: "안녕하세요 일론머스크입니다 메일 확인 가능하실까요?", image: "/assets/zahyeok.jpg" },
  { name: "황정현", date: "2025-05-29 06:48:35", text: "나 J.황인데 이 사람 뽑고싶다.", image: "/assets/jhwang.jpeg" },
  { name: "한지인", date: "2025-05-29 02:16:28", text: "우왕~", image: "/assets/jiin.jpg" },
  { name: "진무", date: "2025-05-29 01:22:57", text: "해당 사이트는 테러 당했습니다. 조심하십시오 !", image: "/assets/jimmoo.jpeg" },
  { name: "이유민", date: "2025-05-29 00:29:31", text: "#include <stdio.h>\n\nint main() {\n    while (1) {\n        printf(\"아 맞다 근데 지환아 그거 알아? 너무 잘생긴걸 봐서 기분이 좋아지면 단기 기억상실증이 걸린대~ㅋㅋ 어이없지 않아? 뭔 기억을 잃어ㅋㅋㅋㅋ\n아 맞다 근데 지환아 그거 알아? 너무 잘생긴걸 봐서 기분이 좋아지면 단기 기억상실증이 걸린대~ㅋㅋ 어이없지 않아? 뭔 기억을 잃어ㅋㅋㅋㅋ\n\");\n    }\n    return 0;}", image: "/assets/yeumin.jpeg" },
  { name: "박정원", date: "2025-05-29 00:25:44", text: "안녕하세요 오픈AI 한국지사설립위원회 팀장 박정원입니다. 샘 알트먼 의장님께서 귀하의 오픈AI로의 이직을 원하시기에 연락드립니다. 대면면접 가능하신 날짜 회신해주면 감사하겠습니다.", image: "/assets/jung.jpeg" },
  { name: "이관형", date: "2025-05-29 00:24:22", text: "잘 보고 갑니다", image: "/assets/gwan.jpg" },
  { name: "안준영", date: "2025-05-29 00:23:31", text: "발닦고 자라\n\n- 토니 스타크", image: "/assets/juneyoung.jpg" },
  { name: "조영재", date: "2025-05-29 00:22:40", text: "지환님의 무궁한 발전을 기원합니다.", image: "/assets/youngjae.jpeg" },
  { name: "윤승효", date: "2025-05-29 00:22:32", text: "[국외발신]\n다음달에한국에가는데,널만날수있을거라고생각하니까너무기뻐!공항에나와줄수있지?내LINE:5dk5꼭추가해줘,오랜만에연락하네!", image: "/assets/huo.jpg" },
  { name: "전형준", date: "2025-05-29 00:19:26", text: "관리자에 의해 숨겨진 글입니다.", image: "/assets/hyungjun.jpg" },
  { name: "국지호", date: "2025-05-29 00:17:07", text: "멋있어요~^^", image: "/assets/jiho.jpg" },
  { name: "서휘경", date: "2025-05-28 23:57:16", text: "지환닷컴 잘 구경하고 갑니다 😊👍🏻\n앞으로의 지환님도 응원해요 ~ 🍀", image: "/assets/hwi.jpeg" },
  { name: "지환", date: "2025-05-28 23:34:05", text: "안녕하세요.\n제 개인 웹페이지에 들러주셨군요!\n방명록에 짧게 한마디 남겨주시면, 틈날 때마다 읽겠습니다 😄\n다들 감사합니다 :)", image: "/assets/jihwan.jpg" }
];

// ────────────────────────────────────────────────────────────────────
// 이하 로직
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
  console.log('🚀 수동 데이터 이전을 시작합니다...');

  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ MongoDB 연결 성공');

    const formattedData = manualData.map(item => ({
      id: nanoid(),
      name: item.name,
      text: item.text,
      image: item.image || '//assets/default_avatar.png',
      time: new Date(item.date).getTime()
    }));

    if (formattedData.length > 0) {
      await Comment.insertMany(formattedData);
      console.log(`🎉 총 ${formattedData.length}개의 방명록을 성공적으로 복구했습니다!`);
    }

  } catch (error) {
    console.error('❌ 오류 발생:', error);
  } finally {
    await mongoose.disconnect();
    console.log('👋 종료합니다.');
    process.exit(0);
  }
}

runManualInsert();
