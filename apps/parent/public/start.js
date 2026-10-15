// Лендинг KidsPlus (/start): живые превью. Отдельным файлом — CSP кабинета не пускает inline-скрипты.
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.documentElement.classList.add('js');

  // ── Навигация: подложка после прокрутки ──
  const nav = $('#nav');
  const onScroll = () => nav.classList.toggle('scrolled', scrollY > 10);
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // ── Появление при прокрутке ──
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.add('in');
        io.unobserve(e.target);
      }
    },
    { threshold: 0.15, rootMargin: '0px 0px -40px 0px' },
  );
  $$('.reveal').forEach((el, i) => {
    el.style.transitionDelay = `${(i % 4) * 70}ms`;
    io.observe(el);
  });

  // ── Озвучка (если в браузере есть голоса) ──
  const say = (text, lang) => {
    if (!('speechSynthesis' in window)) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang;
      u.rate = 0.85;
      u.pitch = 1.1;
      speechSynthesis.speak(u);
    } catch {
      /* без звука — не страшно */
    }
  };

  // ── Конфетти ──
  const canvas = $('#confetti');
  const ctx = canvas.getContext('2d');
  let bits = [];
  let raf = 0;
  const confetti = () => {
    if (calm) return;
    const r = canvas.getBoundingClientRect();
    canvas.width = r.width * devicePixelRatio;
    canvas.height = r.height * devicePixelRatio;
    const colors = ['#ffb35c', '#4cc27a', '#ff6b8a', '#6c8cff', '#ffd84a'];
    for (let i = 0; i < 70; i++)
      bits.push({
        x: canvas.width / 2,
        y: canvas.height * 0.45,
        vx: (Math.random() - 0.5) * 14 * devicePixelRatio,
        vy: (-Math.random() * 12 - 4) * devicePixelRatio,
        s: (4 + Math.random() * 5) * devicePixelRatio,
        c: colors[i % colors.length],
        a: Math.random() * Math.PI,
        life: 90,
      });
    if (!raf) raf = requestAnimationFrame(tick);
  };
  const tick = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    bits = bits.filter((b) => b.life-- > 0);
    for (const b of bits) {
      b.vy += 0.45 * devicePixelRatio;
      b.x += b.vx;
      b.y += b.vy;
      b.a += 0.2;
      ctx.save();
      ctx.globalAlpha = Math.min(1, b.life / 30);
      ctx.translate(b.x, b.y);
      ctx.rotate(b.a);
      ctx.fillStyle = b.c;
      ctx.fillRect(-b.s / 2, -b.s / 4, b.s, b.s / 2);
      ctx.restore();
    }
    raf = bits.length ? requestAnimationFrame(tick) : 0;
  };

  // ── Первый экран: телефон листает экраны ──
  const screens = $$('#heroScreen .hs');
  const dots = $('#heroDots');
  let hi = 0;
  let heroTimer = 0;
  screens.forEach((_, i) => {
    const b = document.createElement('button');
    b.setAttribute('aria-label', `Экран ${i + 1}`);
    b.addEventListener('click', () => showHero(i, true));
    dots.append(b);
  });
  const showHero = (i, manual) => {
    hi = (i + screens.length) % screens.length;
    screens.forEach((s, j) => s.classList.toggle('active', j === hi));
    $$('button', dots).forEach((d, j) => d.classList.toggle('on', j === hi));
    clearTimeout(heroTimer);
    if (!calm) heroTimer = setTimeout(() => showHero(hi + 1), manual ? 6000 : 3000);
  };
  showHero(0);

  // ── Было / стало ──
  const sw = $('.switch');
  const cmp = $('#cmp');
  let cmpAuto = true;
  const setCmp = (mode) => {
    cmp.dataset.mode = mode;
    sw.classList.toggle('new', mode === 'new');
    $$('button', sw).forEach((b) => b.classList.toggle('on', b.dataset.cmp === mode));
  };
  $$('button', sw).forEach((b) =>
    b.addEventListener('click', () => {
      cmpAuto = false;
      setCmp(b.dataset.cmp);
    }),
  );
  // Сам переключается один раз, когда блок показался.
  new IntersectionObserver(
    (es, o) => {
      if (!es[0].isIntersecting) return;
      o.disconnect();
      setTimeout(() => cmpAuto && setCmp('new'), 1600);
    },
    { threshold: 0.5 },
  ).observe(cmp);

  // ── Демо: вкладки ──
  const show = (name) => {
    $$('#demoTabs button').forEach((b) => b.classList.toggle('on', b.dataset.demo === name));
    $$('#demo .dm').forEach((d) => d.classList.toggle('active', d.dataset.demo === name));
    if (name === 'quiz') renderQuiz();
    if (name === 'count') newCount();
    if (name !== 'call') hangup();
  };
  $$('#demoTabs button').forEach((b) => b.addEventListener('click', () => show(b.dataset.demo)));

  // Карточки
  const CARDS = [
    { e: '🍎', en: 'apple', ru: 'яблоко', zh: '苹果', py: 'píngguǒ' },
    { e: '🐱', en: 'cat', ru: 'кошка', zh: '猫', py: 'māo' },
    { e: '☀️', en: 'sun', ru: 'солнце', zh: '太阳', py: 'tàiyáng' },
    { e: '🚗', en: 'car', ru: 'машина', zh: '汽车', py: 'qìchē' },
  ];
  const VOICE = { en: 'en-US', ru: 'ru-RU', zh: 'zh-CN' };
  let ci = 0;
  let lang = 'en';
  const flip = $('#flip');
  const renderCard = () => {
    const c = CARDS[ci];
    $('#cardEmoji').textContent = c.e;
    $('#cardWord').textContent = c[lang];
    $('#cardTr').textContent = lang === 'zh' ? `${c.py} · ${c.ru}` : lang === 'ru' ? ' ' : c.ru;
    $('#cardNo').textContent = `${ci + 1} / ${CARDS.length}`;
  };
  flip.addEventListener('click', () => {
    flip.classList.toggle('flipped');
    if (flip.classList.contains('flipped')) say(CARDS[ci][lang], VOICE[lang]);
  });
  $('#nextCard').addEventListener('click', () => {
    flip.classList.remove('flipped');
    setTimeout(() => {
      ci = (ci + 1) % CARDS.length;
      renderCard();
    }, 250);
  });
  $$('#langs button').forEach((b) =>
    b.addEventListener('click', () => {
      lang = b.dataset.lang;
      $$('#langs button').forEach((x) => x.classList.toggle('on', x === b));
      renderCard();
      if (flip.classList.contains('flipped')) say(CARDS[ci][lang], VOICE[lang]);
    }),
  );
  renderCard();

  // Вопрос после видео
  const QUIZ = [
    { q: 'Кто говорит «му-у»?', a: '🐄', o: ['🐄', '🐶', '🐸', '🐔'] },
    { q: 'Что растёт на дереве?', a: '🍐', o: ['🚲', '🍐', '🧦', '🎈'] },
    { q: 'Где живёт рыбка?', a: '🌊', o: ['🏔️', '🌵', '🌊', '🏠'] },
  ];
  let qi = 0;
  const PRAISE = ['Молодец!', 'Умница!', 'Правильно!'];
  const renderQuiz = () => {
    const item = QUIZ[qi];
    $('#qText').textContent = item.q;
    $('#qNo').textContent = `${qi + 1} / ${QUIZ.length}`;
    const msg = $('#qMsg');
    msg.className = 'q-msg';
    msg.innerHTML = '&nbsp;';
    const box = $('#qOpts');
    box.textContent = '';
    for (const o of item.o) {
      const b = document.createElement('button');
      b.textContent = o;
      b.addEventListener('click', () => {
        if (o === item.a) {
          b.classList.add('good');
          const p = PRAISE[qi % PRAISE.length];
          msg.textContent = `${p} 🎉`;
          msg.className = 'q-msg good';
          say(p, 'ru-RU');
          confetti();
          $$('button', box).forEach((x) => (x.disabled = true));
          setTimeout(() => {
            qi = (qi + 1) % QUIZ.length;
            renderQuiz();
          }, 1700);
        } else {
          b.classList.remove('bad');
          void b.offsetWidth;
          b.classList.add('bad');
          msg.textContent = 'Попробуй ещё!';
          msg.className = 'q-msg bad';
          say('Попробуй ещё', 'ru-RU');
        }
      });
      box.append(b);
    }
  };

  // Посчитай
  const ITEMS = ['🍓', '⭐', '🐞', '🎈', '🐟', '🌼'];
  let score = 0;
  const newCount = () => {
    const n = 2 + Math.floor(Math.random() * 5);
    const e = ITEMS[Math.floor(Math.random() * ITEMS.length)];
    const field = $('#cField');
    field.textContent = '';
    const spots = [];
    for (let i = 0; i < n; i++) {
      let x;
      let y;
      let tries = 0;
      do {
        x = 6 + Math.random() * 72;
        y = 6 + Math.random() * 62;
      } while (tries++ < 40 && spots.some((s) => Math.hypot(s.x - x, s.y - y) < 20));
      spots.push({ x, y });
      const s = document.createElement('span');
      s.textContent = e;
      s.style.left = `${x}%`;
      s.style.top = `${y}%`;
      s.style.animationDelay = `${i * 80}ms`;
      field.append(s);
    }
    const opts = new Set([n]);
    while (opts.size < 3) opts.add(1 + Math.floor(Math.random() * 7));
    const nums = $('#cNums');
    nums.textContent = '';
    for (const v of [...opts].sort((a, b) => a - b)) {
      const b = document.createElement('button');
      b.textContent = String(v);
      b.addEventListener('click', () => {
        if (v === n) {
          b.classList.add('good');
          score++;
          $('#cScore').textContent = `⭐ ${score}`;
          say(PRAISE[score % PRAISE.length], 'ru-RU');
          confetti();
          setTimeout(newCount, 1200);
        } else {
          b.classList.remove('bad');
          void b.offsetWidth;
          b.classList.add('bad');
        }
      });
      nums.append(b);
    }
  };

  // Звонок маме
  const call = $('#call');
  const st = $('#callSt');
  let callTimers = [];
  let secs = 0;
  const clearCall = () => {
    callTimers.forEach(clearTimeout);
    callTimers.forEach(clearInterval);
    callTimers = [];
  };
  const hangup = () => {
    clearCall();
    call.className = 'call';
    st.textContent = 'Нажми, чтобы позвонить';
  };
  $('#callBtn').addEventListener('click', () => {
    if (call.className !== 'call') return hangup();
    call.className = 'call ringing';
    st.textContent = 'Звоним маме…';
    callTimers.push(
      setTimeout(() => {
        call.className = 'call talking';
        secs = 0;
        st.textContent = 'Мама на связи · 0:00';
        callTimers.push(
          setInterval(() => {
            secs++;
            st.textContent = `Мама на связи · 0:${String(secs).padStart(2, '0')}`;
            if (secs >= 59) hangup();
          }, 1000),
        );
      }, 2600),
    );
  });

  // ── Кабинет ──
  const ring = $('#ring');
  const minR = $('#minR');
  const freeR = $('#freeR');
  const DONE = 14;
  const updDash = () => {
    const lim = Number(minR.value);
    const free = Number(freeR.value);
    $('#minV').textContent = lim;
    $('#freeV').textContent = free;
    const done = Math.min(DONE, lim);
    $('#ringMin').textContent = done;
    $('#ringOf').textContent = `из ${lim} мин`;
    ring.style.strokeDashoffset = String(314 * (1 - done / lim));
    const rest = Math.max(10, 120 - lim - free);
    const [l, f, x] = $$('#tl span');
    l.style.setProperty('--f', lim);
    f.style.setProperty('--f', free || 0.001);
    x.style.setProperty('--f', rest);
  };
  minR.addEventListener('input', updDash);
  freeR.addEventListener('input', updDash);
  const dash = $('.dash');
  new IntersectionObserver(
    (es, o) => {
      if (!es[0].isIntersecting) return;
      o.disconnect();
      dash.classList.add('in');
      updDash();
    },
    { threshold: 0.25 },
  ).observe(dash);

  // Кому показывать
  const NAMES = { a: 'Зайка', b: 'Мишутка' };
  const kids = $$('.kchip');
  const assignMsg = () => {
    const on = kids.filter((k) => k.classList.contains('on')).map((k) => NAMES[k.dataset.kid]);
    $('#assignMsg').textContent = on.length
      ? `${on.join(' и ')} ${on.length > 1 ? 'увидят' : 'увидит'} это видео завтра в уроке «Природа».`
      : 'Видео никому не показывается — дети его не увидят.';
  };
  kids.forEach((k) =>
    k.addEventListener('click', () => {
      k.classList.toggle('on');
      assignMsg();
    }),
  );

  // Уведомления: новое сверху раз в несколько секунд
  const FEED = [
    ['📷', 'Зайка сняла 2 фото', 'сейчас'],
    ['⭐', 'Выучено новое слово: «apple»', 'сейчас'],
    ['🎉', 'Мишутка закончил занятия на сегодня', 'сейчас'],
    ['👂', 'В детской стало шумно', 'сейчас'],
    ['📊', 'Отчёт за неделю готов', 'сейчас'],
  ];
  let fi = 0;
  const feed = $('#feed');
  if (!calm)
    setInterval(() => {
      if (document.hidden) return;
      const r = feed.getBoundingClientRect();
      if (r.bottom < 0 || r.top > innerHeight) return;
      const [i, t] = FEED[fi++ % FEED.length];
      $$('time', feed).forEach((tm) => {
        if (tm.textContent === 'сейчас') tm.textContent = '1 мин';
      });
      const li = document.createElement('li');
      li.className = 'new';
      li.innerHTML = '<i></i><span></span><time>сейчас</time>';
      li.querySelector('i').textContent = i;
      li.querySelector('span').textContent = t;
      feed.prepend(li);
      while (feed.children.length > 4) feed.lastElementChild.remove();
    }, 3800);
})();
