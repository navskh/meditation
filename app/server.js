#!/usr/bin/env node
/**
 * 성경 묵상 오서링 앱 — 로컬 백엔드
 *
 *  - editor.html(에디터 + 미리보기)을 서빙
 *  - /api/publish: topics/<주제>/<날짜>.md 저장 → generate.js → git add/commit/push
 *  - /api/topics : 기존 주제 폴더 목록 (자동완성용)
 *  - /api/status : git 원격 정보
 *
 * 실행:  cd app && npm install && npm start   (기본 http://localhost:4321)
 */

const express = require('express');
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const APP_DIR = __dirname;
const ROOT = path.resolve(APP_DIR, '..'); // meditation 저장소 루트
const TOPICS_DIR = path.join(ROOT, 'topics');
const GENERATE = path.join(ROOT, 'generate.js');

const PORT = process.env.PORT || 4321;

/* ───────────────────────── 유틸 ───────────────────────── */
function gitRemote() {
  const r = spawnSync('git', ['remote', 'get-url', 'origin'], { cwd: ROOT, encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : null;
}
function listTopics() {
  if (!fs.existsSync(TOPICS_DIR)) return [];
  return fs
    .readdirSync(TOPICS_DIR)
    .filter((n) => fs.statSync(path.join(TOPICS_DIR, n)).isDirectory());
}
function run(cmd, args, cwd) {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8' });
  return { ok: r.status === 0, out: (r.stdout || '') + (r.stderr || '') };
}

/* ───────────────────────── 서버 ───────────────────────── */
const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.static(APP_DIR));

app.get('/api/status', (req, res) => {
  res.json({ remote: gitRemote(), root: ROOT });
});

app.get('/api/topics', (req, res) => {
  res.json({ topics: listTopics() });
});

app.post('/api/publish', (req, res) => {
  const { topic, date, content, push = true } = req.body || {};

  // 입력 검증
  if (!topic || /[\\/]|\.\./.test(topic)) {
    return res.status(400).json({ error: '주제 이름이 비었거나 / \\ .. 를 포함합니다.' });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) {
    return res.status(400).json({ error: '날짜는 YYYY-MM-DD 형식이어야 합니다.' });
  }
  if (!content || !content.trim()) {
    return res.status(400).json({ error: '묵상 내용이 비어 있습니다.' });
  }

  const topicDir = path.join(TOPICS_DIR, topic);
  const rel = path.join('topics', topic, `${date}.md`);
  const abs = path.join(ROOT, rel);

  try {
    fs.mkdirSync(topicDir, { recursive: true });
    const body = content.endsWith('\n') ? content : content + '\n';
    fs.writeFileSync(abs, body, 'utf8');
  } catch (e) {
    return res.status(500).json({ error: '파일 저장 실패: ' + e.message });
  }

  const steps = [];
  // 1) manifest/README 갱신
  const gen = run('node', [GENERATE], ROOT);
  steps.push({ step: 'generate.js', ok: gen.ok, out: gen.out.trim() });

  let pushed = false;
  if (push) {
    const add = run('git', ['add', '-A'], ROOT);
    steps.push({ step: 'git add', ok: add.ok, out: add.out.trim() });

    const commit = run('git', ['commit', '-m', `meditation: ${topic} ${date}`], ROOT);
    steps.push({ step: 'git commit', ok: commit.ok, out: commit.out.trim() });

    const pushR = run('git', ['push'], ROOT);
    steps.push({ step: 'git push', ok: pushR.ok, out: pushR.out.trim() });
    pushed = pushR.ok;
  }

  res.json({ ok: true, path: rel, pushed, steps });
});

app.get('/', (req, res) => res.sendFile(path.join(APP_DIR, 'editor.html')));

app.listen(PORT, () => {
  console.log(`\n✍️  묵상 오서링 앱 실행 중`);
  console.log(`    → http://localhost:${PORT}`);
  console.log(`    저장소: ${ROOT}`);
  console.log(`    원격: ${gitRemote() || '(없음)'}\n`);
});
