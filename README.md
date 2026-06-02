# HSK3Voca

HSK 3급 단어 암기표입니다. 체크한 단어, 숨긴 단어, 지운 단어 목록을 Google 로그인 계정별로 Firebase Firestore에 저장할 수 있습니다.

## Firebase 설정

1. Firebase 콘솔에서 프로젝트를 만듭니다.
2. Authentication > Sign-in method에서 Google 로그인을 켭니다.
3. Firestore Database를 만듭니다.
4. Firestore Rules에 `firestore.rules` 내용을 붙여 넣고 Publish 합니다.
5. Project settings > Your apps에서 Web 앱을 추가하고 Firebase config 값을 `firebase-config.js`에 붙여 넣습니다.
6. Authentication > Settings > Authorized domains에 Vercel 배포 도메인을 추가합니다.

Firebase 설정 전에는 기존처럼 브라우저 임시 저장만 동작합니다. 설정 후 Google 로그인하면 `users/{uid}/studySets/hsk3` 문서에 계정별로 저장됩니다.
