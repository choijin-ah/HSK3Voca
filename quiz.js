(function () {
  const PINYIN_INPUT_MODE = 'front-pinyin-input';

  function getRandomItem(items) {
    return items[Math.floor(Math.random() * items.length)];
  }

  function shuffle(items) {
    const copy = items.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = copy[i];
      copy[i] = copy[j];
      copy[j] = tmp;
    }
    return copy;
  }

  // 병음 입력 모드를 제외한 나머지(단어→뜻, 뜻→단어, 읽기→단어)는 4지선다로 출제.
  function isChoiceMode(mode) {
    return !isPinyinInputMode(mode);
  }

  function setHidden(element, hidden) {
    if (!element) return;
    element.hidden = hidden;
  }

  function isPinyinInputMode(mode) {
    return mode === PINYIN_INPUT_MODE;
  }

  function normalizePinyin(text) {
    return String(text || '')
      .trim()
      .toLocaleLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/u:/g, 'v')
      .replace(/[0-5]/g, '')
      .replace(/[^a-zv]/g, '')
      .replace(/v/g, 'u');
  }

  function isPinyinMatch(input, reading) {
    const expected = normalizePinyin(reading);
    return Boolean(expected) && normalizePinyin(input) === expected;
  }

  function formatAnswer(word, mode) {
    if (isPinyinInputMode(mode)) {
      return `${word.reading}${word.meaning ? ` - ${word.meaning}` : ''}`;
    }

    if (mode === 'meaning-front') {
      return `${word.front}${word.reading ? ` (${word.reading})` : ''}`;
    }

    if (mode === 'reading-front') {
      return `${word.front} - ${word.meaning}`;
    }

    return word.meaning;
  }

  function formatPrompt(word, mode) {
    if (mode === 'meaning-front') return word.meaning;
    if (mode === 'reading-front') return word.reading || word.front;
    return word.front;
  }

  function formatHint(word, mode) {
    if (mode === 'front-meaning') return word.reading;
    if (isPinyinInputMode(mode)) return word.meaning;
    if (mode === 'meaning-front') return word.category;
    return word.category;
  }

  function createQuizController(options) {
    const {
      getWords,
      getSet,
      onCheckWord
    } = options;

    const elements = {
      panel: document.getElementById('quizPanel'),
      mode: document.getElementById('quizMode'),
      scope: document.getElementById('quizScope'),
      empty: document.getElementById('quizEmpty'),
      card: document.getElementById('quizCard'),
      meta: document.getElementById('quizMeta'),
      prompt: document.getElementById('quizPrompt'),
      reading: document.getElementById('quizReading'),
      inputForm: document.getElementById('quizInputForm'),
      pinyinInput: document.getElementById('quizPinyinInput'),
      submitPinyin: document.getElementById('submitQuizPinyin'),
      feedback: document.getElementById('quizFeedback'),
      answer: document.getElementById('quizAnswer'),
      showAnswer: document.getElementById('showQuizAnswer'),
      next: document.getElementById('nextQuiz'),
      check: document.getElementById('checkQuizWord'),
      choices: document.getElementById('quizChoices')
    };

    let currentWord = null;
    let answerVisible = false;
    let inputSubmitted = false;
    let inputCorrect = false;
    let currentChoices = [];
    let choiceAnswered = false;
    let choiceCorrect = false;
    let choiceSelectedKey = null;

    function resetPinyinInput() {
      inputSubmitted = false;
      inputCorrect = false;
      if (elements.pinyinInput) elements.pinyinInput.value = '';
      if (elements.feedback) {
        elements.feedback.textContent = '';
        elements.feedback.className = 'quiz-feedback';
      }
      if (elements.submitPinyin) elements.submitPinyin.textContent = '확인';
    }

    function focusPinyinInput() {
      if (!elements.pinyinInput || elements.inputForm.hidden) return;
      if (!window.matchMedia('(pointer: fine)').matches) return;
      window.setTimeout(() => elements.pinyinInput.focus(), 0);
    }

    function renderEmpty(message) {
      setHidden(elements.empty, false);
      setHidden(elements.card, true);
      setHidden(elements.inputForm, true);
      setHidden(elements.choices, true);
      setHidden(elements.feedback, true);
      elements.empty.textContent = message;
      elements.showAnswer.disabled = true;
      elements.next.disabled = true;
      elements.check.disabled = true;
    }

    function renderCurrent() {
      const set = getSet();
      if (!currentWord || !set) {
        renderEmpty('퀴즈로 낼 단어가 없습니다.');
        return;
      }

      const mode = elements.mode.value;
      const hint = formatHint(currentWord, mode);
      const inputMode = isPinyinInputMode(mode);
      const choiceMode = !inputMode;

      setHidden(elements.empty, true);
      setHidden(elements.card, false);
      elements.meta.textContent = currentWord.category || set.title;
      elements.prompt.textContent = formatPrompt(currentWord, mode);
      elements.reading.textContent = hint || '';
      elements.answer.textContent = formatAnswer(currentWord, mode);
      setHidden(elements.inputForm, !inputMode);
      setHidden(elements.choices, !choiceMode);

      if (inputMode) {
        setHidden(elements.feedback, false);
        elements.feedback.textContent = inputSubmitted
          ? (inputCorrect ? '맞았습니다.' : '다시 확인해보세요.')
          : '';
        elements.feedback.className = `quiz-feedback${inputSubmitted ? (inputCorrect ? ' is-correct' : ' is-incorrect') : ''}`;
        elements.submitPinyin.textContent = inputSubmitted && inputCorrect ? '다음' : '확인';
      } else {
        renderChoices(mode);
        setHidden(elements.feedback, !choiceAnswered);
        if (choiceAnswered) {
          elements.feedback.textContent = choiceCorrect
            ? '맞았습니다.'
            : `정답: ${formatAnswer(currentWord, mode)}`;
          elements.feedback.className = `quiz-feedback ${choiceCorrect ? 'is-correct' : 'is-incorrect'}`;
        }
      }

      setHidden(elements.answer, choiceMode || !answerVisible);
      elements.showAnswer.disabled = choiceMode && choiceAnswered;
      elements.next.disabled = false;
      elements.check.disabled = false;
      elements.check.textContent = currentWord.checked ? '체크 해제' : '체크하기';
    }

    // 정답 1개 + 보기 텍스트가 겹치지 않는 오답 3개를 섞어 4지선다 보기를 만든다.
    function buildChoices(word, mode) {
      const seen = new Set([formatAnswer(word, mode)]);
      const distractors = [];
      const addFrom = (list) => {
        shuffle(list).forEach((candidate) => {
          if (distractors.length >= 3) return;
          if (candidate.key === word.key) return;
          const text = formatAnswer(candidate, mode);
          if (seen.has(text)) return;
          seen.add(text);
          distractors.push(candidate);
        });
      };
      addFrom(getWords(elements.scope.value));
      if (distractors.length < 3) addFrom(getWords('all'));
      return shuffle([word].concat(distractors));
    }

    function renderChoices(mode) {
      if (!elements.choices) return;
      elements.choices.replaceChildren();
      currentChoices.forEach((word) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'quiz-choice';
        button.dataset.key = word.key;
        button.textContent = formatAnswer(word, mode);
        if (choiceAnswered) {
          button.disabled = true;
          if (word.key === currentWord.key) button.classList.add('is-correct');
          else if (word.key === choiceSelectedKey) button.classList.add('is-wrong');
        }
        elements.choices.appendChild(button);
      });
    }

    function nextQuestion() {
      const pool = getWords(elements.scope.value);
      if (!pool.length) {
        currentWord = null;
        renderEmpty('현재 범위에 퀴즈로 낼 단어가 없습니다.');
        return;
      }

      currentWord = getRandomItem(pool);
      answerVisible = false;
      choiceAnswered = false;
      choiceCorrect = false;
      choiceSelectedKey = null;
      currentChoices = isChoiceMode(elements.mode.value)
        ? buildChoices(currentWord, elements.mode.value)
        : [];
      resetPinyinInput();
      renderCurrent();
      focusPinyinInput();
    }

    function refresh() {
      if (!currentWord) {
        nextQuestion();
        return;
      }

      const updatedWord = getWords('all').find((word) => word.key === currentWord.key);
      currentWord = updatedWord || currentWord;
      renderCurrent();
    }

    function reset() {
      currentWord = null;
      answerVisible = false;
      choiceAnswered = false;
      choiceCorrect = false;
      choiceSelectedKey = null;
      currentChoices = [];
      resetPinyinInput();
      setHidden(elements.answer, true);
      setHidden(elements.inputForm, true);
      setHidden(elements.choices, true);
      setHidden(elements.feedback, true);
    }

    elements.showAnswer.addEventListener('click', () => {
      if (isChoiceMode(elements.mode.value)) {
        choiceAnswered = true;
        answerVisible = true;
        renderCurrent();
        return;
      }
      answerVisible = true;
      renderCurrent();
    });

    if (elements.choices) {
      elements.choices.addEventListener('click', (event) => {
        const button = event.target.closest('.quiz-choice');
        if (!button || !currentWord || choiceAnswered) return;
        choiceSelectedKey = button.dataset.key;
        choiceCorrect = choiceSelectedKey === currentWord.key;
        choiceAnswered = true;
        answerVisible = true;
        renderCurrent();
      });
    }

    elements.next.addEventListener('click', nextQuestion);
    elements.mode.addEventListener('change', nextQuestion);
    elements.scope.addEventListener('change', nextQuestion);
    elements.inputForm.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!currentWord) return;

      if (inputSubmitted && inputCorrect) {
        nextQuestion();
        return;
      }

      inputSubmitted = true;
      inputCorrect = isPinyinMatch(elements.pinyinInput.value, currentWord.reading);
      answerVisible = inputCorrect;
      renderCurrent();
    });
    elements.pinyinInput.addEventListener('input', () => {
      if (!inputSubmitted) return;
      inputSubmitted = false;
      inputCorrect = false;
      answerVisible = false;
      renderCurrent();
    });
    elements.check.addEventListener('click', () => {
      if (!currentWord) return;
      const nextChecked = !currentWord.checked;
      onCheckWord(currentWord, nextChecked);
      currentWord.checked = nextChecked;
      renderCurrent();
    });

    return {
      nextQuestion,
      refresh,
      reset
    };
  }

  window.HSKQuiz = {
    createQuizController
  };
})();
