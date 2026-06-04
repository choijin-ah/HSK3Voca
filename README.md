# Vocab Study

HSK/JLPT 같은 시험별 어휘를 주제별 카드, 체크 기록, 지운 단어, 퀴즈 모드로 학습하는 정적 웹앱입니다.

## 구조

```txt
index.html              # 공통 화면 껍데기
styles.css              # 공통 스타일
app.js                  # 세트 로딩, 렌더링, 검색, 체크, Firebase 동기화
quiz.js                 # 퀴즈 모드
data/
  sets.js               # 사용 가능한 어휘 세트 목록
  hsk3.js               # HSK3 어휘 데이터
firebase-config.js      # 로컬 Firebase 설정 placeholder
api/firebase-config.js  # Vercel 환경변수 -> 브라우저 전달
```

새 시험을 추가할 때는 `data/jlpt-n5.js` 같은 데이터 파일을 만들고 `data/sets.js`에 항목을 추가하면 됩니다.

## 데이터 세트 형식

```js
window.VOCAB_SETS = window.VOCAB_SETS || {};
window.VOCAB_SETS['jlpt-n5'] = {
  id: 'jlpt-n5',
  title: 'JLPT N5 어휘',
  pageTitle: 'JLPT N5 어휘 학습',
  subtitle: '기초 일본어 어휘',
  language: 'ja-JP',
  labels: {
    front: '단어',
    reading: '읽기',
    meaning: '뜻'
  },
  categories: [
    {
      id: 'greetings',
      title: '인사',
      priority: '1순위',
      description: '자주 쓰는 인사 표현',
      tip: { label: '암기 포인트', text: '상황별로 묶어 외우세요.' },
      examples: [],
      words: [
        {
          key: 'jlpt-n5-1',
          number: 1,
          front: 'ありがとう',
          reading: 'ありがとう',
          meaning: '고마워',
          partOfSpeech: '(감)'
        }
      ]
    }
  ]
};
```

## Firebase 설정

Firebase를 설정하지 않아도 브라우저 `localStorage`로 학습 기록이 저장됩니다.

계정별 저장을 쓰려면 Firebase Authentication, Firestore를 켜고 Vercel 환경변수에 아래 값을 넣습니다.

```txt
FIREBASE_API_KEY=...
FIREBASE_AUTH_DOMAIN=...
FIREBASE_PROJECT_ID=...
FIREBASE_STORAGE_BUCKET=...
FIREBASE_MESSAGING_SENDER_ID=...
FIREBASE_APP_ID=...
FIREBASE_MEASUREMENT_ID=...
```

Firestore 문서는 `users/{uid}/studySets/{setId}`에 저장됩니다.
