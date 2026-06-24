/**
 * 개역한글 본문 조회 + 참조(reference) 파서
 *
 *  - 데이터: app/data/bible-krv.json  { version, books:[…], data:{ 책명:{ 장:{ 절:본문 } } } }
 *  - parseRef("창세기 19장")        → 창세기 19장 전체
 *  - parseRef("요한복음 3:16-18")   → 절 범위
 *  - 약어 지원: 창, 출, 요, 시, 고전, 살후, 요일 …
 */
const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, 'data', 'bible-krv.json');
const RAW = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
const BIBLE = RAW.data;
const BOOKS = RAW.books;

/* 정식 책이름 → 약어/이형 목록 */
const ALIASES = {
  창세기: ['창'], 출애굽기: ['출', '출애굽'], 레위기: ['레'], 민수기: ['민'], 신명기: ['신'],
  여호수아: ['수', '수아'], 사사기: ['삿'], 룻기: ['룻'], 사무엘상: ['삼상'], 사무엘하: ['삼하'],
  열왕기상: ['왕상'], 열왕기하: ['왕하'], 역대상: ['대상'], 역대하: ['대하'], 에스라: ['스'],
  느헤미야: ['느'], 에스더: ['에'], 욥기: ['욥'], 시편: ['시'], 잠언: ['잠'], 전도서: ['전'],
  아가: ['아'], 이사야: ['사'], 예레미야: ['렘'], 예레미야애가: ['애', '애가'], 에스겔: ['겔'],
  다니엘: ['단'], 호세아: ['호'], 요엘: ['욜'], 아모스: ['암'], 오바댜: ['옵'], 요나: ['욘'],
  미가: ['미'], 나훔: ['나'], 하박국: ['합'], 스바냐: ['습'], 학개: ['학'], 스가랴: ['슥'], 말라기: ['말'],
  마태복음: ['마'], 마가복음: ['막'], 누가복음: ['눅'], 요한복음: ['요'], 사도행전: ['행'],
  로마서: ['롬'], 고린도전서: ['고전'], 고린도후서: ['고후'], 갈라디아서: ['갈'], 에베소서: ['엡'],
  빌립보서: ['빌'], 골로새서: ['골'], 데살로니가전서: ['살전'], 데살로니가후서: ['살후'],
  디모데전서: ['딤전'], 디모데후서: ['딤후'], 디도서: ['딛'], 빌레몬서: ['몬'], 히브리서: ['히'],
  야고보서: ['약'], 베드로전서: ['벧전'], 베드로후서: ['벧후'],
  요한1서: ['요일', '요한일서', '요1서'], 요한2서: ['요이', '요한이서', '요2서'],
  요한3서: ['요삼', '요한삼서', '요3서'], 유다서: ['유'], 요한계시록: ['계', '계시록'],
};

/* 별칭 → 정식이름 룩업 (긴 별칭 우선 매칭을 위해 정렬된 키 목록도 만든다) */
const NAME_BY_ALIAS = {};
for (const book of BOOKS) {
  NAME_BY_ALIAS[book] = book;
  for (const a of ALIASES[book] || []) NAME_BY_ALIAS[a] = book;
}
const ALIAS_KEYS = Object.keys(NAME_BY_ALIAS).sort((a, b) => b.length - a.length);

/* "창세기 19장" 맨 앞에서 책이름을 떼어낸다 → { book, rest } */
function matchBook(input) {
  const s = input.replace(/\s+/g, '');
  for (const key of ALIAS_KEYS) {
    if (s.startsWith(key)) {
      return { book: NAME_BY_ALIAS[key], rest: s.slice(key.length) };
    }
  }
  return null;
}

/**
 * 참조 문자열을 해석한다.
 * 허용: "창세기 19장", "창 19", "창세기19", "요한복음 3:16",
 *        "요 3:16-18", "시편 23", "창세기 19장 1-10절"
 */
function parseRef(refRaw) {
  const ref = String(refRaw || '').trim();
  if (!ref) return { ok: false, error: '본문 참조를 입력하세요. 예) 창세기 19장' };

  const m = matchBook(ref);
  if (!m) return { ok: false, error: `책 이름을 찾지 못했어요: "${ref}"` };
  const book = m.book;

  // 장/절 부분: 한글 표시(장·절)와 물결/대시를 정규화
  let rest = m.rest.replace(/장/g, ':L').replace(/절/g, '').replace(/[~–—]/g, '-');
  // "19:L" (…장) → 장만 / "19:L1-10" → 장+절
  rest = rest.replace(/:L(?=\d)/, ':').replace(/:L$/, '');

  // 패턴: 장[ :절[-절] ]
  const mm = rest.match(/^(\d+)(?::(\d+)(?:-(\d+))?)?$/);
  if (!mm) return { ok: false, error: `장·절 형식을 이해하지 못했어요: "${ref}"` };

  const chapter = mm[1];
  const chapData = (BIBLE[book] || {})[chapter];
  if (!chapData) {
    const max = Object.keys(BIBLE[book] || {}).length;
    return { ok: false, error: `${book}는 ${max}장까지 있어요. (${chapter}장 없음)` };
  }

  const allVerses = Object.keys(chapData)
    .map(Number)
    .sort((a, b) => a - b);
  let from = mm[2] ? Number(mm[2]) : allVerses[0];
  let to = mm[3] ? Number(mm[3]) : mm[2] ? from : allVerses[allVerses.length - 1];
  if (to < from) [from, to] = [to, from];

  const verses = allVerses
    .filter((v) => v >= from && v <= to)
    .map((v) => ({ verse: v, text: chapData[String(v)] }));

  if (!verses.length) return { ok: false, error: `${book} ${chapter}장에 ${from}-${to}절이 없어요.` };

  const isWhole = !mm[2];
  const label = isWhole
    ? `${book} ${chapter}장`
    : from === to
    ? `${book} ${chapter}:${from}`
    : `${book} ${chapter}:${from}-${to}`;

  return { ok: true, version: RAW.version, book, chapter: Number(chapter), from, to, ref: label, verses };
}

module.exports = { parseRef, BOOKS, ALIASES };
