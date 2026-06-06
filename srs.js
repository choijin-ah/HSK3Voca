(function () {
  const DAY = 24 * 60 * 60 * 1000;
  const DEFAULT_EASE = 2.5;
  const MIN_EASE = 1.3;
  const NEW_PER_SESSION = 15;

  // Compute the next SRS state for a card given a grade.
  // card: { ease, interval, reps, lapses, due, last } | null (new card)
  // grade: 'again' | 'hard' | 'good'
  function schedule(card, grade, at) {
    let ease = (card && card.ease) || DEFAULT_EASE;
    let interval = (card && card.interval) || 0;
    let reps = (card && card.reps) || 0;
    let lapses = (card && card.lapses) || 0;

    if (grade === 'again') {
      ease = Math.max(MIN_EASE, ease - 0.2);
      reps = 0;
      lapses += 1;
      interval = 0;
    } else if (grade === 'hard') {
      ease = Math.max(MIN_EASE, ease - 0.15);
      interval = reps === 0 ? 1 : Math.max(1, Math.round(interval * 1.2));
      reps += 1;
    } else {
      if (reps === 0) interval = 1;
      else if (reps === 1) interval = 3;
      else interval = Math.max(1, Math.round(interval * ease));
      reps += 1;
    }

    const due = grade === 'again' ? at : at + interval * DAY;
    return { ease, interval, reps, lapses, due, last: at };
  }

  // Short human label for how far a grade pushes the next review.
  function previewLabel(card, grade) {
    if (grade === 'again') return '곧';
    const next = schedule(card, grade, 0);
    const d = next.interval;
    if (d <= 0) return '곧';
    if (d === 1) return '1일';
    if (d < 30) return `${d}일`;
    if (d < 365) return `${Math.round(d / 30)}개월`;
    return `${Math.round(d / 365)}년`;
  }

  function isDue(card, at) {
    if (!card || !card.due) return true; // new card
    return card.due <= at;
  }

  function createReviewController(options) {
    const {
      getQueue,
      getSet,
      speak,
      onGrade,
      onExit
    } = options;

    const elements = {
      panel: document.getElementById('reviewPanel'),
      progress: document.getElementById('reviewProgress'),
      card: document.getElementById('reviewCard'),
      meta: document.getElementById('reviewMeta'),
      front: document.getElementById('reviewFront'),
      speak: document.getElementById('reviewSpeak'),
      back: document.getElementById('reviewBack'),
      reading: document.getElementById('reviewReading'),
      meaning: document.getElementById('reviewMeaning'),
      done: document.getElementById('reviewDone'),
      show: document.getElementById('reviewShow'),
      grades: document.getElementById('reviewGrades')
    };

    let queue = [];
    let current = null;
    let revealed = false;
    let reviewedCount = 0;

    function setHidden(element, hidden) {
      if (element) element.hidden = hidden;
    }

    function remaining() {
      return queue.length + (current ? 1 : 0);
    }

    function start() {
      queue = getQueue().slice();
      reviewedCount = 0;
      next();
    }

    function next() {
      revealed = false;
      current = queue.shift() || null;
      render();
    }

    function reveal() {
      if (!current) return;
      revealed = true;
      render();
    }

    function gradeCurrent(grade) {
      if (!current || !revealed) return;

      const at = Date.now();
      const card = schedule(current.srs, grade, at);
      current.srs = card;
      onGrade(current, card);
      reviewedCount += 1;

      // "모름"은 같은 세션 안에서 다시 보여줍니다.
      if (grade === 'again') queue.push(current);
      next();
    }

    function renderDone() {
      current = null;
      setHidden(elements.card, true);
      setHidden(elements.show, true);
      setHidden(elements.grades, true);
      setHidden(elements.done, false);
      elements.progress.textContent = '';
      elements.done.replaceChildren();
      const title = document.createElement('p');
      title.className = 'review-done-title';
      title.textContent = reviewedCount > 0 ? '🎉 오늘 복습 완료!' : '지금 복습할 단어가 없어요.';
      const sub = document.createElement('p');
      sub.className = 'review-done-sub';
      sub.textContent = reviewedCount > 0
        ? `${reviewedCount}개를 복습했어요. 내일 또 만나요.`
        : '단어를 좀 더 학습한 뒤 다시 와 주세요.';
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = '목차로 돌아가기';
      button.addEventListener('click', () => onExit && onExit());
      elements.done.append(title, sub, button);
    }

    function render() {
      const set = getSet();
      if (!current || !set) {
        renderDone();
        return;
      }

      setHidden(elements.done, true);
      setHidden(elements.card, false);

      const isNew = !current.srs;
      elements.meta.textContent = isNew
        ? `새 단어 · ${current.category || set.title}`
        : (current.category || set.title);
      elements.front.textContent = current.front;
      elements.reading.textContent = current.reading || '';
      elements.meaning.textContent = current.meaning || '';

      setHidden(elements.back, !revealed);
      setHidden(elements.show, revealed);
      setHidden(elements.grades, !revealed);

      if (revealed) {
        elements.grades.querySelectorAll('button[data-grade]').forEach((button) => {
          const hint = button.querySelector('.grade-hint');
          if (hint) hint.textContent = previewLabel(current.srs, button.dataset.grade);
        });
      }

      const total = reviewedCount + remaining();
      elements.progress.textContent = `${reviewedCount} / ${total}`;
    }

    function reset() {
      queue = [];
      current = null;
      revealed = false;
      reviewedCount = 0;
    }

    elements.show.addEventListener('click', reveal);
    elements.speak.addEventListener('click', () => {
      if (current && speak) speak(current.front);
    });
    elements.grades.querySelectorAll('button[data-grade]').forEach((button) => {
      button.addEventListener('click', () => gradeCurrent(button.dataset.grade));
    });

    document.addEventListener('keydown', (event) => {
      if (elements.panel.hidden || !current) return;
      if (event.target instanceof HTMLInputElement) return;

      if (event.code === 'Space' || event.key === ' ') {
        event.preventDefault();
        if (!revealed) reveal();
        return;
      }
      if (!revealed) return;
      if (event.key === '1') gradeCurrent('again');
      else if (event.key === '2') gradeCurrent('hard');
      else if (event.key === '3') gradeCurrent('good');
    });

    return {
      start,
      reset
    };
  }

  window.HSKReview = {
    NEW_PER_SESSION,
    schedule,
    previewLabel,
    isDue,
    createReviewController
  };
})();
