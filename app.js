(function () {
  const manifest = window.VOCAB_SET_MANIFEST || [];
  const loadedScripts = new Set();
  const HEADER_TITLE = '나만의단어장';

  const CUSTOM_CATEGORY_ID = '__custom__';
  const NEW_CATEGORY_VALUE = '__new__';
  const CUSTOM_SETS_KEY = 'vocab-custom-sets';

  const app = {
    set: null,
    checks: [],
    removedKeys: new Set(),
    srs: {},
    customWords: [],
    customCategories: [],
    hideChecked: false,
    quizActive: false,
    reviewActive: false,
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
  let reviewController = null;
  let synth = window.speechSynthesis;
  let studyVoice = null;
  let customSets = [];
  let customSeq = 0;
  let wordEntryMode = 'single';
  let furiganaTokenizer = null;
  let furiganaTokenizerPromise = null;

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
      clearChecksButton: byId('clearChecks'),
      quizModeButton: byId('quizModeButton'),
      reviewButton: byId('reviewButton'),
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
      menuToggle: byId('menuToggle'),
      appMenu: byId('appMenu'),
      menuSubjectList: byId('menuSubjectList'),
      hideMeaningButton: byId('hideMeaning'),
      hidePinyinButton: byId('hidePinyin'),
      toggleCheckedButton: byId('toggleChecked'),
      removeCheckedButton: byId('removeChecked'),
      tocGrid: byId('tocGrid'),
      tocPanel: byId('tocPanel'),
      categoryRoot: byId('categoryRoot'),
      quizPanel: byId('quizPanel'),
      reviewPanel: byId('reviewPanel'),
      quizModeSelect: byId('quizMode'),
      addWordButton: byId('addWordButton'),
      addCategoryButton: byId('addCategoryButton'),
      addCategoryTocButton: byId('addCategoryTocButton'),
      addWordTocButton: byId('addWordTocButton'),
      createSetMenu: byId('createSetMenu'),
      wordFormModal: byId('wordFormModal'),
      wordForm: byId('wordForm'),
      wordCategory: byId('wordCategory'),
      wordNewCategoryWrap: byId('wordNewCategoryWrap'),
      wordNewCategory: byId('wordNewCategory'),
      wordSingleMode: byId('wordSingleMode'),
      wordImportMode: byId('wordImportMode'),
      wordSingleFields: byId('wordSingleFields'),
      wordFront: byId('wordFront'),
      wordReading: byId('wordReading'),
      wordMeaning: byId('wordMeaning'),
      wordPos: byId('wordPos'),
      wordFrontLabel: byId('wordFrontLabel'),
      wordReadingLabel: byId('wordReadingLabel'),
      wordMeaningLabel: byId('wordMeaningLabel'),
      wordReadingAuto: byId('wordReadingAuto'),
      wordFormClose: byId('wordFormClose'),
      wordFormHint: byId('wordFormHint'),
      wordSubmitButton: byId('wordSubmitButton'),
      wordImportBox: byId('wordImportBox'),
      wordTemplateDownload: byId('wordTemplateDownload'),
      wordImportFile: byId('wordImportFile'),
      wordImportHint: byId('wordImportHint'),
      setFormModal: byId('setFormModal'),
      setForm: byId('setForm'),
      setTitle: byId('setTitle'),
      setLanguage: byId('setLanguage'),
      setFormClose: byId('setFormClose'),
      setFormHint: byId('setFormHint'),
      categoryFormModal: byId('categoryFormModal'),
      categoryForm: byId('categoryForm'),
      categoryTitle: byId('categoryTitle'),
      categoryDescription: byId('categoryDescription'),
      categoryPriority: byId('categoryPriority'),
      categoryFormClose: byId('categoryFormClose'),
      categoryFormHint: byId('categoryFormHint')
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

  function supportsPinyinPractice(set = app.set) {
    return /^zh\b/i.test(set?.language || '');
  }

  function supportsFurigana(set = app.set) {
    return /^ja\b/i.test(set?.language || '');
  }

  function supportsEnglish(set = app.set) {
    return /^en\b/i.test(set?.language || '');
  }

  function hasKanji(text) {
    return /[\u3400-\u9fff\uf900-\ufaff々〆ヵヶ]/.test(text);
  }

  function kanaOnly(text) {
    return String(text || '').replace(/[^\u3040-\u30ffー]/g, '');
  }

  function tokenizeJapanese(text) {
    const tokens = [];
    let current = '';
    let currentType = '';

    [...String(text || '')].forEach((char) => {
      const type = hasKanji(char) ? 'kanji' : 'text';
      if (type !== currentType && current) {
        tokens.push({ type: currentType, text: current });
        current = '';
      }
      current += char;
      currentType = type;
    });

    if (current) tokens.push({ type: currentType, text: current });
    return tokens;
  }

  function nextKanaAnchor(tokens, startIndex) {
    for (let i = startIndex + 1; i < tokens.length; i += 1) {
      if (tokens[i].type !== 'text') continue;
      const anchor = kanaOnly(tokens[i].text);
      if (anchor) return anchor;
    }
    return '';
  }

  function appendRuby(parent, baseText, readingText) {
    const ruby = document.createElement('ruby');
    ruby.appendChild(document.createTextNode(baseText));
    if (readingText) {
      const rt = document.createElement('rt');
      rt.textContent = readingText;
      ruby.appendChild(rt);
    }
    parent.appendChild(ruby);
  }

  function renderFurigana(parent, word) {
    const front = String(word.front || '');
    const reading = String(word.reading || '');
    if (!supportsFurigana() || !front || !reading || !hasKanji(front)) {
      parent.textContent = front;
      return false;
    }

    const tokens = tokenizeJapanese(front);
    let readingIndex = 0;

    tokens.forEach((token, index) => {
      if (token.type === 'text') {
        parent.appendChild(document.createTextNode(token.text));
        const kana = kanaOnly(token.text);
        if (kana && reading.startsWith(kana, readingIndex)) {
          readingIndex += kana.length;
        }
        return;
      }

      const anchor = nextKanaAnchor(tokens, index);
      const anchorIndex = anchor ? reading.indexOf(anchor, readingIndex) : -1;
      const endIndex = anchorIndex >= readingIndex ? anchorIndex : reading.length;
      const rubyReading = reading.slice(readingIndex, endIndex);
      appendRuby(parent, token.text, rubyReading);
      readingIndex = endIndex;
    });

    return true;
  }

  // 후리가나 자동 생성: kuromoji.js 형태소 분석으로 한자의 읽기를 추출한다.
  // (데이터/알고리즘은 ChatGPT 주력 영역이지만 단어 입력 UX 흐름이라 여기서 처리 — CHATGPT.md 참고)
  // 스크립트·사전(dict)은 CDN에서 첫 사용 시점에만 지연 로딩 → 중국어 학습엔 영향 없음.
  const KUROMOJI_SCRIPT = 'https://cdn.jsdelivr.net/npm/kuromoji@0.1.2/build/kuromoji.js';
  const KUROMOJI_DICT = 'https://cdn.jsdelivr.net/npm/kuromoji@0.1.2/dict/';

  function loadExternalScript(src) {
    return new Promise((resolve, reject) => {
      if (loadedScripts.has(src)) {
        resolve();
        return;
      }
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.onload = () => {
        loadedScripts.add(src);
        resolve();
      };
      script.onerror = () => reject(new Error('스크립트를 불러오지 못했습니다.'));
      document.head.appendChild(script);
    });
  }

  function ensureFuriganaTokenizer() {
    if (furiganaTokenizer) return Promise.resolve(furiganaTokenizer);
    if (furiganaTokenizerPromise) return furiganaTokenizerPromise;

    furiganaTokenizerPromise = loadExternalScript(KUROMOJI_SCRIPT)
      .then(() => new Promise((resolve, reject) => {
        if (!window.kuromoji) {
          reject(new Error('형태소 분석기를 불러오지 못했습니다.'));
          return;
        }
        window.kuromoji.builder({ dicPath: KUROMOJI_DICT }).build((err, tokenizer) => {
          if (err) {
            reject(err);
            return;
          }
          furiganaTokenizer = tokenizer;
          resolve(tokenizer);
        });
      }))
      .catch((err) => {
        furiganaTokenizerPromise = null;
        throw err;
      });

    return furiganaTokenizerPromise;
  }

  function katakanaToHiragana(text) {
    return String(text || '').replace(/[ァ-ヶ]/g, (ch) =>
      String.fromCharCode(ch.charCodeAt(0) - 0x60));
  }

  function buildReadingFromTokens(tokens) {
    // 한자가 든 토큰만 읽기(가타카나→히라가나)로 치환하고, 가나/문장부호는 표면형 그대로 둔다.
    // → 기존 renderFurigana가 가나 구간을 그대로 매칭해 루비 위치를 잡는다.
    return tokens.map((token) => {
      const surface = token.surface_form || '';
      if (!hasKanji(surface)) return surface;
      const reading = token.reading && token.reading !== '*' ? token.reading : '';
      return reading ? katakanaToHiragana(reading) : surface;
    }).join('');
  }

  // 품사 라벨: kuromoji(IPAdic) 품사 대분류 → 한국어 표기.
  const POS_LABELS = {
    '名詞': '명사', '動詞': '동사', '形容詞': '형용사', '副詞': '부사',
    '連体詞': '연체사', '接続詞': '접속사', '感動詞': '감동사',
    '助詞': '조사', '助動詞': '조동사', '接頭詞': '접두사',
    '記号': '기호', 'フィラー': '간투사', 'その他': '기타'
  };

  function pickPartOfSpeech(tokens) {
    // 조사·조동사·기호는 빼고, 남은 내용어 중 마지막 토큰을 단어의 대표 품사로 본다.
    // (예: 勉強する → する[動詞]=동사, 食べ物 → 名詞=명사)
    const skip = new Set(['助詞', '助動詞', '記号', 'フィラー']);
    const content = tokens.filter((token) => token.pos && !skip.has(token.pos));
    const chosen = content.length ? content[content.length - 1] : tokens[0];
    if (!chosen || !chosen.pos) return '';
    // な형용사(형용동사)는 IPAdic에서 '名詞,形容動詞語幹'으로 나오므로 보정.
    if (chosen.pos === '名詞' && chosen.pos_detail_1 === '形容動詞語幹') return '형용동사';
    return POS_LABELS[chosen.pos] || chosen.pos;
  }

  function analyzeWord(text) {
    const trimmed = String(text || '').trim();
    if (!trimmed) return Promise.resolve({ reading: '', partOfSpeech: '' });
    return ensureFuriganaTokenizer().then((tokenizer) => {
      const tokens = tokenizer.tokenize(trimmed);
      return {
        reading: hasKanji(trimmed) ? buildReadingFromTokens(tokens) : '',
        partOfSpeech: pickPartOfSpeech(tokens)
      };
    });
  }

  function autoFillReading(options = {}) {
    if (!supportsFurigana()) return;
    if (wordEntryMode !== 'single') return;
    const front = elements.wordFront.value;
    if (!front.trim()) return;
    // blur 자동 채움은 한자가 있을 때만(가나 전용 단어까지 매번 사전을 받지 않도록).
    if (options.onlyWhenEmpty) {
      const needReading = hasKanji(front) && !elements.wordReading.value.trim();
      const needPos = !elements.wordPos.value.trim();
      if (!hasKanji(front) || (!needReading && !needPos)) return;
    }

    const hint = elements.wordFormHint;
    hint.classList.remove('is-error');
    hint.textContent = '자동 생성 중…';
    elements.wordReadingAuto.disabled = true;

    analyzeWord(front)
      .then(({ reading, partOfSpeech }) => {
        const filled = [];
        // 읽기: 버튼은 항상 갱신, blur(onlyWhenEmpty)는 비어 있을 때만.
        if (reading && (!options.onlyWhenEmpty || !elements.wordReading.value.trim())) {
          elements.wordReading.value = reading;
          filled.push('읽기');
        }
        // 품사: 손으로 입력한 값은 덮지 않도록 비어 있을 때만 채운다.
        if (partOfSpeech && !elements.wordPos.value.trim()) {
          elements.wordPos.value = partOfSpeech;
          filled.push('품사');
        }
        hint.textContent = filled.length
          ? `${filled.join('·')}를 자동으로 채웠어요. 필요하면 수정하세요.`
          : '';
      })
      .catch(() => {
        hint.textContent = '자동 생성에 실패했어요. 직접 입력해 주세요.';
        hint.classList.add('is-error');
      })
      .then(() => {
        elements.wordReadingAuto.disabled = false;
      });
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

  function loadSrsStore() {
    try {
      return JSON.parse(localStorage.getItem(setScopedKey('srs')) || '{}') || {};
    } catch {
      return {};
    }
  }

  function saveSrsStore() {
    localStorage.setItem(setScopedKey('srs'), JSON.stringify(app.srs));
  }

  function sanitizeCustomWords(list) {
    if (!Array.isArray(list)) return [];
    return list
      .filter((word) => word && (word.front || word.meaning))
      .map((word) => ({
        key: String(word.key || ''),
        front: String(word.front || '').trim(),
        reading: String(word.reading || '').trim(),
        meaning: String(word.meaning || '').trim(),
        partOfSpeech: word.partOfSpeech ? String(word.partOfSpeech).trim() : '',
        categoryId: String(word.categoryId || CUSTOM_CATEGORY_ID).trim() || CUSTOM_CATEGORY_ID
      }))
      .filter((word) => word.key && (word.front || word.meaning));
  }

  function sanitizeCustomCategories(list) {
    if (!Array.isArray(list)) return [];

    const seen = new Set();
    return list
      .filter((category) => category && category.id && category.title)
      .map((category) => ({
        id: String(category.id || '').trim(),
        title: String(category.title || '').trim(),
        priority: String(category.priority || '추가').trim(),
        description: String(category.description || '직접 추가한 목차입니다.').trim()
      }))
      .filter((category) => {
        if (!category.id || !category.title || seen.has(category.id)) return false;
        seen.add(category.id);
        return true;
      });
  }

  function loadCustomWords() {
    try {
      return sanitizeCustomWords(JSON.parse(localStorage.getItem(setScopedKey('custom-words')) || '[]'));
    } catch {
      return [];
    }
  }

  function saveCustomWords() {
    localStorage.setItem(setScopedKey('custom-words'), JSON.stringify(app.customWords));
  }

  function loadCustomCategories() {
    try {
      return sanitizeCustomCategories(JSON.parse(localStorage.getItem(setScopedKey('custom-categories')) || '[]'));
    } catch {
      return [];
    }
  }

  function saveCustomCategories() {
    localStorage.setItem(setScopedKey('custom-categories'), JSON.stringify(app.customCategories));
  }

  function makeCustomKey() {
    customSeq += 1;
    return `${app.set?.id || 'vocab'}-c-${Date.now().toString(36)}-${customSeq}`;
  }

  function makeCustomCategoryId() {
    customSeq += 1;
    return `${app.set?.id || 'vocab'}-cat-${Date.now().toString(36)}-${customSeq}`;
  }

  function customCategory(words) {
    return {
      id: CUSTOM_CATEGORY_ID,
      title: '내 단어',
      count: words.length,
      priority: '추가',
      description: '직접 추가한 단어입니다.',
      words
    };
  }

  function normalizedCategoryId(word) {
    return String(word.categoryId || CUSTOM_CATEGORY_ID).trim() || CUSTOM_CATEGORY_ID;
  }

  function numberCustomWords(words, offset = 0) {
    return words.map((word, index) => ({
      ...word,
      isCustom: true,
      number: offset + index + 1
    }));
  }

  function setCategories() {
    const base = app.set?.categories || [];
    const usedCustomKeys = new Set();
    const customWordsFor = (categoryId, offset = 0) => {
      const words = app.customWords.filter((word) => normalizedCategoryId(word) === categoryId);
      words.forEach((word) => usedCustomKeys.add(word.key));
      return numberCustomWords(words, offset);
    };

    const categories = base.map((category) => {
      const baseWords = Array.isArray(category.words) ? category.words : [];
      const customWords = customWordsFor(category.id, baseWords.length);
      return {
        ...category,
        count: baseWords.length + customWords.length,
        words: [...baseWords, ...customWords]
      };
    });

    app.customCategories.forEach((category) => {
      const words = customWordsFor(category.id);
      categories.push({
        ...category,
        count: words.length,
        priority: category.priority || '추가',
        description: category.description || '직접 추가한 목차입니다.',
        words,
        isCustomCategory: true
      });
    });

    const fallbackWords = numberCustomWords(app.customWords.filter((word) => !usedCustomKeys.has(word.key)));
    if (fallbackWords.length) categories.push(customCategory(fallbackWords));

    return categories;
  }

  function loadCustomSets() {
    try {
      const list = JSON.parse(localStorage.getItem(CUSTOM_SETS_KEY) || '[]');
      return Array.isArray(list) ? list.filter((item) => item && item.id && item.title) : [];
    } catch {
      return [];
    }
  }

  function saveCustomSets() {
    localStorage.setItem(CUSTOM_SETS_KEY, JSON.stringify(customSets));
  }

  function languageLabels(language) {
    if (/^zh\b/i.test(language)) return { front: '중국어', reading: '병음', meaning: '뜻' };
    if (/^ja\b/i.test(language)) return { front: '단어', reading: '읽기', meaning: '뜻' };
    if (/^en\b/i.test(language)) return { front: '영어', reading: '읽기', meaning: '뜻' };
    return { front: '단어', reading: '읽기', meaning: '뜻' };
  }

  function buildCustomSetObject(meta) {
    return {
      id: meta.id,
      title: meta.title,
      pageTitle: meta.title,
      subtitle: meta.subtitle || '직접 만든 단어장',
      language: meta.language || 'other',
      labels: meta.labels || languageLabels(meta.language),
      categories: [],
      isCustomSet: true
    };
  }

  function registerCustomSets() {
    window.VOCAB_SETS = window.VOCAB_SETS || {};
    customSets.forEach((meta) => {
      const existing = manifest.find((item) => item.id === meta.id);
      if (existing) {
        existing.title = meta.title;
        existing.isCustom = true;
        existing.language = meta.language || 'other';
      } else {
        manifest.push({ id: meta.id, title: meta.title, isCustom: true, language: meta.language || 'other' });
      }
      window.VOCAB_SETS[meta.id] = buildCustomSetObject(meta);
    });
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

  function renderSubjectMenu() {
    elements.menuSubjectList.replaceChildren();

    manifest.forEach((item) => {
      const button = createElement('button', 'menu-item menu-subitem', item.title);
      button.type = 'button';
      button.dataset.setId = item.id;
      button.addEventListener('click', () => {
        closeMenu();
        loadVocabularySet(item.id);
      });

      if (!item.isCustom) {
        elements.menuSubjectList.appendChild(button);
        return;
      }

      const wrap = createElement('div', 'menu-subitem-wrap');
      wrap.appendChild(button);
      const del = createElement('button', 'subitem-delete', '×');
      del.type = 'button';
      del.setAttribute('aria-label', `${item.title} 단어장 삭제`);
      del.addEventListener('click', (event) => {
        event.stopPropagation();
        if (confirm(`'${item.title}' 단어장을 삭제할까요? 추가한 단어도 함께 삭제됩니다.`)) {
          deleteCustomSet(item.id);
        }
      });
      wrap.appendChild(del);
      elements.menuSubjectList.appendChild(wrap);
    });
  }

  function updateSubjectMenuActive(setId) {
    elements.menuSubjectList.querySelectorAll('.menu-subitem').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.setId === setId);
    });
  }

  function openMenu() {
    elements.appMenu.hidden = false;
    elements.menuToggle.setAttribute('aria-expanded', 'true');
  }

  function closeMenu() {
    elements.appMenu.hidden = true;
    elements.menuToggle.setAttribute('aria-expanded', 'false');
  }

  function toggleMenu() {
    if (elements.appMenu.hidden) openMenu();
    else closeMenu();
  }

  function examLabel(item) {
    if (/^hsk/i.test(item.id)) return 'HSK';
    if (/^jlpt/i.test(item.id)) return 'JLPT';
    return '단어장';
  }

  function landingLanguage(item) {
    const language = String(item.language || window.VOCAB_SETS?.[item.id]?.language || '').toLocaleLowerCase();
    if (/^zh\b/.test(language)) return 'zh';
    if (/^ja\b/.test(language)) return 'ja';
    if (/^en\b/.test(language)) return 'en';
    if (/^hsk/i.test(item.id)) return 'zh';
    if (/^jlpt/i.test(item.id)) return 'ja';
    return 'other';
  }

  function landingKicker(item, language) {
    const exam = examLabel(item);
    if (exam !== '단어장') return exam;
    if (language === 'zh') return '중국어';
    if (language === 'ja') return '일본어';
    if (language === 'en') return '영어';
    return '단어장';
  }

  function renderLanding() {
    elements.landingGrid.replaceChildren();

    manifest.forEach((item) => {
      const language = landingLanguage(item);
      const label = landingKicker(item, language);
      const button = createElement('button', 'landing-card');
      button.type = 'button';
      button.dataset.exam = label;
      button.dataset.language = language;
      button.appendChild(createElement('span', 'landing-badge'));
      const head = createElement('span', 'landing-head');
      head.appendChild(createElement('span', 'landing-kicker', label));
      head.appendChild(createElement('span', 'landing-title', item.title));
      button.appendChild(head);
      const meta = createElement('span', 'landing-meta');
      meta.appendChild(createElement('span', 'landing-meta-text', '학습 시작'));
      meta.appendChild(createElement('span', 'landing-arrow', '→'));
      button.appendChild(meta);
      button.addEventListener('click', () => loadVocabularySet(item.id));
      elements.landingGrid.appendChild(button);
    });

    const addCard = createElement('button', 'landing-card is-add');
    addCard.type = 'button';
    addCard.appendChild(createElement('span', 'landing-badge'));
    const addHead = createElement('span', 'landing-head');
    addHead.appendChild(createElement('span', 'landing-kicker', '직접 만들기'));
    addHead.appendChild(createElement('span', 'landing-title', '새 단어장'));
    addCard.appendChild(addHead);
    addCard.addEventListener('click', openSetForm);
    elements.landingGrid.appendChild(addCard);
  }

  function showLanding() {
    app.set = null;
    app.checks = [];
    app.srs = {};
    app.customWords = [];
    app.customCategories = [];
    app.quizActive = false;
    app.reviewActive = false;
    app.pinyinPracticeActive = false;
    app.landingActive = true;

    document.body.classList.add('is-landing');
    document.body.classList.remove('pinyin-practice-active');
    updateViewClasses();
    document.title = '어휘 학습';
    elements.pageTitle.textContent = '어휘 학습';
    elements.pageSubtitle.textContent = '학습할 단어장을 선택하세요.';
    elements.progressText.textContent = '';
    elements.navBar.hidden = true;
    elements.navTitle.textContent = '';
    elements.landingPanel.hidden = false;
    elements.quizPanel.hidden = true;
    elements.tocPanel.classList.add('hidden');
    elements.categoryRoot.replaceChildren();
    elements.tocGrid.replaceChildren();
    elements.addWordButton.hidden = true;
    elements.addCategoryButton.hidden = true;
    elements.addCategoryTocButton.hidden = true;
    elements.addWordTocButton.hidden = true;
    updateSubjectMenuActive('');
  }

  function updateLandingUrl() {
    const url = new URL(window.location.href);
    const shouldUpdate = url.searchParams.has('set') || Boolean(url.hash);

    url.searchParams.delete('set');
    url.hash = '';

    if (shouldUpdate) {
      history.pushState(null, document.title, url);
    }
  }

  function goToLanding() {
    closeMenu();
    if (!app.landingActive) showLanding();
    updateLandingUrl();
    window.scrollTo({ top: 0 });
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

    if (!window.VOCAB_SETS?.[setId] && entry.dataFile) {
      await loadScript(entry.dataFile);
    }

    const nextSet = window.VOCAB_SETS?.[setId];
    if (!nextSet) {
      throw new Error(`Vocabulary set not found: ${setId}`);
    }

    app.set = nextSet;
    app.customWords = loadCustomWords();
    app.customCategories = loadCustomCategories();
    app.removedKeys = loadRemovedKeys();
    app.srs = loadSrsStore();
    app.hideChecked = localStorage.getItem(setScopedKey('hide-checked')) === '1';
    app.quizActive = false;
    app.reviewActive = false;
    app.pinyinPracticeActive = false;
    app.landingActive = false;
    document.body.classList.remove('pinyin-practice-active');

    localStorage.setItem('vocab-current-set', setId);
    elements.setSelector.value = setId;
    updateSubjectMenuActive(setId);
    if (!options.keepUrl) updateSetUrl(setId);

    document.body.classList.remove('is-landing');
    elements.landingPanel.hidden = true;
    renderCurrentSet();
    updateChrome();
    pickStudyVoice();

    if (quizController) quizController.reset();
    applyFilters();

    if (currentUser) {
      await loadCloudState();
    }
  }

  function updateChrome() {
    document.title = HEADER_TITLE;
    elements.pageTitle.textContent = HEADER_TITLE;
    elements.pageSubtitle.textContent = app.set.subtitle || `${app.set.wordCount || countWords()}개 단어`;
  }

  function countWords() {
    return setCategories().reduce((total, category) => total + category.words.length, 0);
  }

  function renderSet() {
    elements.tocGrid.replaceChildren();
    elements.categoryRoot.replaceChildren();

    setCategories().forEach((category) => {
      elements.tocGrid.appendChild(renderTocCard(category));
      elements.categoryRoot.appendChild(renderCategory(category));
    });
  }

  function renderCurrentSet() {
    renderSet();
    bindRenderedChecks();
  }

  function remainingWordCount(category) {
    return category.words.reduce((total, word) => total + (app.removedKeys.has(word.key) ? 0 : 1), 0);
  }

  function renderTocCard(category) {
    const remaining = remainingWordCount(category);
    const link = createElement('a', 'toc-card');
    link.dataset.catId = category.id;
    link.setAttribute('href', `#${encodeURIComponent(category.id)}`);
    // 단어를 모두 지운 목차는 숨기고, 개수는 남은 단어 기준으로 표시.
    link.classList.toggle('hidden', remaining === 0);

    link.appendChild(createElement('span', 'toc-title', category.title));
    link.appendChild(createElement('span', 'toc-count', `${remaining}개`));
    return link;
  }

  // 지우기/복원은 applyFilters만 호출하므로(재렌더 X), 목차 개수·표시를 여기서 갱신한다.
  function updateTocCounts() {
    const byId = new Map(setCategories().map((category) => [category.id, category]));
    elements.tocGrid.querySelectorAll('.toc-card').forEach((card) => {
      const category = byId.get(card.dataset.catId);
      if (!category) return;
      const remaining = remainingWordCount(category);
      const count = card.querySelector('.toc-count');
      if (count) count.textContent = `${remaining}개`;
      card.classList.toggle('hidden', remaining === 0);
    });
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
    const headerActions = createElement('div', 'cat-actions');
    headerActions.appendChild(createElement('span', 'priority', category.priority || '추가'));
    if (category.isCustomCategory) {
      const del = createElement('button', 'category-del', '×');
      del.type = 'button';
      del.dataset.categoryId = category.id;
      del.setAttribute('aria-label', `${category.title} 목차 삭제`);
      headerActions.appendChild(del);
    }
    header.appendChild(headerActions);
    section.appendChild(header);

    if (category.tip) {
      const tip = createElement('div', 'tip');
      const label = createElement('b', '', `${category.tip.label}:`);
      tip.appendChild(label);
      tip.append(` ${category.tip.text}`);
      section.appendChild(tip);
    }

    const grid = createElement('div', 'card-grid');
    category.words.forEach((word) => {
      grid.appendChild(renderWordCard(word, category));
    });
    section.appendChild(grid);

    return section;
  }

  function fitFront(el) {
    el.style.fontSize = '';
    const card = el.closest('.word-card');
    if (!card) return;

    const cs = getComputedStyle(card);
    const avail = card.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const natural = el.scrollWidth;
    if (avail > 0 && natural > avail) {
      const px = parseFloat(getComputedStyle(el).fontSize);
      el.style.fontSize = `${Math.max(12, Math.floor(px * avail / natural))}px`;
    }
  }

  function fitVisibleFronts() {
    document.querySelectorAll('.category:not(.hidden) .hanzi').forEach(fitFront);
  }

  function renderWordCard(word, category) {
    const card = createElement('div', 'word-card');

    if (word.isCustom) {
      card.classList.add('is-custom');
      const del = createElement('button', 'word-del', '×');
      del.type = 'button';
      del.dataset.key = word.key;
      del.setAttribute('aria-label', `${word.front || word.meaning} 삭제`);
      card.appendChild(del);
    }

    const label = createElement('label', 'card-check');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.className = 'word-check';
    input.dataset.key = word.key;
    label.appendChild(input);

    card.appendChild(label);
    card.appendChild(createElement('span', 'num', word.number));
    const front = createElement('div', 'hanzi');
    front.dataset.speech = word.front;
    const hasFurigana = renderFurigana(front, word);
    if (hasFurigana) {
      card.classList.add('has-furigana');
      front.classList.add('furigana-term');
    }
    card.appendChild(front);
    if (!supportsFurigana()) {
      card.appendChild(createElement('div', 'pinyin', word.reading));
    }
    if (supportsPinyinPractice()) {
      const practiceInput = document.createElement('input');
      practiceInput.type = 'text';
      practiceInput.className = 'pinyin-practice-input';
      practiceInput.placeholder = word.reading || 'pinyin';
      practiceInput.autocomplete = 'off';
      practiceInput.autocapitalize = 'none';
      practiceInput.spellcheck = false;
      practiceInput.inputMode = 'latin';
      practiceInput.setAttribute('aria-label', `${word.front} 병음 입력`);
      card.appendChild(practiceInput);
    }
    const meaningRow = createElement('div', 'meaning-row');
    if (word.partOfSpeech) meaningRow.appendChild(createElement('span', 'pos', word.partOfSpeech));
    meaningRow.appendChild(createElement('span', 'meaning', word.meaning));
    card.appendChild(meaningRow);
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
    app.pinyinPracticeActive = Boolean(active) && supportsPinyinPractice();
    document.body.classList.toggle('pinyin-practice-active', app.pinyinPracticeActive);
    if (!app.pinyinPracticeActive) clearPinyinPracticeInputs();
    updateControls();
  }

  function getStudyState() {
    return {
      checkedKeys: getCheckedKeys(),
      removedKeys: [...app.removedKeys],
      hideChecked: app.hideChecked,
      srs: app.srs,
      customWords: app.customWords,
      customCategories: app.customCategories,
      version: 5
    };
  }

  function applyStudyState(state) {
    let shouldRender = false;

    if (Array.isArray(state.customCategories)) {
      app.customCategories = sanitizeCustomCategories(state.customCategories);
      saveCustomCategories();
      shouldRender = true;
    }

    if (Array.isArray(state.customWords)) {
      app.customWords = sanitizeCustomWords(state.customWords);
      saveCustomWords();
      shouldRender = true;
    }

    if (shouldRender) {
      renderCurrentSet();
    }

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

    if (state.srs && typeof state.srs === 'object') {
      app.srs = state.srs;
      saveSrsStore();
    }

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
    const pinyinPracticeSupported = supportsPinyinPractice();
    const pinyinQuizOption = elements.quizModeSelect?.querySelector('option[value="front-pinyin-input"]');

    if (pinyinQuizOption) {
      pinyinQuizOption.hidden = !pinyinPracticeSupported;
      pinyinQuizOption.disabled = !pinyinPracticeSupported;
      if (!pinyinPracticeSupported && elements.quizModeSelect.value === 'front-pinyin-input') {
        elements.quizModeSelect.value = 'front-meaning';
      }
    }

    if (!pinyinPracticeSupported && app.pinyinPracticeActive) {
      app.pinyinPracticeActive = false;
      document.body.classList.remove('pinyin-practice-active');
      clearPinyinPracticeInputs();
    }

    elements.toggleCheckedButton.textContent = app.hideChecked ? '체크 보임' : '체크 숨김';
    elements.toggleCheckedButton.setAttribute('aria-pressed', app.hideChecked ? 'true' : 'false');
    elements.removeCheckedButton.disabled = checkedForRemoval().length === 0;
    elements.restoreRemovedButton.disabled = app.removedKeys.size === 0;
    elements.pinyinPracticeButton.hidden = !pinyinPracticeSupported;
    elements.pinyinPracticeButton.textContent = app.pinyinPracticeActive ? '쓰기 연습 종료' : '쓰기 연습 모드';
    elements.pinyinPracticeButton.setAttribute('aria-pressed', app.pinyinPracticeActive ? 'true' : 'false');
    elements.quizModeButton.textContent = app.quizActive ? '퀴즈 종료' : '퀴즈 모드';
    const editHidden = !app.set || app.quizActive || app.reviewActive;
    elements.addWordButton.hidden = editHidden;
    elements.addCategoryButton.hidden = editHidden;
    elements.addCategoryTocButton.hidden = editHidden;
    elements.addWordTocButton.hidden = editHidden;
    updateReviewButton();
  }

  function getCurrentCategoryId() {
    const id = decodeURIComponent(location.hash.replace(/^#/, ''));
    const target = id ? document.getElementById(id) : null;
    return target && target.classList.contains('category') ? id : '';
  }

  function setPanelHidden(panel, hidden) {
    panel.classList.toggle('hidden', hidden);
    if (panel === elements.quizPanel || panel === elements.reviewPanel) panel.hidden = hidden;
  }

  function updateViewClasses({ list = false, quiz = false, review = false } = {}) {
    document.body.classList.toggle('has-list-view', Boolean(list));
    document.body.classList.toggle('is-quiz-mode', Boolean(quiz));
    document.body.classList.toggle('is-review-mode', Boolean(review));
  }

  function applyView() {
    const panels = [...document.querySelectorAll('main > .panel')];
    const categories = [...document.querySelectorAll('.category')];

    if (app.reviewActive) {
      updateViewClasses({ review: true });
      panels.forEach((panel) => setPanelHidden(panel, panel !== elements.reviewPanel));
      categories.forEach((section) => section.classList.add('hidden'));
      elements.navBar.hidden = false;
      elements.navTitle.textContent = '복습 모드';
      return;
    }

    setPanelHidden(elements.reviewPanel, true);

    if (app.quizActive) {
      updateViewClasses({ quiz: true });
      panels.forEach((panel) => setPanelHidden(panel, panel !== elements.quizPanel));
      categories.forEach((section) => section.classList.add('hidden'));
      elements.navBar.hidden = false;
      elements.navTitle.textContent = '퀴즈 모드';
      return;
    }

    setPanelHidden(elements.quizPanel, true);

    const id = getCurrentCategoryId();
    if (app.pinyinPracticeActive && !id) {
      updateViewClasses({ list: true });
      panels.forEach((panel) => setPanelHidden(panel, true));
      categories.forEach((section) => section.classList.remove('hidden'));
      elements.navBar.hidden = false;
      elements.navTitle.textContent = '쓰기 연습 모드';
      return;
    }

    if (id) {
      updateViewClasses({ list: true });
      const target = document.getElementById(id);
      panels.forEach((panel) => setPanelHidden(panel, true));
      categories.forEach((section) => section.classList.toggle('hidden', section !== target));
      elements.navBar.hidden = false;
      const title = target.querySelector('.cat-head h2');
      elements.navTitle.textContent = title ? title.childNodes[0].textContent.trim() : '';
    } else {
      updateViewClasses();
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

    updateTocCounts();
    applyView();
    fitVisibleFronts();
    updateProgress();
    updateControls();
    if (quizController && app.quizActive) quizController.refresh();
  }

  function getQuizWords(scope) {
    if (!app.set) return [];

    const checkedByKey = new Map(app.checks.map((checkbox) => [checkbox.dataset.key, checkbox.checked]));
    const words = setCategories().flatMap((category) => category.words.map((word) => ({
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
    app.reviewActive = false;
    if (reviewController) reviewController.reset();
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

  function shuffle(items) {
    const result = items.slice();
    for (let i = result.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  function getDueWords() {
    if (!app.set) return { due: [], fresh: [] };

    const at = Date.now();
    const due = [];
    const fresh = [];

    setCategories().forEach((category) => {
      category.words.forEach((word) => {
        if (app.removedKeys.has(word.key)) return;

        const card = app.srs[word.key] || null;
        const entry = { ...word, category: category.title, srs: card };
        if (!card) {
          fresh.push(entry);
        } else if (window.HSKReview.isDue(card, at)) {
          due.push(entry);
        }
      });
    });

    return { due, fresh };
  }

  function buildReviewQueue() {
    const { due, fresh } = getDueWords();
    const newCards = fresh.slice(0, window.HSKReview.NEW_PER_SESSION);
    return [...shuffle(due), ...newCards];
  }

  function reviewDueCount() {
    const { due, fresh } = getDueWords();
    return due.length + Math.min(fresh.length, window.HSKReview.NEW_PER_SESSION);
  }

  function gradeReviewWord(word, card) {
    app.srs[word.key] = card;
    saveSrsStore();
    scheduleCloudSave();
  }

  function updateReviewButton() {
    if (!elements.reviewButton) return;

    if (app.reviewActive) {
      elements.reviewButton.textContent = '복습 종료';
      elements.reviewButton.setAttribute('aria-pressed', 'true');
      return;
    }

    elements.reviewButton.setAttribute('aria-pressed', 'false');
    const count = app.set ? reviewDueCount() : 0;
    elements.reviewButton.textContent = count > 0 ? `복습 ${count}` : '복습';
  }

  function enterReviewMode() {
    if (!app.set) return;

    app.reviewActive = true;
    app.quizActive = false;
    if (quizController) quizController.reset();
    setPinyinPracticeActive(false);
    if (location.hash) {
      history.replaceState(null, document.title, location.pathname + location.search);
    }
    reviewController.start();
    applyFilters();
    window.scrollTo({ top: 0 });
  }

  function exitReviewMode() {
    app.reviewActive = false;
    if (reviewController) reviewController.reset();
    applyFilters();
    window.scrollTo({ top: 0 });
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
          await loadCustomSetsCloud();
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

  function refreshSetNav() {
    populateSetSelector();
    renderSubjectMenu();
    renderLanding();
    if (app.set) {
      elements.setSelector.value = app.set.id;
      updateSubjectMenuActive(app.set.id);
    }
  }

  function categoryOptionList() {
    if (!app.set) return [];

    const options = [];
    const seen = new Set();
    const addOption = (id, title) => {
      if (!id || !title || seen.has(id)) return;
      seen.add(id);
      options.push({ id, title });
    };

    (app.set.categories || []).forEach((category) => addOption(category.id, category.title));
    app.customCategories.forEach((category) => addOption(category.id, category.title));

    if (!app.set.isCustomSet) {
      addOption(CUSTOM_CATEGORY_ID, '내 단어');
    } else if (app.customWords.some((word) => normalizedCategoryId(word) === CUSTOM_CATEGORY_ID)) {
      addOption(CUSTOM_CATEGORY_ID, '내 단어');
    }

    return options;
  }

  function findCategoryByTitle(title) {
    const normalized = String(title || '').trim().toLocaleLowerCase();
    if (!normalized) return null;

    return categoryOptionList().find((category) => category.title.toLocaleLowerCase() === normalized) || null;
  }

  function createCustomCategory(data, options = {}) {
    const title = (data.title || '').trim();
    if (!title) return null;

    const existing = findCategoryByTitle(title);
    if (existing && !options.forceNew) return existing;

    const category = {
      id: makeCustomCategoryId(),
      title,
      priority: (data.priority || '추가').trim(),
      description: (data.description || '직접 추가한 목차입니다.').trim()
    };

    app.customCategories.push(category);
    saveCustomCategories();

    if (!options.deferRender) {
      renderCurrentSet();
      applyFilters();
      scheduleCloudSave();
    }

    return category;
  }

  function deleteCustomCategory(id) {
    const index = app.customCategories.findIndex((category) => category.id === id);
    if (index === -1) return;

    const category = app.customCategories[index];
    if (!confirm(`'${category.title}' 목차를 삭제할까요? 안에 있는 단어도 함께 삭제됩니다.`)) return;

    const removedWordKeys = app.customWords
      .filter((word) => normalizedCategoryId(word) === id)
      .map((word) => word.key);

    app.customCategories.splice(index, 1);
    app.customWords = app.customWords.filter((word) => normalizedCategoryId(word) !== id);
    removedWordKeys.forEach((key) => {
      localStorage.removeItem(key);
      delete app.srs[key];
      app.removedKeys.delete(key);
    });

    saveCustomCategories();
    saveCustomWords();
    saveRemovedKeys();
    saveSrsStore();
    renderCurrentSet();
    if (location.hash === `#${encodeURIComponent(id)}`) {
      history.replaceState(null, document.title, location.pathname + location.search);
    }
    applyFilters();
    scheduleCloudSave();
  }

  function addCustomWord(data) {
    const front = (data.front || '').trim();
    const meaning = (data.meaning || '').trim();
    if (!front && !meaning) return false;

    app.customWords.push({
      key: makeCustomKey(),
      front,
      reading: (data.reading || '').trim(),
      meaning,
      partOfSpeech: (data.partOfSpeech || '').trim(),
      categoryId: data.categoryId || CUSTOM_CATEGORY_ID
    });
    saveCustomWords();
    renderCurrentSet();
    applyFilters();
    scheduleCloudSave();
    return true;
  }

  function addCustomWordsBulk(list) {
    const words = list
      .map((data) => ({
        key: makeCustomKey(),
        front: (data.front || '').trim(),
        reading: (data.reading || '').trim(),
        meaning: (data.meaning || '').trim(),
        partOfSpeech: (data.partOfSpeech || '').trim(),
        categoryId: data.categoryId || CUSTOM_CATEGORY_ID
      }))
      .filter((word) => word.front || word.meaning);

    if (!words.length) return 0;

    app.customWords.push(...words);
    saveCustomCategories();
    saveCustomWords();
    renderCurrentSet();
    applyFilters();
    scheduleCloudSave();
    return words.length;
  }

  function deleteCustomWord(key) {
    const index = app.customWords.findIndex((word) => word.key === key);
    if (index === -1) return;

    app.customWords.splice(index, 1);
    saveCustomWords();
    localStorage.removeItem(key);
    if (app.srs[key]) {
      delete app.srs[key];
      saveSrsStore();
    }
    if (app.removedKeys.delete(key)) saveRemovedKeys();

    renderCurrentSet();
    applyFilters();
    scheduleCloudSave();
  }

  function slugifySetId(title) {
    const base = String(title).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return `custom-${base || 'set'}-${Date.now().toString(36)}`;
  }

  function createCustomSet(data) {
    const title = (data.title || '').trim();
    if (!title) return null;

    const language = data.language || 'other';
    const meta = {
      id: slugifySetId(title),
      title,
      language,
      labels: languageLabels(language),
      custom: true
    };

    customSets.push(meta);
    saveCustomSets();
    registerCustomSets();
    refreshSetNav();
    saveCustomSetsCloud();
    return meta;
  }

  function deleteCustomSet(id) {
    const index = customSets.findIndex((meta) => meta.id === id);
    if (index === -1) return;

    customSets.splice(index, 1);
    saveCustomSets();

    const manifestIndex = manifest.findIndex((item) => item.id === id);
    if (manifestIndex !== -1) manifest.splice(manifestIndex, 1);
    if (window.VOCAB_SETS) delete window.VOCAB_SETS[id];

    ['custom-words', 'custom-categories', 'removed-words', 'srs', 'hide-checked'].forEach((name) => {
      localStorage.removeItem(`${id}-${name}`);
    });

    const leavingActive = app.set?.id === id;
    if (leavingActive) goToLanding();
    refreshSetNav();
    saveCustomSetsCloud();
  }

  function customSetsDocRef() {
    return firebaseApi.doc(db, 'users', currentUser.uid, 'meta', 'customSets');
  }

  async function saveCustomSetsCloud() {
    if (!currentUser || !db) return;

    try {
      await firebaseApi.setDoc(customSetsDocRef(), {
        sets: customSets,
        updatedAt: firebaseApi.serverTimestamp()
      }, { merge: true });
    } catch (error) {
      console.error(error);
    }
  }

  async function loadCustomSetsCloud() {
    if (!currentUser || !db) return;

    try {
      const snap = await firebaseApi.getDoc(customSetsDocRef());
      if (!snap.exists()) {
        await saveCustomSetsCloud();
        return;
      }

      const remote = snap.data().sets;
      if (!Array.isArray(remote)) return;

      const byId = new Map(customSets.map((meta) => [meta.id, meta]));
      remote.forEach((meta) => {
        if (meta && meta.id && meta.title) byId.set(meta.id, meta);
      });
      customSets = [...byId.values()];
      saveCustomSets();
      registerCustomSets();
      refreshSetNav();
    } catch (error) {
      console.error(error);
    }
  }

  function updateWordNewCategoryVisibility() {
    const wantsNewCategory = elements.wordCategory.value === NEW_CATEGORY_VALUE;
    elements.wordNewCategoryWrap.hidden = !wantsNewCategory;
    elements.wordNewCategory.required = wantsNewCategory;
    if (wantsNewCategory) elements.wordNewCategory.focus();
  }

  function populateWordCategoryOptions(preferredId = '') {
    const options = categoryOptionList();
    elements.wordCategory.replaceChildren();

    options.forEach((category) => {
      const option = createElement('option', '', category.title);
      option.value = category.id;
      elements.wordCategory.appendChild(option);
    });

    const newOption = createElement('option', '', '새 목차 만들기');
    newOption.value = NEW_CATEGORY_VALUE;
    elements.wordCategory.appendChild(newOption);

    const selectedId = options.some((category) => category.id === preferredId)
      ? preferredId
      : (options[0]?.id || NEW_CATEGORY_VALUE);
    elements.wordCategory.value = selectedId;
    updateWordNewCategoryVisibility();
  }

  function configureWordFormForLanguage() {
    const labels = app.set.labels || languageLabels(app.set.language);
    const isEnglish = supportsEnglish();
    elements.wordFrontLabel.textContent = labels.front || '단어';
    elements.wordReadingLabel.textContent = isEnglish ? '읽기 (영어는 공란)' : (labels.reading || '읽기');
    elements.wordMeaningLabel.textContent = labels.meaning || '뜻';
    elements.wordReading.placeholder = isEnglish ? '비워두세요' : (supportsPinyinPractice() ? 'pinyin' : '');
    elements.wordReading.inputMode = supportsPinyinPractice() ? 'latin' : 'text';
    elements.wordReadingAuto.hidden = !supportsFurigana();
    elements.wordReadingAuto.disabled = false;
  }

  function clearWordFormHints() {
    elements.wordFormHint.textContent = '';
    elements.wordFormHint.classList.remove('is-error');
    elements.wordImportHint.textContent = '';
    elements.wordImportHint.classList.remove('is-error');
  }

  function setWordEntryMode(mode, options = {}) {
    const nextMode = mode === 'import' ? 'import' : 'single';
    const importMode = nextMode === 'import';
    wordEntryMode = nextMode;

    elements.wordSingleMode.classList.toggle('is-active', !importMode);
    elements.wordSingleMode.setAttribute('aria-pressed', importMode ? 'false' : 'true');
    elements.wordImportMode.classList.toggle('is-active', importMode);
    elements.wordImportMode.setAttribute('aria-pressed', importMode ? 'true' : 'false');

    elements.wordSingleFields.hidden = importMode;
    elements.wordImportBox.hidden = !importMode;
    elements.wordSubmitButton.hidden = importMode;

    [elements.wordFront, elements.wordReading, elements.wordMeaning, elements.wordPos].forEach((input) => {
      input.disabled = importMode;
    });
    elements.wordReadingAuto.disabled = importMode || !supportsFurigana();
    elements.wordTemplateDownload.disabled = !importMode;
    elements.wordImportFile.disabled = !importMode;

    if (options.clearHints) clearWordFormHints();
    if (!options.focus) return;

    if (importMode) {
      elements.wordTemplateDownload.focus();
    } else if (elements.wordCategory.value === NEW_CATEGORY_VALUE) {
      elements.wordNewCategory.focus();
    } else {
      elements.wordFront.focus();
    }
  }

  function selectedWordCategoryId() {
    if (elements.wordCategory.value !== NEW_CATEGORY_VALUE) {
      return elements.wordCategory.value || CUSTOM_CATEGORY_ID;
    }

    const category = createCustomCategory({
      title: elements.wordNewCategory.value,
      priority: '추가'
    }, { deferRender: true });

    return category?.id || '';
  }

  function selectedWordCategoryTitle() {
    const selected = categoryOptionList().find((category) => category.id === elements.wordCategory.value);
    return selected?.title || '';
  }

  function templateHeaders() {
    const labels = app.set?.labels || languageLabels(app.set?.language || 'other');
    const readingLabel = supportsEnglish() ? '읽기 (영어는 공란)' : (labels.reading || '읽기');
    return ['목차', labels.front || '단어', labels.meaning || '뜻', '품사', readingLabel];
  }

  function templateExampleRow() {
    const category = selectedWordCategoryTitle() || '예문';
    if (supportsPinyinPractice()) return [category, '你好', '안녕하세요', '', 'nǐ hǎo'];
    if (supportsFurigana()) return [category, '勉強する', '공부하다', '동사', 'べんきょうする'];
    if (supportsEnglish()) return [category, 'apple', '사과', '명사', ''];
    return [category, 'example', '예시', '', ''];
  }

  function csvEscape(value) {
    const text = String(value ?? '');
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function safeFilename(text) {
    return String(text || 'vocab').trim().replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '-');
  }

  function downloadWordTemplate() {
    const rows = [templateHeaders(), templateExampleRow()];
    const filenameBase = `${safeFilename(app.set?.title)}-단어입력양식`;

    if (window.XLSX?.utils) {
      const sheet = window.XLSX.utils.aoa_to_sheet(rows);
      sheet['!cols'] = [{ wch: 18 }, { wch: 18 }, { wch: 28 }, { wch: 12 }, { wch: 22 }];
      const book = window.XLSX.utils.book_new();
      window.XLSX.utils.book_append_sheet(book, sheet, '단어입력');
      window.XLSX.writeFile(book, `${filenameBase}.xlsx`);
      return;
    }

    const csv = `\ufeff${rows.map((row) => row.map(csvEscape).join(',')).join('\r\n')}`;
    downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `${filenameBase}.csv`);
  }

  function parseDelimitedRows(text, delimiter) {
    const rows = [];
    let row = [];
    let cell = '';
    let inQuotes = false;
    const source = String(text || '').replace(/^\ufeff/, '');

    for (let i = 0; i < source.length; i += 1) {
      const char = source[i];
      const next = source[i + 1];

      if (char === '"') {
        if (inQuotes && next === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }

      if (!inQuotes && char === delimiter) {
        row.push(cell);
        cell = '';
        continue;
      }

      if (!inQuotes && (char === '\n' || char === '\r')) {
        if (char === '\r' && next === '\n') i += 1;
        row.push(cell);
        rows.push(row);
        row = [];
        cell = '';
        continue;
      }

      cell += char;
    }

    row.push(cell);
    if (row.some((value) => String(value).trim())) rows.push(row);
    return rows;
  }

  function normalizeImportHeader(value) {
    return String(value || '').trim().toLocaleLowerCase().replace(/[\s_./\\()[\]{}-]+/g, '');
  }

  function importAliases() {
    const labels = app.set?.labels || {};
    return {
      category: ['목차', '카테고리', '분류', 'category', 'cat', 'section'],
      front: [labels.front, '단어', '중국어', '일본어', '영어', '표제어', '한자', 'front', 'word'],
      reading: [labels.reading, '읽기', '읽기 (영어는 공란)', '읽기 공란', '병음', '발음', '후리가나', '가나', 'pinyin', 'reading'],
      meaning: [labels.meaning, '뜻', '의미', '해석', '한국어', 'meaning', 'mean'],
      partOfSpeech: ['품사', '품사선택', 'partofspeech', 'pos']
    };
  }

  function columnIndex(headers, aliases) {
    const normalizedAliases = aliases.filter(Boolean).map(normalizeImportHeader);
    return headers.findIndex((header) => normalizedAliases.includes(normalizeImportHeader(header)));
  }

  function looksLikeReading(value) {
    const text = String(value || '').trim();
    if (!text) return false;
    if (/[\u3040-\u30ff]/.test(text) && !/[가-힣]/.test(text)) return true;
    if (/^[a-züv:0-9\s'’.·-]+$/i.test(text) && !/[가-힣]/.test(text)) return true;
    return false;
  }

  function headerlessImportColumnMap(row) {
    const withCategory = row.length > 4;
    const offset = withCategory ? 1 : 0;
    const maybeReading = row[offset + 1];
    const maybeMeaning = row[offset + 2];
    const oldReadingOrder = looksLikeReading(maybeReading) && !looksLikeReading(maybeMeaning);

    if (oldReadingOrder) {
      return {
        hasHeader: false,
        category: withCategory ? 0 : -1,
        front: offset,
        reading: offset + 1,
        meaning: offset + 2,
        partOfSpeech: offset + 3
      };
    }

    return {
      hasHeader: false,
      category: withCategory ? 0 : -1,
      front: offset,
      meaning: offset + 1,
      partOfSpeech: offset + 2,
      reading: offset + 3
    };
  }

  function buildImportColumnMap(headerRow) {
    const aliases = importAliases();
    const map = {
      category: columnIndex(headerRow, aliases.category),
      front: columnIndex(headerRow, aliases.front),
      reading: columnIndex(headerRow, aliases.reading),
      meaning: columnIndex(headerRow, aliases.meaning),
      partOfSpeech: columnIndex(headerRow, aliases.partOfSpeech)
    };
    const hasHeader = Object.values(map).some((index) => index >= 0);

    if (!hasHeader) {
      return headerlessImportColumnMap(headerRow);
    }

    return {
      hasHeader: true,
      category: map.category,
      front: map.front >= 0 ? map.front : 1,
      reading: map.reading >= 0 ? map.reading : 4,
      meaning: map.meaning >= 0 ? map.meaning : 2,
      partOfSpeech: map.partOfSpeech >= 0 ? map.partOfSpeech : 3
    };
  }

  function cellValue(row, index) {
    return index >= 0 ? String(row[index] ?? '').trim() : '';
  }

  function resolveImportCategory(categoryTitle, fallbackId) {
    const title = String(categoryTitle || '').trim();
    if (!title) return fallbackId;

    const existing = findCategoryByTitle(title);
    if (existing) return existing.id;

    const category = createCustomCategory({
      title,
      priority: '가져오기',
      description: '엑셀 양식에서 가져온 목차입니다.'
    }, { deferRender: true });
    return category?.id || fallbackId;
  }

  function rowsToCustomWords(rows) {
    if (!rows.length) return { words: [], skipped: 0, error: '파일에 읽을 행이 없습니다.' };

    const map = buildImportColumnMap(rows[0]);
    const dataRows = map.hasHeader ? rows.slice(1) : rows;
    let fallbackCategoryId = '';
    let skipped = 0;
    const words = [];

    const getFallbackCategoryId = () => {
      if (!fallbackCategoryId) fallbackCategoryId = selectedWordCategoryId();
      return fallbackCategoryId;
    };

    dataRows.forEach((row) => {
      const front = cellValue(row, map.front);
      const meaning = cellValue(row, map.meaning);
      if (!front && !meaning) {
        skipped += 1;
        return;
      }

      const categoryId = resolveImportCategory(cellValue(row, map.category), getFallbackCategoryId());
      if (!categoryId) {
        skipped += 1;
        return;
      }

      words.push({
        categoryId,
        front,
        reading: cellValue(row, map.reading),
        meaning,
        partOfSpeech: cellValue(row, map.partOfSpeech)
      });
    });

    return { words, skipped };
  }

  async function readImportRows(file) {
    const name = String(file.name || '').toLocaleLowerCase();
    if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
      if (!window.XLSX?.read) {
        throw new Error('엑셀 파일을 읽는 라이브러리를 불러오지 못했습니다. CSV로 저장해서 다시 올려주세요.');
      }
      const book = window.XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const sheet = book.Sheets[book.SheetNames[0]];
      return window.XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    }

    const text = await file.text();
    const delimiter = name.endsWith('.tsv') || text.includes('\t') ? '\t' : ',';
    return parseDelimitedRows(text, delimiter);
  }

  async function importWordsFromFile(file) {
    if (!file) return;

    elements.wordImportHint.classList.remove('is-error');
    elements.wordImportHint.textContent = '파일을 읽는 중…';

    try {
      const result = rowsToCustomWords(await readImportRows(file));
      if (result.error) throw new Error(result.error);
      const count = addCustomWordsBulk(result.words);
      if (!count) throw new Error('추가할 단어를 찾지 못했습니다. 양식의 단어/뜻 열을 확인해 주세요.');

      const skippedText = result.skipped ? ` 빈 행 ${result.skipped}개는 건너뛰었습니다.` : '';
      elements.wordImportHint.textContent = `${count}개 단어를 추가했습니다.${skippedText}`;
      elements.wordImportFile.value = '';
      const firstCategoryId = result.words[0]?.categoryId;
      if (firstCategoryId) {
        populateWordCategoryOptions(firstCategoryId);
      }
    } catch (error) {
      elements.wordImportHint.textContent = error.message || '파일을 읽지 못했습니다.';
      elements.wordImportHint.classList.add('is-error');
    }
  }

  function openWordForm() {
    if (!app.set) return;

    configureWordFormForLanguage();
    elements.wordForm.reset();
    populateWordCategoryOptions(getCurrentCategoryId());
    clearWordFormHints();
    elements.wordImportFile.value = '';
    setWordEntryMode('single');
    elements.wordFormModal.hidden = false;
    if (elements.wordCategory.value === NEW_CATEGORY_VALUE) elements.wordNewCategory.focus();
    else elements.wordFront.focus();
  }

  function closeWordForm() {
    elements.wordFormModal.hidden = true;
  }

  function openCategoryForm() {
    if (!app.set) return;
    elements.categoryForm.reset();
    elements.categoryPriority.value = '추가';
    elements.categoryFormHint.textContent = '';
    elements.categoryFormHint.classList.remove('is-error');
    elements.categoryFormModal.hidden = false;
    elements.categoryTitle.focus();
  }

  function closeCategoryForm() {
    elements.categoryFormModal.hidden = true;
  }

  function openSetForm() {
    closeMenu();
    elements.setForm.reset();
    elements.setFormHint.textContent = '';
    elements.setFormHint.classList.remove('is-error');
    elements.setFormModal.hidden = false;
    elements.setTitle.focus();
  }

  function closeSetForm() {
    elements.setFormModal.hidden = true;
  }

  function bindStaticEvents() {
    elements.pageTitle.tabIndex = 0;
    elements.pageTitle.setAttribute('role', 'button');
    elements.pageTitle.setAttribute('aria-label', '처음 화면으로 이동');
    elements.pageTitle.addEventListener('click', goToLanding);
    elements.pageTitle.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      goToLanding();
    });

    elements.setSelector.addEventListener('change', () => {
      loadVocabularySet(elements.setSelector.value);
    });

    elements.menuToggle.addEventListener('click', (event) => {
      event.stopPropagation();
      toggleMenu();
    });

    elements.appMenu.addEventListener('click', (event) => event.stopPropagation());

    document.addEventListener('click', () => {
      if (!elements.appMenu.hidden) closeMenu();
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !elements.appMenu.hidden) closeMenu();
    });

    elements.backToTocButton.addEventListener('click', () => {
      if (app.reviewActive) {
        exitReviewMode();
        return;
      }

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
      if (app.reviewActive) {
        app.reviewActive = false;
        if (reviewController) reviewController.reset();
      }
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

    let fitResizeTimer = null;
    window.addEventListener('resize', () => {
      window.clearTimeout(fitResizeTimer);
      fitResizeTimer = window.setTimeout(fitVisibleFronts, 150);
    });

    elements.hideMeaningButton.addEventListener('click', () => {
      document.querySelectorAll('.meaning').forEach((element) => element.classList.toggle('hidden-meaning'));
    });

    elements.hidePinyinButton.addEventListener('click', () => {
      document.querySelectorAll('.pinyin').forEach((element) => element.classList.toggle('hidden-pinyin'));
      document.querySelectorAll('.furigana-term rt').forEach((element) => element.classList.toggle('hidden-pinyin'));
    });

    document.addEventListener('click', (event) => {
      const delButton = event.target.closest('.word-del');
      if (delButton) {
        event.stopPropagation();
        deleteCustomWord(delButton.dataset.key);
        return;
      }

      const categoryDelButton = event.target.closest('.category-del');
      if (categoryDelButton) {
        event.stopPropagation();
        deleteCustomCategory(categoryDelButton.dataset.categoryId);
        return;
      }

      const card = event.target.closest('.word-card');
      if (!card || event.target.closest('.card-check') || event.target.closest('.pinyin-practice-input')) return;

      const front = event.target.closest('.hanzi');
      if (front) {
        speakStudyText(front.dataset.speech || front.textContent.trim());
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
      closeMenu();
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
      if (!supportsPinyinPractice()) return;
      if (app.quizActive) exitQuizMode();
      if (app.reviewActive) exitReviewMode();
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

    elements.reviewButton.addEventListener('click', () => {
      if (app.reviewActive) {
        exitReviewMode();
      } else {
        enterReviewMode();
      }
    });

    elements.addWordButton.addEventListener('click', openWordForm);
    elements.addWordTocButton.addEventListener('click', openWordForm);
    elements.addCategoryButton.addEventListener('click', openCategoryForm);
    elements.addCategoryTocButton.addEventListener('click', openCategoryForm);
    elements.wordSingleMode.addEventListener('click', () => setWordEntryMode('single', { clearHints: true, focus: true }));
    elements.wordImportMode.addEventListener('click', () => setWordEntryMode('import', { clearHints: true, focus: true }));
    elements.wordCategory.addEventListener('change', updateWordNewCategoryVisibility);
    elements.wordReadingAuto.addEventListener('click', () => autoFillReading());
    elements.wordFront.addEventListener('blur', () => autoFillReading({ onlyWhenEmpty: true }));
    elements.wordTemplateDownload.addEventListener('click', downloadWordTemplate);
    elements.wordImportFile.addEventListener('change', () => importWordsFromFile(elements.wordImportFile.files[0]));

    elements.wordForm.addEventListener('submit', (event) => {
      event.preventDefault();
      if (wordEntryMode !== 'single') return;

      const front = elements.wordFront.value;
      const meaning = elements.wordMeaning.value;
      if (!front.trim() && !meaning.trim()) {
        elements.wordFormHint.textContent = '단어와 뜻 중 하나는 입력해 주세요.';
        elements.wordFormHint.classList.add('is-error');
        return;
      }

      const categoryId = selectedWordCategoryId();
      if (!categoryId) {
        elements.wordFormHint.textContent = '목차 이름을 입력해 주세요.';
        elements.wordFormHint.classList.add('is-error');
        return;
      }

      const added = addCustomWord({
        categoryId,
        front,
        reading: elements.wordReading.value,
        meaning,
        partOfSpeech: elements.wordPos.value
      });

      if (!added) {
        elements.wordFormHint.textContent = '단어와 뜻 중 하나는 입력해 주세요.';
        elements.wordFormHint.classList.add('is-error');
        return;
      }

      elements.wordFormHint.textContent = '추가되었습니다. 계속 입력할 수 있어요.';
      elements.wordFormHint.classList.remove('is-error');
      elements.wordFront.value = '';
      elements.wordReading.value = '';
      elements.wordMeaning.value = '';
      elements.wordPos.value = '';
      populateWordCategoryOptions(categoryId);
      elements.wordFront.focus();
    });

    elements.wordFormClose.addEventListener('click', closeWordForm);

    elements.categoryForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const category = createCustomCategory({
        title: elements.categoryTitle.value,
        description: elements.categoryDescription.value,
        priority: elements.categoryPriority.value
      });

      if (!category) {
        elements.categoryFormHint.textContent = '목차 이름을 입력해 주세요.';
        elements.categoryFormHint.classList.add('is-error');
        return;
      }

      closeCategoryForm();
      location.hash = `#${encodeURIComponent(category.id)}`;
    });

    elements.categoryFormClose.addEventListener('click', closeCategoryForm);

    elements.createSetMenu.addEventListener('click', openSetForm);

    elements.setForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const meta = createCustomSet({
        title: elements.setTitle.value,
        language: elements.setLanguage.value
      });

      if (!meta) {
        elements.setFormHint.textContent = '단어장 이름을 입력해 주세요.';
        elements.setFormHint.classList.add('is-error');
        return;
      }

      closeSetForm();
      loadVocabularySet(meta.id);
    });

    elements.setFormClose.addEventListener('click', closeSetForm);

    [elements.wordFormModal, elements.setFormModal, elements.categoryFormModal].forEach((modal) => {
      modal.querySelector('.modal-backdrop').addEventListener('click', () => {
        if (modal === elements.wordFormModal) closeWordForm();
        else if (modal === elements.categoryFormModal) closeCategoryForm();
        else closeSetForm();
      });
    });

    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      if (!elements.wordFormModal.hidden) closeWordForm();
      if (!elements.categoryFormModal.hidden) closeCategoryForm();
      if (!elements.setFormModal.hidden) closeSetForm();
    });

    elements.signInGoogleButton.addEventListener('click', async () => {
      closeMenu();
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
      closeMenu();
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
    customSets = loadCustomSets();
    registerCustomSets();
    populateSetSelector();
    renderSubjectMenu();
    renderLanding();
    bindStaticEvents();

    quizController = window.HSKQuiz.createQuizController({
      getWords: getQuizWords,
      getSet: () => app.set,
      onCheckWord: (word, checked) => setWordChecked(word.key, checked)
    });

    reviewController = window.HSKReview.createReviewController({
      getQueue: buildReviewQueue,
      getSet: () => app.set,
      speak: speakStudyText,
      onGrade: gradeReviewWord,
      onExit: exitReviewMode
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
