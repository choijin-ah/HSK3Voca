(function () {
  function getRandomItem(items) {
    return items[Math.floor(Math.random() * items.length)];
  }

  function setHidden(element, hidden) {
    if (!element) return;
    element.hidden = hidden;
  }

  function formatAnswer(word, mode) {
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
      answer: document.getElementById('quizAnswer'),
      showAnswer: document.getElementById('showQuizAnswer'),
      next: document.getElementById('nextQuiz'),
      check: document.getElementById('checkQuizWord')
    };

    let currentWord = null;
    let answerVisible = false;

    function renderEmpty(message) {
      setHidden(elements.empty, false);
      setHidden(elements.card, true);
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

      setHidden(elements.empty, true);
      setHidden(elements.card, false);
      elements.meta.textContent = currentWord.category || set.title;
      elements.prompt.textContent = formatPrompt(currentWord, mode);
      elements.reading.textContent = hint || '';
      elements.answer.textContent = formatAnswer(currentWord, mode);
      setHidden(elements.answer, !answerVisible);
      elements.showAnswer.disabled = false;
      elements.next.disabled = false;
      elements.check.disabled = false;
      elements.check.textContent = currentWord.checked ? '체크 해제' : '체크하기';
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
      renderCurrent();
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
      setHidden(elements.answer, true);
    }

    elements.showAnswer.addEventListener('click', () => {
      answerVisible = true;
      renderCurrent();
    });

    elements.next.addEventListener('click', nextQuestion);
    elements.mode.addEventListener('change', nextQuestion);
    elements.scope.addEventListener('change', nextQuestion);
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
