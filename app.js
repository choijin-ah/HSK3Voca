(function () {
  const manifest = window.VOCAB_SET_MANIFEST || [];
  const loadedScripts = new Set();

  const app = {
    set: null,
    checks: [],
    removedKeys: new Set(),
    hideChecked: false,
    quizActive: false,
    pinyinPracticeActive: false,
    landingActive: false
  };

  const elements = {};

  let firebaseConfig = window.STUDY_FIREBASE_CONFIG || window.HSK3_FIREBASE_CONFIG || {};
  let firebaseReady = hasFirebaseConfig(firebaseConfig);
  let firebaseApi = null;
  let auth = null;
  let db = null;
  let currentUser = null;
  let saveTimer = null;
  let loadingCloudState = false;
  let quizController = null;
  let synth = window.speechSynthesis;
  let studyVoice = null;

  function byId(id) {
    return document.getElementById(id);
  }

  function cacheElements() {
    Object.assign(elements, {
      pageTitle: byId('pageTitle'),
      pageSubtitle: byId('pageSubtitle'),
      setSelector: byId('setSelector'),
      restoreRemovedButton: byId('restoreRemoved'),
      pinyinPracticeButton: byId('pinyinPracticeButton'),
      printButton: byId('printButton'),
      clearChecksButton: byId('clearChecks'),
      quizModeButton: byId('quizModeButton'),
      signInGoogleButton: byId('signInGoogle'),
      signOutGoogleButton: byId('signOutGoogle'),
      accountText: byId('accountText'),
      syncStatus: byId('syncStatus'),
      progressText: byId('progressText'),
      navBar: byId('navBar'),
      backToTocButton: byId('backToToc'),
      navTitle: byId('navTitle'),
      landingPanel: byId('landingPanel'),
      landingGrid: byId('landingGrid'),
      toggleHeaderButton: byId('toggleHeader'),
      hideMeaningButton: byId('hideMeaning'),
      hidePinyinButton: byId('hidePinyin'),
      toggleCheckedButton: byId('toggleChecked'),
      removeCheckedButton: byId('removeChecked'),
      tocGrid: byId('tocGrid'),
      tocPanel: byId('tocPanel'),
      categoryRoot: byId('categoryRoot'),
      quizPanel: byId('quizPanel'),
      footerText: byId('footerText')
    });
  }

  function createElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined && text !== null) element.textContent = text;
    return element;
  }

  function setScopedKey(name) {
    return `${app.set?.id || 'vocab'}-${name}`;
  }

  function loadRemovedKeys() {
    try {
      return new Set(JSON.parse(localStorage.getItem(setScopedKey('removed-words')) || '[]'));
    } catch {
      return new Set();
    }
  }

  function saveRemovedKeys() {
    localStorage.setItem(setScopedKey('removed-words'), JSON.stringify([...app.removedKeys]));
  }

  function loadScript(src) {
    if (loadedScripts.has(src)) return Promise.resolve();

    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = () => {
        loadedScripts.add(src);
        resolve();
      };
      script.onerror = () => reject(new Error(`Could not load ${src}`));
      document.head.appendChild(script);
    });
  }

  function getSetIdFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get('set');

    return manifest.some((item) => item.id === fromUrl) ? fromUrl : '';
  }

  function populateSetSelector() {
    elements.setSelector.replaceChildren();

    manifest.forEach((item) => {
      const option = createElement('option', '', item.title);
      option.value = item.id;
      elements.setSelector.appendChild(option);
    });

    elements.setSelector.hidden = manifest.length <= 1;
  }

  function examLabel(item) {
    if (/^hsk/i.test(item.id)) return 'HSK';
    if (/^jlpt/i.test(item.id)) return 'JLPT';
    return '단어장';
  }

  function renderLanding() {
    elements.landingGrid.replaceChildren();

    manifest.forEach((item) => {
      const button = createElement('button', 'landing-card');
      button.type = 'button';
      button.appendChild(createElement('span', 'landing-kicker', examLabel(item)));
      button.appendChild(createElement('span', 'landing-title', item.title));
      button.appendChild(createElement('span', 'landing-meta', '학습 시작'));
      button.addEventListener('click', () => loadVocabularySet(item.id));
      elements.landingGrid.appendChild(button);
    });
  }

  function showLanding() {
    app.set = null;
    app.checks = [];
    app.quizActive = false;
    app.pinyinPracticeActive = false;
    app.landingActive = true;

    document.body.classList.add('is-landing');
    document.body.classList.remove('pinyin-practice-active');
    document.title = '어휘 학습';
    elements.pageTitle.textContent = '어휘 학습';
    elements.pageSubtitle.textContent = 'HSK/JLPT 중 학습할 단어장을 선택하세요.';
    elements.progressText.textContent = '';
    elements.navBar.hidden = true;
    elements.navTitle.textContent = '';
    elements.landingPanel.hidden = false;
    elements.quizPanel.hidden = true;
    elements.tocPanel.classList.add('hidden');
    elements.categoryRoot.replaceChildren();
    elements.tocGrid.replaceChildren();
    elements.footerText.textContent = '';
  }

  function updateSetUrl(setId) {
    const url = new URL(window.location.href);
    url.searchParams.set('set', setId);
    url.hash = '';
    history.pushState(null, document.title, url);
  }

  async function loadVocabularySet(setId, options = {}) {
    const entry = manifest.find((item) => item.id === setId);
    if (!entry) return;

    if (!window.VOCAB_SETS?.[setId]) {
      await loadScript(entry.dataFile);
    }

    const nextSet = window.VOCAB_SETS?.[setId];
    if (!nextSet) {
      throw new Error(`Vocabulary set not found: ${setId}`);
    }

    app.set = nextSet;
    app.removedKeys = loadRemovedKeys();
    app.hideChecked = localStorage.getItem(setScopedKey('hide-checked')) === '1';
    app.quizActive = false;
    app.pinyinPracticeActive = false;
    app.landingActive = false;
    document.body.classList.remove('pinyin-practice-active');

    localStorage.setItem('vocab-current-set', setId);
    elements.setSelector.value = setId;
    if (!options.keepUrl) updateSetUrl(setId);

    document.body.classList.remove('is-landing');
    elements.landingPanel.hidden = true;
    renderSet(nextSet);
    bindRenderedChecks();
    applyHeaderCollapsed(localStorage.getItem(setScopedKey('header-collapsed')) === '1');
    updateChrome();
    pickStudyVoice();

    if (quizController) quizController.reset();
    applyFilters();

    if (currentUser) {
      await loadCloudState();
    }
  }

  function updateChrome() {
    document.title = app.set.pageTitle || app.set.title;
    elements.pageTitle.textContent = app.set.pageTitle || app.set.title;
    elements.pageSubtitle.textContent = app.set.subtitle || `${app.set.wordCount || countWords()}개 단어`;
    elements.footerText.textContent = app.set.source
      ? `Generated from uploaded workbook: ${app.set.source}`
      : '';
  }

  function countWords() {
    return app.set.categories.reduce((total, category) => total + category.words.length, 0);
  }

  function renderSet(set) {
    elements.tocGrid.replaceChildren();
    elements.categoryRoot.replaceChildren();

    set.categories.forEach((category) => {
      elements.tocGrid.appendChild(renderTocCard(category));
      elements.categoryRoot.appendChild(renderCategory(category));
    });
  }

  function renderTocCard(category) {
    const link = createElement('a', 'toc-card');
    link.setAttribute('href', `#${encodeURIComponent(category.id)}`);

    link.appendChild(createElement('span', 'toc-title', category.title));
    link.appendChild(createElement('span', 'toc-count', `${category.words.length}개`));
    return link;
  }

  function renderCategory(category) {
    const section = createElement('section', 'category');
    section.id = category.id;
    section.dataset.cat = category.title;

    const header = createElement('div', 'cat-head');
    const textWrap = createElement('div');
    const title = createElement('h2', '', category.title);
    title.appendChild(createElement('span', 'count', `${category.words.length}개`));
    textWrap.appendChild(title);
    textWrap.appendChild(createElement('p', '', category.description));
    header.appendChild(textWrap);
    header.appendChild(createElement('span', 'priority', category.priority));
    section.appendChild(header);

    if (category.tip) {
      const tip = createElement('div', 'tip');
      const label = createElement('b', '', `${category.tip.label}:`);
      tip.appendChild(label);
      tip.append(` ${category.tip.text}`);
      section.appendChild(tip);
    }

    if (category.examples?.length) {
      const examples = createElement('div', 'examples');
      examples.appendChild(createElement('b', '', '짧은 예문'));
      const list = createElement('ul');
      category.examples.forEach((example) => {
        const item = createElement('li');
        item.appendChild(createElement('span', 'ex-cn', example.front));
        item.appendChild(document.createElement('br'));
        item.appendChild(createElement('span', 'ex-py', example.note));
        list.appendChild(item);
      });
      examples.appendChild(list);
      section.appendChild(examples);
    }

    const grid = createElement('div', 'card-grid');
    category.words.forEach((word) => {
      grid.appendChild(renderWordCard(word, category));
    });
    section.appendChild(grid);

    return section;
  }

  function renderWordCard(word) {
    const card = createElement('div', 'word-card');

    const label = createElement('label', 'card-check');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.className = 'word-check';
    input.dataset.key = word.key;
    label.appendChild(input);

    const practiceInput = document.createElement('input');
    practiceInput.type = 'text';
    practiceInput.className = 'pinyin-practice-input';
    practiceInput.placeholder = 'pinyin';
    practiceInput.autocomplete = 'off';
    practiceInput.autocapitalize = 'none';
    practiceInput.spellcheck = false;
    practiceInput.inputMode = 'latin';
    practiceInput.setAttribute('aria-label', `${word.front} 병음 입력`);

    card.appendChild(label);
    card.appendChild(createElement('span', 'num', word.number));
    card.appendChild(createElement('div', 'hanzi', word.front));
    card.appendChild(createElement('div', 'pinyin', word.reading));
    card.appendChild(practiceInput);
    card.appendChild(createElement('div', 'meaning', word.meaning));
    card.appendChild(createElement('span', 'pos', word.partOfSpeech));
    return card;
  }

  function bindRenderedChecks() {
    app.checks = [...document.querySelectorAll('.word-check')];
    app.checks.forEach((checkbox) => {
      checkbox.checked = localStorage.getItem(checkbox.dataset.key) === '1';
      checkbox.addEventListener('change', () => {
        setWordChecked(checkbox.dataset.key, checkbox.checked);
      });
    });
  }

  function setWordChecked(key, checked, options = {}) {
    const checkbox = app.checks.find((item) => item.dataset.key === key);
    if (checkbox) checkbox.checked = checked;

    if (checked) {
      localStorage.setItem(key, '1');
    } else {
      localStorage.removeItem(key);
    }

    applyFilters();
    if (options.save !== false) scheduleCloudSave();
  }

  function getCheckedKeys() {
    return app.checks.filter((checkbox) => checkbox.checked).map((checkbox) => checkbox.dataset.key);
  }

  function clearPinyinPracticeInputs() {
    document.querySelectorAll('.pinyin-practice-input').forEach((input) => {
      input.value = '';
    });
  }

  function setPinyinPracticeActive(active) {
    app.pinyinPracticeActive = Boolean(active);
    document.body.classList.toggle('pinyin-practice-active', app.pinyinPracticeActive);
    if (!app.pinyinPracticeActive) clearPinyinPracticeInputs();
    updateControls();
  }

  function getStudyState() {
    return {
      checkedKeys: getCheckedKeys(),
      removedKeys: [...app.removedKeys],
      hideChecked: app.hideChecked,
      version: 2
    };
  }

  function applyStudyState(state) {
    const checkedKeys = new Set(Array.isArray(state.checkedKeys) ? state.checkedKeys : []);
    const nextRemovedKeys = new Set(Array.isArray(state.removedKeys) ? state.removedKeys : []);

    app.checks.forEach((checkbox) => {
      const checked = checkedKeys.has(checkbox.dataset.key);
      checkbox.checked = checked;
      if (checked) {
        localStorage.setItem(checkbox.dataset.key, '1');
      } else {
        localStorage.removeItem(checkbox.dataset.key);
      }
    });

    app.removedKeys = nextRemovedKeys;
    app.hideChecked = Boolean(state.hideChecked);
    localStorage.setItem(setScopedKey('hide-checked'), app.hideChecked ? '1' : '0');
    saveRemovedKeys();
    applyFilters();
  }

  function updateProgress() {
    const activeChecks = app.checks.filter((checkbox) => !app.removedKeys.has(checkbox.dataset.key));
    const total = activeChecks.length;
    const done = activeChecks.filter((checkbox) => checkbox.checked).length;
    const removed = app.removedKeys.size;

    elements.progressText.textContent = `${done} / ${total}개 체크됨${removed ? ` · ${removed}개 지움` : ''}`;
  }

  function checkedForRemoval() {
    return app.checks.filter((checkbox) => checkbox.checked && !app.removedKeys.has(checkbox.dataset.key));
  }

  function updateControls() {
    elements.toggleCheckedButton.textContent = app.hideChecked ? '체크 보임' : '체크 숨김';
    elements.toggleCheckedButton.setAttribute('aria-pressed', app.hideChecked ? 'true' : 'false');
    elements.removeCheckedButton.disabled = checkedForRemoval().length === 0;
    elements.restoreRemovedButton.disabled = app.removedKeys.size === 0;
    elements.pinyinPracticeButton.textContent = app.pinyinPracticeActive ? '병음 연습 종료' : '병음 연습';
    elements.pinyinPracticeButton.setAttribute('aria-pressed', app.pinyinPracticeActive ? 'true' : 'false');
    elements.quizModeButton.textContent = app.quizActive ? '퀴즈 종료' : '퀴즈 모드';
  }

  function getCurrentCategoryId() {
    const id = decodeURIComponent(location.hash.replace(/^#/, ''));
    const target = id ? document.getElementById(id) : null;
    return target && target.classList.contains('category') ? id : '';
  }

  function setPanelHidden(panel, hidden) {
    panel.classList.toggle('hidden', hidden);
    if (panel === elements.quizPanel) panel.hidden = hidden;
  }

  function applyView() {
    const panels = [...document.querySelectorAll('main > .panel')];
    const categories = [...document.querySelectorAll('.category')];

    if (app.quizActive) {
      panels.forEach((panel) => setPanelHidden(panel, panel !== elements.quizPanel));
      categories.forEach((section) => section.classList.add('hidden'));
      elements.navBar.hidden = false;
      elements.navTitle.textContent = '퀴즈 모드';
      return;
    }

    setPanelHidden(elements.quizPanel, true);

    const id = getCurrentCategoryId();
    if (app.pinyinPracticeActive && !id) {
      panels.forEach((panel) => setPanelHidden(panel, true));
      categories.forEach((section) => section.classList.remove('hidden'));
      elements.navBar.hidden = false;
      elements.navTitle.textContent = '병음 연습';
      return;
    }

    if (id) {
      const target = document.getElementById(id);
      panels.forEach((panel) => setPanelHidden(panel, true));
      categories.forEach((section) => section.classList.toggle('hidden', section !== target));
      elements.navBar.hidden = false;
      const title = target.querySelector('.cat-head h2');
      elements.navTitle.textContent = title ? title.childNodes[0].textContent.trim() : '';
    } else {
      panels.forEach((panel) => setPanelHidden(panel, panel !== elements.tocPanel));
      categories.forEach((section) => section.classList.add('hidden'));
      elements.navBar.hidden = true;
      elements.navTitle.textContent = '';
    }
  }

  function applyFilters() {
    if (!app.set) return;

    document.querySelectorAll('.word-card').forEach((card) => {
      const checkbox = card.querySelector('.word-check');
      const hiddenByChecked = app.hideChecked && checkbox.checked;
      const hiddenByRemoved = app.removedKeys.has(checkbox.dataset.key);

      card.classList.toggle('hidden', Boolean(hiddenByChecked || hiddenByRemoved));
    });

    applyView();
    updateProgress();
    updateControls();
    if (quizController && app.quizActive) quizController.refresh();
  }

  function getQuizWords(scope) {
    if (!app.set) return [];

    const checkedByKey = new Map(app.checks.map((checkbox) => [checkbox.dataset.key, checkbox.checked]));
    const words = app.set.categories.flatMap((category) => category.words.map((word) => ({
      ...word,
      category: category.title,
      checked: Boolean(checkedByKey.get(word.key)),
      removed: app.removedKeys.has(word.key)
    })));

    if (scope === 'all') return words;
    if (scope === 'checked') return words.filter((word) => word.checked && !word.removed);
    if (scope === 'unchecked') return words.filter((word) => !word.checked && !word.removed);
    return words.filter((word) => !word.removed);
  }

  function enterQuizMode() {
    app.quizActive = true;
    setPinyinPracticeActive(false);
    if (location.hash) {
      history.replaceState(null, document.title, location.pathname + location.search);
    }
    quizController.nextQuestion();
    applyFilters();
  }

  function exitQuizMode() {
    app.quizActive = false;
    quizController.reset();
    applyFilters();
    window.scrollTo({ top: 0 });
  }

  function applyHeaderCollapsed(collapsed) {
    document.body.classList.toggle('header-collapsed', collapsed);
    elements.toggleHeaderButton.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    elements.toggleHeaderButton.textContent = collapsed ? '펼치기 ▼' : '접기 ▲';
  }

  function pickStudyVoice() {
    if (!synth || !app.set) return;

    const language = app.set.language || 'zh-CN';
    const voices = synth.getVoices();
    const normalized = language.replace('-', '[-_]?');
    const exact = new RegExp(`^${normalized}$`, 'i');
    const family = new RegExp(`^${language.split('-')[0]}`, 'i');

    studyVoice = voices.find((voice) => exact.test(voice.lang)) ||
      voices.find((voice) => family.test(voice.lang)) ||
      null;
  }

  function speakStudyText(text) {
    if (!synth || !text || !app.set) return;

    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = app.set.language || 'zh-CN';
    if (studyVoice) utterance.voice = studyVoice;
    utterance.rate = 0.9;
    synth.speak(utterance);
  }

  function hasFirebaseConfig(config) {
    return Boolean(
      config &&
      config.apiKey &&
      config.authDomain &&
      config.projectId &&
      config.appId &&
      !String(config.apiKey).includes('YOUR_') &&
      !String(config.authDomain).includes('YOUR_') &&
      !String(config.projectId).includes('YOUR_') &&
      !String(config.appId).includes('YOUR_')
    );
  }

  async function loadFirebaseConfig() {
    if (hasFirebaseConfig(firebaseConfig)) return firebaseConfig;

    try {
      const response = await fetch('/api/firebase-config', { cache: 'no-store' });
      if (!response.ok) return firebaseConfig;

      const remoteConfig = await response.json();
      if (hasFirebaseConfig(remoteConfig)) {
        firebaseConfig = remoteConfig;
        window.STUDY_FIREBASE_CONFIG = remoteConfig;
      }
    } catch (error) {
      console.warn('Firebase config could not be loaded.', error);
    }

    return firebaseConfig;
  }

  function setSyncStatus(text) {
    elements.syncStatus.textContent = text || '';
  }

  function authErrorText(error) {
    if (error?.code === 'auth/unauthorized-domain') return 'Firebase 도메인 추가 필요';
    if (error?.code === 'auth/popup-blocked') return '팝업 차단됨';
    if (error?.code === 'auth/popup-closed-by-user') return '로그인 취소됨';
    return '로그인 실패';
  }

  function userDocRef(setId = app.set?.id) {
    return firebaseApi.doc(db, 'users', currentUser.uid, 'studySets', setId);
  }

  async function saveCloudState() {
    if (!currentUser || !db || !app.set || loadingCloudState) return;

    try {
      setSyncStatus('저장 중...');
      await firebaseApi.setDoc(userDocRef(), {
        ...getStudyState(),
        updatedAt: firebaseApi.serverTimestamp()
      }, { merge: true });
      setSyncStatus('계정 저장됨');
    } catch (error) {
      console.error(error);
      setSyncStatus('저장 실패');
    }
  }

  function scheduleCloudSave() {
    if (loadingCloudState || !app.set) return;
    if (!currentUser) {
      setSyncStatus(firebaseReady ? '브라우저에만 저장 중' : 'Firebase 설정 필요');
      return;
    }

    window.clearTimeout(saveTimer);
    setSyncStatus('저장 대기...');
    saveTimer = window.setTimeout(saveCloudState, 600);
  }

  async function loadCloudState() {
    if (!currentUser || !db || !app.set) return;

    const setId = app.set.id;
    loadingCloudState = true;
    try {
      setSyncStatus('불러오는 중...');
      const snap = await firebaseApi.getDoc(userDocRef(setId));
      if (setId !== app.set?.id) return;

      if (snap.exists()) {
        applyStudyState(snap.data());
        setSyncStatus('계정 저장됨');
      } else {
        loadingCloudState = false;
        await saveCloudState();
      }
    } catch (error) {
      console.error(error);
      setSyncStatus('불러오기 실패');
    } finally {
      loadingCloudState = false;
    }
  }

  function updateAccountUI() {
    if (!firebaseReady) {
      elements.signInGoogleButton.disabled = true;
      elements.signOutGoogleButton.hidden = true;
      elements.accountText.textContent = 'Firebase 설정 필요';
      setSyncStatus('브라우저 저장');
      return;
    }

    elements.signInGoogleButton.disabled = false;
    elements.signInGoogleButton.hidden = Boolean(currentUser);
    elements.signOutGoogleButton.hidden = !currentUser;
    elements.accountText.textContent = currentUser ? currentUser.email : '브라우저 저장';
  }

  async function setupFirebase() {
    firebaseConfig = await loadFirebaseConfig();
    firebaseReady = hasFirebaseConfig(firebaseConfig);

    if (!firebaseReady) {
      updateAccountUI();
      return;
    }

    try {
      setSyncStatus('Firebase 연결 중...');
      const [appModule, authModule, firestoreModule] = await Promise.all([
        import('https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js'),
        import('https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js'),
        import('https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js')
      ]);

      firebaseApi = {
        initializeApp: appModule.initializeApp,
        getAuth: authModule.getAuth,
        GoogleAuthProvider: authModule.GoogleAuthProvider,
        onAuthStateChanged: authModule.onAuthStateChanged,
        signInWithPopup: authModule.signInWithPopup,
        signInWithRedirect: authModule.signInWithRedirect,
        getRedirectResult: authModule.getRedirectResult,
        signOut: authModule.signOut,
        getFirestore: firestoreModule.getFirestore,
        doc: firestoreModule.doc,
        getDoc: firestoreModule.getDoc,
        setDoc: firestoreModule.setDoc,
        serverTimestamp: firestoreModule.serverTimestamp
      };

      const firebaseApp = firebaseApi.initializeApp(firebaseConfig);
      auth = firebaseApi.getAuth(firebaseApp);
      db = firebaseApi.getFirestore(firebaseApp);

      firebaseApi.getRedirectResult(auth).catch((error) => {
        console.error(error);
        setSyncStatus(authErrorText(error));
      });

      firebaseApi.onAuthStateChanged(auth, async (user) => {
        currentUser = user;
        updateAccountUI();
        if (currentUser) {
          await loadCloudState();
        } else {
          setSyncStatus('브라우저에만 저장 중');
        }
      });
    } catch (error) {
      console.error(error);
      elements.signInGoogleButton.disabled = true;
      elements.signOutGoogleButton.hidden = true;
      elements.accountText.textContent = 'Firebase 연결 실패';
      setSyncStatus('브라우저 저장');
    }
  }

  function bindStaticEvents() {
    elements.setSelector.addEventListener('change', () => {
      loadVocabularySet(elements.setSelector.value);
    });

    elements.printButton.addEventListener('click', () => window.print());

    elements.backToTocButton.addEventListener('click', () => {
      if (app.quizActive) {
        exitQuizMode();
        return;
      }

      if (app.pinyinPracticeActive) {
        setPinyinPracticeActive(false);
        applyFilters();
        window.scrollTo({ top: 0 });
        return;
      }

      if (location.hash) {
        history.replaceState(null, document.title, location.pathname + location.search);
      }

      applyFilters();
      window.scrollTo({ top: 0 });
    });

    window.addEventListener('hashchange', () => {
      if (app.quizActive) app.quizActive = false;
      applyFilters();
      window.scrollTo({ top: 0 });
    });

    window.addEventListener('popstate', () => {
      const nextSetId = getSetIdFromUrl();
      if (!nextSetId) {
        showLanding();
      } else if (!app.set || nextSetId !== app.set.id) {
        loadVocabularySet(nextSetId, { keepUrl: true });
      } else {
        applyFilters();
      }
    });

    elements.toggleHeaderButton.addEventListener('click', () => {
      const collapsed = !document.body.classList.contains('header-collapsed');
      localStorage.setItem(setScopedKey('header-collapsed'), collapsed ? '1' : '0');
      applyHeaderCollapsed(collapsed);
    });

    elements.hideMeaningButton.addEventListener('click', () => {
      document.querySelectorAll('.meaning').forEach((element) => element.classList.toggle('hidden-meaning'));
    });

    elements.hidePinyinButton.addEventListener('click', () => {
      document.querySelectorAll('.pinyin').forEach((element) => element.classList.toggle('hidden-pinyin'));
    });

    document.addEventListener('click', (event) => {
      const card = event.target.closest('.word-card');
      if (!card || event.target.closest('.card-check') || event.target.closest('.pinyin-practice-input')) return;

      const front = event.target.closest('.hanzi');
      if (front) {
        speakStudyText(front.textContent.trim());
        return;
      }

      card.classList.toggle('revealed');
    });

    elements.toggleCheckedButton.addEventListener('click', () => {
      app.hideChecked = !app.hideChecked;
      localStorage.setItem(setScopedKey('hide-checked'), app.hideChecked ? '1' : '0');
      applyFilters();
      scheduleCloudSave();
    });

    elements.removeCheckedButton.addEventListener('click', () => {
      const selected = checkedForRemoval();
      if (!selected.length) return;

      if (confirm(`체크한 단어 ${selected.length}개를 목록에서 지울까요?`)) {
        selected.forEach((checkbox) => app.removedKeys.add(checkbox.dataset.key));
        saveRemovedKeys();
        applyFilters();
        scheduleCloudSave();
      }
    });

    elements.restoreRemovedButton.addEventListener('click', () => {
      if (!app.removedKeys.size) return;

      if (confirm(`지운 단어 ${app.removedKeys.size}개를 다시 보이게 할까요?`)) {
        app.removedKeys.clear();
        saveRemovedKeys();
        applyFilters();
        scheduleCloudSave();
      }
    });

    elements.clearChecksButton.addEventListener('click', () => {
      if (confirm('체크 기록을 모두 지울까요?')) {
        app.checks.forEach((checkbox) => {
          checkbox.checked = false;
          localStorage.removeItem(checkbox.dataset.key);
        });
        applyFilters();
        scheduleCloudSave();
      }
    });

    elements.pinyinPracticeButton.addEventListener('click', () => {
      if (app.quizActive) exitQuizMode();
      setPinyinPracticeActive(!app.pinyinPracticeActive);
      applyFilters();
    });

    elements.quizModeButton.addEventListener('click', () => {
      if (app.quizActive) {
        exitQuizMode();
      } else {
        enterQuizMode();
      }
    });

    elements.signInGoogleButton.addEventListener('click', async () => {
      if (!auth) return;

      const provider = new firebaseApi.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });

      try {
        setSyncStatus('로그인 중...');
        await firebaseApi.signInWithPopup(auth, provider);
      } catch (error) {
        console.error(error);
        if (error?.code === 'auth/popup-blocked' || error?.code === 'auth/cancelled-popup-request') {
          try {
            setSyncStatus('로그인 화면으로 이동...');
            await firebaseApi.signInWithRedirect(auth, provider);
            return;
          } catch (redirectError) {
            console.error(redirectError);
            setSyncStatus(authErrorText(redirectError));
            return;
          }
        }
        setSyncStatus(authErrorText(error));
      }
    });

    elements.signOutGoogleButton.addEventListener('click', async () => {
      if (!auth) return;

      try {
        await firebaseApi.signOut(auth);
      } catch (error) {
        console.error(error);
        setSyncStatus('로그아웃 실패');
      }
    });

    if (synth) {
      pickStudyVoice();
      synth.addEventListener?.('voiceschanged', pickStudyVoice);
    }
  }

  async function init() {
    cacheElements();
    populateSetSelector();
    renderLanding();
    bindStaticEvents();

    quizController = window.HSKQuiz.createQuizController({
      getWords: getQuizWords,
      getSet: () => app.set,
      onCheckWord: (word, checked) => setWordChecked(word.key, checked)
    });

    try {
      const initialSetId = getSetIdFromUrl();
      if (initialSetId) {
        await loadVocabularySet(initialSetId, { keepUrl: true });
      } else {
        showLanding();
      }
    } catch (error) {
      console.error(error);
      elements.navTitle.textContent = '단어 데이터를 불러오지 못했습니다.';
    }

    setupFirebase();
  }

  init();
})();
