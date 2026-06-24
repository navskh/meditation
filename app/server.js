#!/usr/bin/env node
/**
 * 성경 묵상 오서링 앱 — 로컬 백엔드
 *
 *  - editor.html(3분할 UI)을 서빙
 *  - /api/chat   : 로컬 CLI(claude / codex)를 서브프로세스로 실행해 AI와 대화
 *  - /api/publish: topics/<주제>/<날짜>.md 저장 → generate.js → git add/commit/push
 *  - /api/topics : 기존 주제 폴더 목록 (자동완성용)
 *  - /api/status : 사용 가능한 엔진 / git 원격 정보
 *
 * 실행:  cd app && npm install && npm start   (기본 http://localhost:4321)
 */

const express = require('express');
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const APP_DIR = __dirname;
const ROOT = path.resolve(APP_DIR, '..'); // meditation 저장소 루트
const TOPICS_DIR = path.join(ROOT, 'topics');
const GENERATE = path.join(ROOT, 'generate.js');
// CLI 세션이 프로젝트 파일을 스캔하지 않도록 격리된 작업 디렉터리에서 실행한다
const WORKSPACE = path.join(APP_DIR, '.workspace');

const PORT = process.env.PORT || 4321;
const CHAT_TIMEOUT_MS = 180000; // 3분

fs.mkdirSync(WORKSPACE, { recursive: true });

/* ───────────────────────── 엔진 탐지 ───────────────────────── */
function has(cmd) {
  const r = spawnSync('which', [cmd], { encoding: 'utf8' });
  return r.status === 0 && r.stdout.trim().length > 0;
}
const ENGINES = { claude: has('claude'), codex: has('codex') };

const SYSTEM_PROMPT = [
  '당신은 한국어로 대화하는 "성경 묵상 글쓰기 도우미"입니다.',
  '사용자가 그날의 말씀을 더 깊이 묵상하고, 솔직한 적용과 기도로 글을 써내려가도록 돕습니다.',
  '본문 관찰 질문 던지기, 핵심 메시지 요약, 적용 질문 제안, 사용자가 쓴 초안 다듬기 등을 합니다.',
  '따뜻하고 간결하게, 설교조로 길게 늘어놓지 말고 사용자가 직접 쓰도록 이끄세요.',
  '파일을 읽거나 도구를 쓰지 말고, 오직 대화 텍스트로만 답하세요.',
].join(' ');

/* ───────────────────────── 대화 → 프롬프트 ───────────────────────── */
function buildPrompt(messages) {
  const transcript = messages
    .map((m) => `${m.role === 'user' ? '[사용자]' : '[도우미]'}\n${m.content}`)
    .join('\n\n');
  return (
    '다음은 지금까지의 대화입니다. 마지막 [사용자] 발언에 이어 [도우미]로서 한국어로 자연스럽게 답하세요.\n\n' +
    transcript +
    '\n\n[도우미]'
  );
}

function runCli(engine, prompt) {
  return new Promise((resolve, reject) => {
    let cmd, args;
    if (engine === 'codex') {
      // 비대화형 실행 모드
      cmd = 'codex';
      args = ['exec', prompt];
    } else {
      cmd = 'claude';
      // --max-turns 1: 도구 사용/멀티턴 없이 한 번의 텍스트 응답만 (헤드리스 행 방지)
      args = [
        '-p', prompt,
        '--output-format', 'json',
        '--max-turns', '1',
        '--append-system-prompt', SYSTEM_PROMPT,
      ];
    }

    // stdin 을 닫아(ignore) CLI 가 표준입력을 기다리며 멈추지 않게 한다
    const child = spawn(cmd, args, { cwd: WORKSPACE, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`${engine} 응답 시간 초과 (${CHAT_TIMEOUT_MS / 1000}s)`));
    }, CHAT_TIMEOUT_MS);

    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        return reject(new Error(err.trim() || `${engine} 종료 코드 ${code}`));
      }
      if (engine === 'claude') {
        try {
          const j = JSON.parse(out);
          return resolve((j.result || '').trim() || out.trim());
        } catch {
          return resolve(out.trim());
        }
      }
      resolve(out.trim());
    });
  });
}

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
  res.json({ engines: ENGINES, remote: gitRemote(), root: ROOT });
});

app.get('/api/topics', (req, res) => {
  res.json({ topics: listTopics() });
});

app.post('/api/chat', async (req, res) => {
  const { messages, engine } = req.body || {};
  const useEngine = engine === 'codex' ? 'codex' : 'claude';
  if (!ENGINES[useEngine]) {
    return res.status(400).json({ error: `'${useEngine}' CLI 를 찾을 수 없습니다.` });
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages 가 필요합니다.' });
  }
  try {
    const reply = await runCli(useEngine, buildPrompt(messages));
    res.json({ reply });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
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
  const list = Object.entries(ENGINES)
    .map(([k, v]) => `${k} ${v ? '✓' : '✗'}`)
    .join('  ');
  console.log(`\n✍️  묵상 오서링 앱 실행 중`);
  console.log(`    → http://localhost:${PORT}`);
  console.log(`    엔진: ${list}`);
  console.log(`    저장소: ${ROOT}`);
  console.log(`    원격: ${gitRemote() || '(없음)'}\n`);
});
