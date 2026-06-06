# CHATGPT.md — ChatGPT 작업 지침 (기능 위주)

> 이 프로젝트는 **Claude(UI 위주)** 와 **ChatGPT(기능 위주)** 가 함께 작업합니다.
> "위주"는 **주력 담당**이라는 뜻이지 **전담**이 아닙니다. 필요하면 서로의 영역도 건드릴 수 있되,
> 그때는 상대 영역의 기존 패턴을 그대로 따르고 변경 의도를 커밋 메시지/주석에 남깁니다.
> 상대(UI) 담당 규칙은 CLAUDE.md 참고.

---

## 1. 프로젝트 개요

HSK/JLPT 같은 시험별 어휘를 **주제별 카드 · 체크 기록 · 지운 단어 · 퀴즈 · 복습(SRS) · 쓰기 연습**으로
학습하는 **정적 웹앱**입니다. UI 텍스트는 한국어.

- **빌드 도구 없음**: 번들러/트랜스파일러 없이 브라우저가 파일을 그대로 실행. `index.html`을 열면 동작.
- **프레임워크 없음**: Vanilla JS만 사용. TypeScript·React 등 도입 금지.
- 배포는 정적 호스팅(Vercel). Firebase는 선택 사항(없어도 `localStorage`로 동작).
- 제발!!!!! UTF-8로 읽어주세요!!!!

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

## 3. 너(ChatGPT)의 주력 영역 — 기능/로직

- **데이터 모델**: 어휘 세트 형식, `data/*.js`, `data/sets.js`(manifest), 커스텀 단어/세트 구조.
- **상태/영속화**: `app.js`의 `localStorage` 저장·로드, 세트 스코프 키, 상태 객체(`app`) 관리.
- **Firebase 동기화**: 인증(Google), Firestore 읽기/쓰기, `getStudyState`/`applyStudyState`,
  `saveCloudState`/`loadCloudState`, 충돌·머지 정책, `firestore.rules`, `api/firebase-config.js`.
- **알고리즘**: `srs.js`(간격 반복), `quiz.js`(문제 출제·채점), 병음 정규화/매칭,
  후리가나 토크나이즈(`renderFurigana` 등 로직 부분).
- **데이터 무결성**: 입력 검증/정규화(`sanitizeCustomWords` 등), 키 생성, 마이그레이션/버전(`version` 필드).

화면 구조·스타일·시각 표현이 필요한 변경이면 Claude 영역이므로,
직접 하더라도 CLAUDE.md의 규칙(특히 CSS 변수·`createElement`·접근성)을 따르고 표시를 남깁니다.

## 4. 코드 컨벤션

- 들여쓰기 **2칸**, 세미콜론 사용, 문자열은 작은따옴표.
- `app.js`는 단일 **IIFE** 안에 모든 것이 들어 있고, 함수는 **함수 선언식**. 호이스팅 의존(정의 순서 자유).
- 모듈 간 연결은 `window.*` 전역:
  - `window.VOCAB_SETS[id]` — 세트 데이터, `window.VOCAB_SET_MANIFEST` — 세트 목록.
  - `window.HSKQuiz.createQuizController(...)`, `window.HSKReview`(`schedule`, `isDue`, `NEW_PER_SESSION`, `createReviewController`).
  - `window.STUDY_FIREBASE_CONFIG` — Firebase 설정.
- 새 외부 의존성 추가 금지(상의 없이). Firebase는 `import('https://www.gstatic.com/firebasejs/.../...')`로
  **동적 import**만 사용(빌드가 없으므로).
- `Math.random()`/`Date.now()`는 브라우저 런타임에서 자유롭게 사용 가능.

## 5. 핵심 데이터/저장 규약

- 단어 객체: `{ key, number, front, reading, meaning, partOfSpeech }`.
  - `key`는 세트 내 **고유**해야 하며 체크/SRS의 `localStorage` 키로도 쓰임. 커스텀 단어 키는
    `` `${setId}-c-...` `` 형식으로 생성(`makeCustomKey`).
- 세트: `{ id, title, pageTitle, subtitle, language, labels:{front,reading,meaning}, categories:[...] }`.
  - `language` 분기: `zh*`(병음 연습/입력), `ja*`(후리가나). 새 동작 추가 시 이 컨벤션을 따를 것.
- `localStorage` 키 스코프: `setScopedKey(name)` → `` `${setId}-${name}` ``
  (`removed-words`, `srs`, `hide-checked`, `custom-words`). 체크 상태는 개별 `key` 자체를 키로 저장.
- 커스텀 세트 목록: `localStorage['vocab-custom-sets']` + Firestore `users/{uid}/meta/customSets`.
- **Firestore 경로**:
  - 세트별 학습 상태: `users/{uid}/studySets/{setId}` (필드: `checkedKeys, removedKeys, hideChecked, srs, customWords, version`).
  - 커스텀 세트 메타: `users/{uid}/meta/customSets`.
  - **새 경로를 쓰면 `firestore.rules`에 규칙을 추가하고 배포해야 함**(`firebase deploy --only firestore:rules`).
- 동기화는 현재 **cloud-authoritative**(로그인 시 클라우드가 로컬을 덮어씀). 다른 정책으로 바꾸면
  데이터 유실 위험을 검토하고 명시할 것.

## 6. 검증

- 저장 후 `node --check app.js`(및 `quiz.js`, `srs.js`)로 구문 확인.
- 로직 변경은 가능하면 작은 테스트 케이스(콘솔/임시 스크립트)로 확인. SRS는 등급별 간격 변화,
  퀴즈는 병음 정규화 매칭을 꼭 점검.
- `index.html`을 브라우저로 열어 로그인 없이(=`localStorage`만으로) 전 기능이 동작하는지 확인.

## 7. 협업 규칙

- 같은 함수/블록을 양쪽이 동시에 헤집지 않기. 큰 변경 전 의도를 커밋 메시지에 명확히.
- 기존 패턴·톤 유지, 최소 변경. 새 라이브러리/빌드 단계 추가 금지(상의 없이).
- 상대(UI) 영역을 건드렸으면 "왜 손댔는지"를 주석/커밋 본문에 남기기.
- 영속화·동기화 스키마를 바꾸면 하위 호환(기존 저장값 로드)과 `version` 처리까지 같이 챙기기.
