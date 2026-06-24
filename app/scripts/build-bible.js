#!/usr/bin/env node
/**
 * 개역한글 본문 데이터 빌드 스크립트
 *
 *  yuhwan/Bible-krv(개역한글, 한글 책이름) 66권 JSON을 내려받아
 *  app/data/bible-krv.json 하나로 통합한다.
 *
 *  사용:  node app/scripts/build-bible.js
 *  결과:  { version:"개역한글", books:[66권], data:{ 책명:{ 장:{ 절:본문 } } } }
 *
 *  ※ bible-krv.json 을 저장소에 커밋하지 않는 경우(.gitignore), 클론 후 1회 실행하면 됩니다.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const BASE = 'https://raw.githubusercontent.com/yuhwan/Bible-krv/HEAD/';
const OUT = path.join(__dirname, '..', 'data', 'bible-krv.json');

function get(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode !== 200) return reject(new Error(`${res.statusCode} ${url}`));
        let buf = '';
        res.setEncoding('utf8');
        res.on('data', (c) => (buf += c));
        res.on('end', () => resolve(JSON.parse(buf)));
      })
      .on('error', reject);
  });
}

(async () => {
  const books = await get(BASE + 'books.json');
  console.log(`books: ${books.length}`);
  const data = {};
  for (let i = 0; i < books.length; i++) {
    const name = books[i];
    const d = await get(BASE + encodeURIComponent(name + '.json'));
    const ch = {};
    for (const c of d.chapters) {
      ch[String(c.chapter)] = Object.fromEntries(c.verses.map((v) => [String(v.verse), v.text]));
    }
    data[name] = ch;
    console.log(`${String(i + 1).padStart(2)} ${name}  장:${Object.keys(ch).length}`);
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({ version: '개역한글', books, data }), 'utf8');
  console.log('DONE →', OUT);
})().catch((e) => {
  console.error('FAIL', e.message);
  process.exit(1);
});
