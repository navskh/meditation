#!/usr/bin/env node
/**
 * 묵상 목록 자동 생성기
 *
 * topics/<주제>/<YYYY-MM-DD>.md 파일들을 스캔해서
 *   1) meditations.json  (HTML 뷰어가 읽는 manifest)
 *   2) README.md 의 "주제별 목록" / "날짜별 목록" 표
 * 를 자동으로 다시 만든다.
 *
 * 사용법:  node generate.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const TOPICS_DIR = path.join(ROOT, 'topics');
const MANIFEST = path.join(ROOT, 'meditations.json');
const README = path.join(ROOT, 'README.md');

const DATE_RE = /^(\d{4}-\d{2}-\d{2})\.md$/;

/** 마크다운에서 첫 H1(# ...) 제목을 뽑는다. 없으면 null */
function firstHeading(md) {
  const m = md.match(/^#\s+(.+?)\s*$/m);
  return m ? m[1].trim() : null;
}

function scan() {
  if (!fs.existsSync(TOPICS_DIR)) return [];
  const items = [];

  for (const topic of fs.readdirSync(TOPICS_DIR)) {
    const topicPath = path.join(TOPICS_DIR, topic);
    if (!fs.statSync(topicPath).isDirectory()) continue;

    for (const file of fs.readdirSync(topicPath)) {
      const m = file.match(DATE_RE);
      if (!m) continue;
      const date = m[1];
      const rel = `topics/${topic}/${file}`;
      const md = fs.readFileSync(path.join(topicPath, file), 'utf8');
      items.push({
        topic,
        date,
        path: rel,
        title: firstHeading(md) || `${date} 묵상`,
      });
    }
  }

  // 최신 날짜 우선, 같은 날짜면 주제 가나다순
  items.sort((a, b) =>
    a.date === b.date ? a.topic.localeCompare(b.topic, 'ko') : b.date.localeCompare(a.date)
  );
  return items;
}

function writeManifest(items) {
  const data = {
    generatedAt: new Date().toISOString().slice(0, 10),
    count: items.length,
    meditations: items,
  };
  fs.writeFileSync(MANIFEST, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

/** README 의 목록 섹션 두 개를 갈아끼운다 */
function writeReadme(items) {
  // 주제별 그룹핑
  const byTopic = {};
  for (const it of items) (byTopic[it.topic] ||= []).push(it);

  let topicSection = '## 주제별 목록\n\n';
  if (items.length === 0) {
    topicSection += '_아직 묵상이 없습니다._\n';
  } else {
    for (const topic of Object.keys(byTopic).sort((a, b) => a.localeCompare(b, 'ko'))) {
      topicSection += `### ${topic}\n`;
      for (const it of byTopic[topic].sort((a, b) => b.date.localeCompare(a.date))) {
        topicSection += `- [${it.date}](${it.path})\n`;
      }
      topicSection += '\n';
    }
    topicSection = topicSection.trimEnd() + '\n';
  }

  let dateSection = '## 날짜별 목록\n\n';
  if (items.length === 0) {
    dateSection += '_아직 묵상이 없습니다._\n';
  } else {
    dateSection += '| 날짜 | 주제 | 링크 |\n|------|------|------|\n';
    for (const it of items) {
      dateSection += `| ${it.date} | ${it.topic} | [열기](${it.path}) |\n`;
    }
  }

  let readme = fs.readFileSync(README, 'utf8');
  // "## 주제별 목록" 부터 문서 끝(또는 다음 비-목록 섹션)까지를 통째로 교체
  const idx = readme.indexOf('## 주제별 목록');
  const head = idx >= 0 ? readme.slice(0, idx) : readme.trimEnd() + '\n\n';
  readme = head + topicSection + '\n' + dateSection;
  if (!readme.endsWith('\n')) readme += '\n';
  fs.writeFileSync(README, readme, 'utf8');
}

const items = scan();
writeManifest(items);
writeReadme(items);
console.log(`✅ 묵상 ${items.length}편 → meditations.json, README.md 갱신 완료`);
