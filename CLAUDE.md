# CLAUDE.md — Claude 작업 지침 (UI 위주)

> 이 프로젝트는 **Claude(UI 위주)** 와 **ChatGPT(기능 위주)** 가 함께 작업합니다.
> "위주"는 **주력 담당**이라는 뜻이지 **전담**이 아닙니다. 필요하면 서로의 영역도 건드릴 수 있되,
> 그때는 상대 영역의 기존 패턴을 그대로 따르고 변경 의도를 커밋 메시지/주석에 남깁니다.
> 상대(기능) 담당 규칙은 [CHATGPT.md](CHATGPT.md) 참고.

---

## 1. 프로젝트 개요

HSK/JLPT 같은 시험별 어휘를 **주제별 카드 · 체크 기록 · 지운 단어 · 퀴즈 · 복습(SRS) · 쓰기 연습**으로
학습하는 **정적 웹앱**입니다. UI 텍스트는 한국어.

- **빌드 도구 없음**: 번들러/트랜스파일러 없이 브라우저가 파일을 그대로 실행. `index.html`을 열면 동작.
- **프레임워크 없음**: Vanilla JS만 사용. React/Vue 등 도입 금지.
- 배포는 정적 호스팅(Vercel). Firebase는 선택 사항(없어도 `localStorage`로 동작).

## 2. 파일 구조

```txt
index.html              # 화면 껍데기(마크업) — Claude 주력
styles.css              # 전체 스타일/디자인 토큰 — Claude 주력
app.js                  # 세트 로딩, DOM 렌더링, 상태/필터, Firebase 동기화 (공유)
quiz.js                 # 퀴즈 로직 — ChatGPT 주력
srs.js                  # 간격 반복(SRS) 알고리즘 — ChatGPT 주력
data/
  sets.js               # 어휘 세트 목록(manifest)
  hsk3.js, jlpt-n3.js   # 어휘 데이터
firebase-config.js      # 로컬 Firebase placeholder
api/firebase-config.js  # Vercel 환경변수 → 브라우저 전달
firestore.rules         # Firestore 보안 규칙
```

## 3. 너(Claude)의 주력 영역 — UI/UX

- **마크업**: `index.html`의 구조, 시맨틱 태그, 폼/모달/패널.
- **스타일**: `styles.css` 전체. 레이아웃, 반응형, 애니메이션, 다크 모드, 시각적 다듬기.
- **DOM 렌더링/상호작용**: `app.js`의 렌더 함수(`renderSet`, `renderCategory`, `renderWordCard`,
  `renderLanding`, `renderTocCard`, 모달 열고/닫기 등)와 클릭/키보드 이벤트 바인딩.
- **접근성**: `aria-*`, 포커스 이동, 키보드 조작(Esc 닫기 등), `sr-only`.
- **UX 흐름**: 메뉴/네비/토스트성 힌트(`.modal-hint`)·빈 상태 안내.

기능(데이터/동기화/알고리즘)이 필요한 변경이면 ChatGPT 영역이므로,
직접 하더라도 [CHATGPT.md](CHATGPT.md)의 규칙을 따르고 표시를 남깁니다.

## 4. 코드 컨벤션

- 들여쓰기 **2칸**, 세미콜론 사용, 문자열은 작은따옴표.
- `app.js`는 단일 **IIFE**(`(function(){ ... })()`) 안에 모든 것이 들어 있고,
  함수는 **함수 선언식**(`function name() {})`. 호이스팅에 의존하므로 정의 순서 자유.
- 모듈 간 연결은 `window.*` 전역으로: `window.VOCAB_SETS`, `window.VOCAB_SET_MANIFEST`,
  `window.HSKQuiz`, `window.HSKReview`, `window.STUDY_FIREBASE_CONFIG`.
- DOM 생성은 `createElement(tag, className, text)` 헬퍼 사용. `innerHTML`로 사용자/데이터
  문자열을 넣지 말 것(XSS·일관성). 텍스트는 `textContent`.
- 새 DOM 요소는 `cacheElements()`의 `elements` 객체에 등록해서 참조.
- **CSS 디자인 토큰**: 색/반경/그림자/이징은 `:root`의 CSS 변수(`--accent`, `--line`, `--radius`,
  `--shadow-md`, `--ease` 등) 사용. 하드코딩 색상 지양. 다크 모드는
  `@media (prefers-color-scheme:dark)`에서 같은 변수를 덮어씀 → **변수만 쓰면 다크 모드 자동 대응**.
- UI 문구는 **한국어**.

## 5. 데이터/상태 — 알아둘 것 (네가 렌더할 때 참조)

- 단어 객체 형태: `{ key, number, front, reading, meaning, partOfSpeech }`.
- 세트: `window.VOCAB_SETS[id] = { id, title, pageTitle, subtitle, language, labels:{front,reading,meaning}, categories:[...] }`.
- `language`로 동작 분기: `zh*` → 병음 쓰기 연습/입력, `ja*` → 후리가나(루비) 렌더.
- 사용자별 상태는 `app` 객체(`set, checks, removedKeys, srs, customWords, hideChecked, ...`)에 있고
  `localStorage`(키: `` `${setId}-name` ``)와 Firestore에 저장됨. **렌더는 이 상태를 읽어서 그림**.
- 커스텀 단어는 `app.customWords` → `setCategories()`가 "내 단어" 카테고리로 합성해 렌더.

## 6. 검증

- 저장 후 `node --check app.js` (및 quiz.js/srs.js)로 구문 확인.
- `index.html`을 브라우저로 직접 열어 동작 확인(로그인 없이 `localStorage`만으로 전체 기능 동작).
- 반응형은 좁은 폭(≤480px)까지 확인.

## 7. 협업 규칙

- 같은 함수/블록을 양쪽이 동시에 헤집지 않기. 큰 변경 전 의도를 커밋 메시지에 명확히.
- 기존 패턴·톤을 유지하고 최소 변경. 새 라이브러리/빌드 단계 추가 금지(상의 없이).
- 상대 영역을 건드렸으면 한 줄 주석이나 커밋 본문으로 "왜 손댔는지" 남기기.
