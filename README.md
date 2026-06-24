# 📖 성경 묵상 (Meditation)

날짜별로 기록하되, **주제 폴더 안에** 날짜 파일을 두어 주제별로도 묶어 봅니다.
웹에서 보기 좋고, **묵상 한 편을 A4 한 장으로 깔끔하게 인쇄**할 수 있는 뷰어가 함께 있습니다.

## 폴더 구조

```
meditation/
├── index.html         # 🖥️ 웹 뷰어 (GitHub Pages / 인쇄)
├── generate.js        # 🔄 목록 자동 생성기 (manifest + 아래 표)
├── meditations.json   # 뷰어가 읽는 묵상 목록 (자동 생성, 직접 수정 X)
├── README.md          # 이 문서 (전체 인덱스)
├── _template.md       # 새 묵상 작성용 자유 형식 템플릿
└── topics/            # 주제별 폴더
    └── 감사/
        └── 2026-06-24.md   # 날짜별 묵상
```

- **주제** = `topics/` 아래 폴더 이름 (예: `감사`, `믿음`, `고난`, `시편`)
- **날짜** = 파일 이름 (`YYYY-MM-DD.md`)
- 새 묵상은 `_template.md`를 복사해서 해당 주제 폴더에 날짜 이름으로 저장하면 됩니다.

## 묵상 추가하는 법

1. `topics/<주제>/<YYYY-MM-DD>.md` 로 새 묵상 작성 (없는 주제면 폴더만 새로 만들면 됨)
2. 터미널에서 `node generate.js` 실행 → 목록(`meditations.json`, 아래 표)이 자동 갱신
3. (배포 시) `git add . && git commit && git push`

## 웹에서 보기 / 인쇄

- **로컬**: 이 폴더에서 `python3 -m http.server 8000` 실행 후 <http://localhost:8000> 접속
  (`index.html`을 파일로 바로 열면 브라우저 보안 때문에 `.md`를 못 읽어요 — 꼭 서버로 띄우세요)
- **GitHub Pages**: 저장소 **Settings → Pages → Branch: main / root** 로 설정하면 게시됩니다
- **인쇄**: 뷰어에서 묵상을 연 뒤 우측 상단 **🖨️ 이 묵상 인쇄** → 사이드바·버튼은 빠지고 묵상 한 편이 A4 한 장으로 출력됩니다

## 주제별 목록

_아직 묵상이 없습니다._

## 날짜별 목록

_아직 묵상이 없습니다._
