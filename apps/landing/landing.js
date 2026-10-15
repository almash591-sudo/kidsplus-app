// KidsPlus — лендинг: звук (Web Audio, всё синтезируется на месте), озвучка совёнка, живое
// детское мини-приложение, параллакс и мелкие анимации. Без внешних библиотек.
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const store = {
    get: (k) => {
      try {
        return localStorage.getItem(k);
      } catch {
        return null;
      }
    },
    set: (k, v) => {
      try {
        localStorage.setItem(k, v);
      } catch {
        /* приватный режим — без памяти */
      }
    },
  };
  document.documentElement.classList.add('js');

  // ════════════════ Звук ════════════════
  const Sound = (() => {
    let ctx = null;
    let master, musicBus, sfxBus, verb, verbIn;
    let on = false;
    let mode = 'day';
    let timer = 0;
    let nextTime = 0;
    let step = 0;
    let ringStop = null;
    const listeners = new Set();
    const midi = (n) => 440 * 2 ** ((n - 69) / 12);

    function init() {
      if (ctx) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.9;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16;
      comp.ratio.value = 4;
      master.connect(comp).connect(ctx.destination);
      // Мягкий «зал»: импульс из затухающего шума.
      verb = ctx.createConvolver();
      const len = ctx.sampleRate * 2.4;
      const ir = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let c = 0; c < 2; c++) {
        const d = ir.getChannelData(c);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2.6;
      }
      verb.buffer = ir;
      verbIn = ctx.createGain();
      verbIn.gain.value = 0.32;
      verbIn.connect(verb).connect(master);
      musicBus = ctx.createGain();
      musicBus.gain.value = 0.2;
      musicBus.connect(master);
      musicBus.connect(verbIn);
      sfxBus = ctx.createGain();
      sfxBus.gain.value = 0.55;
      sfxBus.connect(master);
      sfxBus.connect(verbIn);
    }

    // Колокольчик музыкальной шкатулки: основной тон и тихие обертоны, быстрый удар, долгое затухание.
    function bell(freq, t, dur = 1.6, vol = 0.5, bus = musicBus) {
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      g.connect(bus);
      for (const [mul, v, type] of [
        [1, 1, 'sine'],
        [2.0, 0.28, 'sine'],
        [3.01, 0.12, 'triangle'],
        [4.2, 0.05, 'sine'],
      ]) {
        const o = ctx.createOscillator();
        const og = ctx.createGain();
        o.type = type;
        o.frequency.value = freq * mul;
        og.gain.value = v;
        o.connect(og).connect(g);
        o.start(t);
        o.stop(t + dur + 0.05);
      }
    }
    function pluck(freq, t, dur = 0.9, vol = 0.32) {
      const o = ctx.createOscillator();
      const f = ctx.createBiquadFilter();
      const g = ctx.createGain();
      o.type = 'triangle';
      o.frequency.value = freq;
      f.type = 'lowpass';
      f.frequency.setValueAtTime(1400, t);
      f.frequency.exponentialRampToValueAtTime(300, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(f).connect(g).connect(musicBus);
      o.start(t);
      o.stop(t + dur + 0.05);
    }

    // ── Музыка (своя): день — весёлая шкатулка в до мажоре, ночь — колыбельная в фа мажоре ──
    const _ = null;
    const SONGS = {
      day: {
        bpm: 104,
        // Аккорды по тактам: бас и арпеджио.
        chords: [
          [48, 60, 64, 67],
          [45, 57, 60, 64],
          [41, 57, 60, 65],
          [43, 55, 59, 62],
          [48, 60, 64, 67],
          [45, 57, 60, 64],
          [41, 57, 60, 65],
          [43, 55, 59, 67],
        ],
        // Мелодия по восьмым (8 в такте).
        melody: [
          [76, _, 79, _, 81, 79, 76, _],
          [72, _, 76, _, 74, _, 72, _],
          [69, _, 72, _, 77, 76, 74, _],
          [74, _, 76, _, 79, _, _, _],
          [76, _, 79, _, 81, 79, 84, _],
          [81, _, 79, _, 76, _, 72, _],
          [77, _, 76, _, 74, 72, 69, _],
          [71, _, 74, _, 72, _, _, _],
        ],
        arp: [0, 1, 2, 3, 2, 1, 2, 3],
      },
      night: {
        bpm: 66,
        chords: [
          [41, 65, 69, 72],
          [46, 62, 65, 70],
          [48, 64, 67, 72],
          [41, 65, 69, 72],
        ],
        melody: [
          [81, _, _, 79, 77, _],
          [74, _, _, 77, 76, _],
          [79, _, 76, _, 72, _],
          [77, _, _, _, _, _],
        ],
        arp: [0, 1, 2, 3, 2, 1],
      },
    };

    function schedule() {
      const song = SONGS[mode];
      const stepDur = 60 / song.bpm / 2;
      const per = song.arp.length;
      while (nextTime < ctx.currentTime + 0.15) {
        const bar = Math.floor(step / per) % song.chords.length;
        const i = step % per;
        const chord = song.chords[bar];
        if (i === 0)
          pluck(midi(chord[0]), nextTime, stepDur * per * 0.9, mode === 'night' ? 0.22 : 0.3);
        bell(midi(chord[song.arp[i]] + 12), nextTime, mode === 'night' ? 2.2 : 1.1, 0.07);
        const m = song.melody[bar][i];
        if (m) bell(midi(m), nextTime, mode === 'night' ? 2.8 : 1.6, mode === 'night' ? 0.2 : 0.24);
        nextTime += stepDur;
        step++;
      }
    }
    function startMusic() {
      if (!ctx || timer) return;
      nextTime = ctx.currentTime + 0.08;
      step = 0;
      timer = setInterval(schedule, 40);
    }
    function stopMusic() {
      clearInterval(timer);
      timer = 0;
    }

    const now = () => ctx.currentTime + 0.01;
    function noise(dur) {
      const b = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
      const d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const s = ctx.createBufferSource();
      s.buffer = b;
      return s;
    }
    const sfx = {
      tap() {
        const t = now();
        bell(1320, t, 0.18, 0.18, sfxBus);
      },
      pop() {
        const t = now();
        const n = noise(0.12);
        const f = ctx.createBiquadFilter();
        f.type = 'bandpass';
        f.frequency.value = 1800;
        f.Q.value = 0.8;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.9, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
        n.connect(f).connect(g).connect(sfxBus);
        n.start(t);
        const o = ctx.createOscillator();
        const og = ctx.createGain();
        o.frequency.setValueAtTime(700, t);
        o.frequency.exponentialRampToValueAtTime(110, t + 0.09);
        og.gain.setValueAtTime(0.5, t);
        og.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
        o.connect(og).connect(sfxBus);
        o.start(t);
        o.stop(t + 0.12);
      },
      whoosh() {
        const t = now();
        const n = noise(0.35);
        const f = ctx.createBiquadFilter();
        f.type = 'bandpass';
        f.Q.value = 1.4;
        f.frequency.setValueAtTime(400, t);
        f.frequency.exponentialRampToValueAtTime(2600, t + 0.3);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.35, t + 0.08);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
        n.connect(f).connect(g).connect(sfxBus);
        n.start(t);
      },
      yay() {
        const t = now();
        [72, 76, 79, 84, 88].forEach((n, i) => bell(midi(n), t + i * 0.07, 1.2, 0.3, sfxBus));
      },
      oops() {
        const t = now();
        [64, 60].forEach((n, i) => {
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.type = 'triangle';
          o.frequency.value = midi(n);
          g.gain.setValueAtTime(0.0001, t + i * 0.16);
          g.gain.exponentialRampToValueAtTime(0.3, t + i * 0.16 + 0.02);
          g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.16 + 0.22);
          o.connect(g).connect(sfxBus);
          o.start(t + i * 0.16);
          o.stop(t + i * 0.16 + 0.25);
        });
      },
      note(n) {
        bell(midi(n), now(), 1.8, 0.5, sfxBus);
      },
      ring() {
        // Звонок: два тона с дрожанием, «дзынь-дзынь» — пауза.
        let alive = true;
        const burst = () => {
          if (!alive) return;
          const t = now();
          for (let k = 0; k < 2; k++) {
            const g = ctx.createGain();
            g.gain.value = 0;
            const lfo = ctx.createOscillator();
            const lg = ctx.createGain();
            lfo.frequency.value = 18;
            lg.gain.value = 0.16;
            lfo.connect(lg).connect(g.gain);
            for (const f of [880, 1100]) {
              const o = ctx.createOscillator();
              o.frequency.value = f;
              o.connect(g);
              o.start(t + k * 0.5);
              o.stop(t + k * 0.5 + 0.38);
            }
            lfo.start(t + k * 0.5);
            lfo.stop(t + k * 0.5 + 0.38);
            g.connect(sfxBus);
          }
          setTimeout(burst, 2200);
        };
        burst();
        ringStop = () => {
          alive = false;
        };
      },
      ringOff() {
        ringStop?.();
        ringStop = null;
      },
    };

    function setOn(v) {
      on = v;
      if (v) {
        init();
        if (!ctx) return;
        ctx.resume();
        startMusic();
      } else {
        stopMusic();
        sfx.ringOff();
        try {
          speechSynthesis.cancel();
        } catch {
          /* нет синтеза речи */
        }
      }
      store.set('kp-sound', v ? '1' : '0');
      listeners.forEach((f) => f(v));
    }

    return {
      get on() {
        return on;
      },
      toggle: () => setOn(!on),
      enable: () => !on && setOn(true),
      onChange: (f) => listeners.add(f),
      play(name, arg) {
        if (on && ctx) sfx[name]?.(arg);
      },
      mode(m) {
        if (m === mode) return;
        mode = m;
        if (on && timer) {
          stopMusic();
          startMusic();
        }
      },
      duck(down) {
        if (!ctx) return;
        const t = ctx.currentTime;
        musicBus.gain.cancelScheduledValues(t);
        musicBus.gain.setTargetAtTime(down ? 0.05 : 0.2, t, 0.15);
      },
    };
  })();

  // ── Голос (синтез речи браузера) ──
  const Voice = (() => {
    let voices = [];
    const load = () => {
      try {
        voices = speechSynthesis.getVoices();
      } catch {
        voices = [];
      }
    };
    if ('speechSynthesis' in window) {
      load();
      speechSynthesis.addEventListener?.('voiceschanged', load);
    }
    const pick = (lang) => {
      const base = lang.slice(0, 2);
      const list = voices.filter((v) => v.lang.replace('_', '-').toLowerCase().startsWith(base));
      return (
        list.find((v) =>
          /milena|alyona|katya|google|siri|natural|premium|enhanced/i.test(v.name),
        ) ||
        list[0] ||
        null
      );
    };
    return {
      say(text, lang = 'ru-RU', { pitch = 1.25, rate = 0.95 } = {}) {
        if (!Sound.on || !('speechSynthesis' in window)) return;
        try {
          speechSynthesis.cancel();
          const u = new SpeechSynthesisUtterance(text);
          u.lang = lang;
          const v = pick(lang);
          if (v) u.voice = v;
          u.pitch = pitch;
          u.rate = rate;
          u.onstart = () => Sound.duck(true);
          u.onend = u.onerror = () => Sound.duck(false);
          speechSynthesis.speak(u);
        } catch {
          /* без голоса — не страшно */
        }
      },
    };
  })();

  // Кнопки звука: в шапке, на первом экране, в «Мире малыша».
  const soundBtn = $('#sound');
  const kidsBtn = $('#kidsSound');
  Sound.onChange((v) => {
    soundBtn.setAttribute('aria-pressed', String(v));
    kidsBtn.classList.toggle('on', v);
    kidsBtn.textContent = v ? '🎵 Музыка играет' : '🔊 Включить музыку';
  });
  soundBtn.addEventListener('click', () => Sound.toggle());
  kidsBtn.addEventListener('click', () => {
    Sound.toggle();
    if (Sound.on) owlSay('Ура! Теперь я умею говорить. Нажимай на всё!', true);
  });
  $('#heroPlay').addEventListener('click', () => {
    Sound.enable();
    $('#kids').scrollIntoView({ behavior: calm ? 'auto' : 'smooth' });
  });
  // Звук был включён в прошлый раз — включится от первого касания (браузеры не дают раньше).
  if (store.get('kp-sound') === '1') {
    const arm = () => {
      Sound.enable();
      removeEventListener('pointerdown', arm, true);
    };
    addEventListener('pointerdown', arm, true);
  }

  // ════════════════ Навигация ════════════════
  const nav = $('#nav');
  const darkSections = $$('.hero, .parents, .final, footer');
  const onScroll = () => {
    const y = 36;
    const dark = darkSections.some((s) => {
      const r = s.getBoundingClientRect();
      return r.top <= y && r.bottom >= y;
    });
    const scrolled = scrollY > 10;
    nav.classList.toggle('dark-bg', scrolled && dark);
    nav.classList.toggle('light', scrolled && !dark);
  };
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // ── Появление при прокрутке ──
  const io = new IntersectionObserver(
    (es) => {
      for (const e of es) {
        if (!e.isIntersecting) continue;
        e.target.classList.add('in');
        io.unobserve(e.target);
      }
    },
    { threshold: 0.12, rootMargin: '0px 0px -40px 0px' },
  );
  $$('.reveal, .shield, .envelope').forEach((el, i) => {
    if (el.classList.contains('reveal')) el.style.transitionDelay = `${(i % 3) * 90}ms`;
    io.observe(el);
  });
  const whenVisible = (el, cb, threshold = 0.3) =>
    new IntersectionObserver((es) => es.forEach((e) => cb(e.isIntersecting)), {
      threshold,
    }).observe(el);

  // ════════════════ Первый экран ════════════════
  // Звёздное небо.
  const sc = $('#stars');
  const sx = sc.getContext('2d');
  let stars = [];
  let heroOn = true;
  let shoot = null;
  const sizeStars = () => {
    const r = sc.getBoundingClientRect();
    sc.width = r.width * devicePixelRatio;
    sc.height = r.height * devicePixelRatio;
    stars = Array.from({ length: Math.round((r.width * r.height) / 5200) }, () => ({
      x: Math.random() * sc.width,
      y: Math.random() * sc.height,
      r: (Math.random() * 1.3 + 0.3) * devicePixelRatio,
      p: Math.random() * Math.PI * 2,
      s: 0.6 + Math.random() * 1.6,
    }));
  };
  const drawStars = (t) => {
    if (heroOn) {
      sx.clearRect(0, 0, sc.width, sc.height);
      for (const s of stars) {
        sx.globalAlpha = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(s.p + (t / 1000) * s.s));
        sx.fillStyle = '#fff';
        sx.beginPath();
        sx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        sx.fill();
      }
      if (!shoot && Math.random() < 0.004)
        shoot = { x: Math.random() * sc.width * 0.7, y: Math.random() * sc.height * 0.4, l: 0 };
      if (shoot) {
        shoot.l += 0.02;
        const d = shoot.l * 420 * devicePixelRatio;
        const g = sx.createLinearGradient(
          shoot.x + d - 120,
          shoot.y + d * 0.4 - 48,
          shoot.x + d,
          shoot.y + d * 0.4,
        );
        g.addColorStop(0, 'rgba(255,255,255,0)');
        g.addColorStop(1, 'rgba(255,240,210,0.9)');
        sx.globalAlpha = 1 - shoot.l;
        sx.strokeStyle = g;
        sx.lineWidth = 1.6 * devicePixelRatio;
        sx.beginPath();
        sx.moveTo(shoot.x + d - 120, shoot.y + d * 0.4 - 48);
        sx.lineTo(shoot.x + d, shoot.y + d * 0.4);
        sx.stroke();
        if (shoot.l >= 1) shoot = null;
      }
    }
    if (!calm) requestAnimationFrame(drawStars);
  };
  sizeStars();
  addEventListener('resize', sizeStars);
  requestAnimationFrame(drawStars);
  whenVisible($('.hero'), (v) => (heroOn = v), 0);

  // Параллакс: устройства и уведомления «плавают» за пальцем/мышью и при прокрутке.
  const layers = $$('[data-depth]', $('#heroStage'));
  let px = 0;
  let py = 0;
  let tx = 0;
  let ty = 0;
  if (!calm) {
    $('.hero').addEventListener('pointermove', (e) => {
      px = (e.clientX / innerWidth - 0.5) * 2;
      py = (e.clientY / innerHeight - 0.5) * 2;
    });
    const loop = () => {
      tx += (px - tx) * 0.06;
      ty += (py - ty) * 0.06;
      const s = Math.min(scrollY, 900) / 900;
      for (const l of layers) {
        const d = Number(l.dataset.depth);
        l.style.translate = `${(tx * d * 8).toFixed(1)}px ${(ty * d * 8 - s * d * 60).toFixed(1)}px`;
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  // ════════════════ Боль: карточки переворачиваются ════════════════
  $$('.pcard').forEach((c) =>
    c.addEventListener('click', () => {
      c.classList.toggle('flipped');
      Sound.play('whoosh');
    }),
  );

  // ════════════════ Как устроено: шаги загораются по кругу ════════════════
  const nodes = $$('#loop .node');
  let li = 0;
  let loopTimer = 0;
  whenVisible($('#loop'), (v) => {
    clearInterval(loopTimer);
    if (!v) return;
    const tick = () => {
      nodes.forEach((n, i) => n.classList.toggle('lit', i === li));
      li = (li + 1) % nodes.length;
    };
    tick();
    loopTimer = setInterval(tick, 1500);
  });

  // ════════════════ Мир малыша ════════════════
  const bubble = $('#owlBubble');
  const bigOwl = $('#bigOwl');
  let owlTimer = 0;
  function owlSay(text, speak = true, happy = false) {
    bubble.textContent = text;
    bubble.classList.remove('pop');
    void bubble.offsetWidth;
    bubble.classList.add('pop');
    if (happy) {
      bigOwl.classList.add('happy');
      bigOwl.classList.remove('jump');
      void bigOwl.getBoundingClientRect();
      bigOwl.classList.add('jump');
      clearTimeout(owlTimer);
      owlTimer = setTimeout(() => bigOwl.classList.remove('happy'), 1600);
    }
    if (speak) Voice.say(text.replace(/[^\p{L}\p{N}\s,.!?—-]/gu, ''), 'ru-RU', { pitch: 1.35 });
  }

  const screens = $$('#kapp .ks');
  let current = 'home';
  const HELLO = {
    home: 'Привет! Выбирай, во что поиграем. Я всё подскажу!',
    cards: 'Нажми на картинку — и она скажет слово!',
    quiz: 'Внимательно! Найди правильную картинку.',
    balloons: 'Лопай шарики! Я буду считать.',
    piano: 'Нажимай на клавиши — получится музыка!',
    call: 'Нажми зелёную кнопку — позвоним маме!',
    night: 'На сегодня всё. Спокойной ночи!',
  };
  function go(name) {
    if (!HELLO[name]) return;
    current = name;
    screens.forEach((s) => s.classList.toggle('active', s.dataset.screen === name));
    $$('#kidPicks button').forEach((b) => b.classList.toggle('on', b.dataset.go === name));
    Sound.play('tap');
    Sound.mode(name === 'night' ? 'night' : 'day');
    owlSay(HELLO[name]);
    stopBalloons();
    endCall(true);
    if (name === 'quiz') renderQuiz();
    if (name === 'balloons') startBalloons();
    if (name === 'cards') renderCard();
  }
  $$('[data-go]').forEach((b) => b.addEventListener('click', () => go(b.dataset.go)));

  // Когда «Мир малыша» на экране, а звук включён, — совёнок здоровается. Ушли — дневная музыка.
  let greeted = false;
  whenVisible(
    $('#kids'),
    (v) => {
      if (v && !greeted && Sound.on) {
        greeted = true;
        owlSay(HELLO[current]);
      }
      if (!v) Sound.mode('day');
      else if (current === 'night') Sound.mode('night');
    },
    0.35,
  );

  // Конфетти внутри телефона.
  const cv = $('#confetti');
  const cx = cv.getContext('2d');
  let bits = [];
  let raf = 0;
  function confetti() {
    if (calm) return;
    const r = cv.getBoundingClientRect();
    cv.width = r.width * devicePixelRatio;
    cv.height = r.height * devicePixelRatio;
    const colors = ['#ff6fa8', '#ffbf2e', '#4cc27a', '#4f8cff', '#a78bfa', '#ff8a5b'];
    for (let i = 0; i < 90; i++)
      bits.push({
        x: cv.width / 2,
        y: cv.height * 0.42,
        vx: (Math.random() - 0.5) * 16 * devicePixelRatio,
        vy: (-Math.random() * 13 - 4) * devicePixelRatio,
        s: (5 + Math.random() * 6) * devicePixelRatio,
        c: colors[i % colors.length],
        a: Math.random() * 6,
        life: 100,
        round: Math.random() < 0.3,
      });
    if (!raf) raf = requestAnimationFrame(tick);
  }
  function tick() {
    cx.clearRect(0, 0, cv.width, cv.height);
    bits = bits.filter((b) => b.life-- > 0);
    for (const b of bits) {
      b.vy += 0.42 * devicePixelRatio;
      b.vx *= 0.99;
      b.x += b.vx;
      b.y += b.vy;
      b.a += 0.18;
      cx.save();
      cx.globalAlpha = Math.min(1, b.life / 30);
      cx.translate(b.x, b.y);
      cx.rotate(b.a);
      cx.fillStyle = b.c;
      if (b.round) {
        cx.beginPath();
        cx.arc(0, 0, b.s / 2.4, 0, Math.PI * 2);
        cx.fill();
      } else cx.fillRect(-b.s / 2, -b.s / 4, b.s, b.s / 2);
      cx.restore();
    }
    raf = bits.length ? requestAnimationFrame(tick) : 0;
  }
  const jumpOwl = (el) => {
    el.classList.remove('jump');
    void el.getBoundingClientRect();
    el.classList.add('jump');
  };

  // ── Карточки ──
  const CARDS = [
    { e: '🍎', en: 'apple', ru: 'яблоко', zh: '苹果', py: 'píngguǒ' },
    { e: '🐱', en: 'cat', ru: 'кошка', zh: '猫', py: 'māo' },
    { e: '☀️', en: 'sun', ru: 'солнце', zh: '太阳', py: 'tàiyáng' },
    { e: '🐟', en: 'fish', ru: 'рыбка', zh: '鱼', py: 'yú' },
    { e: '🚗', en: 'car', ru: 'машина', zh: '汽车', py: 'qìchē' },
    { e: '🌸', en: 'flower', ru: 'цветок', zh: '花', py: 'huā' },
  ];
  const VOICE = { en: 'en-US', ru: 'ru-RU', zh: 'zh-CN' };
  let ci = 0;
  let lang = 'en';
  function renderCard() {
    const c = CARDS[ci];
    $('#kcEmoji').textContent = c.e;
    $('#kcWord').textContent = c[lang];
    $('#kcTr').textContent = lang === 'zh' ? `${c.py} · ${c.ru}` : lang === 'en' ? c.ru : ' ';
    $('#cardDots').textContent = `${ci + 1}/${CARDS.length}`;
  }
  const sayCard = () => {
    const card = $('#kcard');
    card.classList.remove('bump');
    void card.offsetWidth;
    card.classList.add('bump');
    Voice.say(CARDS[ci][lang], VOICE[lang], { pitch: 1.1, rate: 0.85 });
    if (!Sound.on) owlSay('Включи звук — и карточка заговорит! 🔊', false);
  };
  $('#kcard').addEventListener('click', sayCard);
  const stepCard = (d) => {
    ci = (ci + d + CARDS.length) % CARDS.length;
    Sound.play('whoosh');
    renderCard();
    setTimeout(sayCard, 250);
  };
  $('#kcNext').addEventListener('click', () => stepCard(1));
  $('#kcPrev').addEventListener('click', () => stepCard(-1));
  $$('#kLangs button').forEach((b) =>
    b.addEventListener('click', () => {
      lang = b.dataset.lang;
      $$('#kLangs button').forEach((x) => x.classList.toggle('on', x === b));
      renderCard();
      sayCard();
    }),
  );

  // ── Вопросы ──
  const QUIZ = [
    { q: 'Где лисичка?', a: '🦊', o: ['🦊', '🐻', '🐰', '🦉'] },
    { q: 'Где красное яблоко?', a: '🍎', o: ['🍌', '🍎', '🍇', '🍐'] },
    { q: 'Кто говорит «мяу»?', a: '🐱', o: ['🐶', '🐮', '🐱', '🐸'] },
    { q: 'На чём едут по дороге?', a: '🚗', o: ['⛵', '🚗', '✈️', '🚀'] },
    { q: 'Где солнышко?', a: '☀️', o: ['🌙', '⭐', '☁️', '☀️'] },
  ];
  const PRAISE = ['Молодец!', 'Умница!', 'Правильно!', 'Ура! Здорово!', 'Отлично!'];
  let qi = 0;
  let qStars = 0;
  function renderQuiz() {
    const item = QUIZ[qi % QUIZ.length];
    $('#kq').textContent = item.q;
    $('#kStars').textContent = '★'.repeat(qStars) + '☆'.repeat(Math.max(0, 3 - qStars));
    const box = $('#kqOpts');
    box.textContent = '';
    const opts = [...item.o].sort(() => Math.random() - 0.5);
    for (const o of opts) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = o;
      b.addEventListener('click', () => answer(b, o === item.a));
      box.append(b);
    }
    setTimeout(() => current === 'quiz' && Voice.say(item.q, 'ru-RU', { pitch: 1.3 }), 300);
  }
  function answer(b, ok) {
    if (ok) {
      b.classList.add('good');
      $$('#kqOpts button').forEach((x) => (x.disabled = true));
      qStars = Math.min(3, qStars + 1);
      $('#kStars').textContent = '★'.repeat(qStars) + '☆'.repeat(3 - qStars);
      Sound.play('yay');
      confetti();
      jumpOwl($('#quizOwl'));
      owlSay(PRAISE[qi % PRAISE.length] + ' 🎉', true, true);
      setTimeout(() => {
        qi++;
        if (qStars >= 3) qStars = 0;
        if (current === 'quiz') renderQuiz();
      }, 1900);
    } else {
      b.classList.remove('bad');
      void b.offsetWidth;
      b.classList.add('bad');
      Sound.play('oops');
      owlSay('Ой! Попробуй ещё разок.', true);
    }
  }

  // ── Шарики ──
  const COLORS = ['#ff6fa8', '#ffbf2e', '#4cc27a', '#4f8cff', '#a78bfa', '#ff8a5b'];
  const COUNT = [
    'Раз',
    'Два',
    'Три',
    'Четыре',
    'Пять',
    'Шесть',
    'Семь',
    'Восемь',
    'Девять',
    'Десять',
  ];
  let popped = 0;
  let spawnTimer = 0;
  const field = $('#bfield');
  function spawn() {
    if (field.children.length > 7) return;
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('aria-label', 'Шарик');
    b.style.left = `${4 + Math.random() * 72}%`;
    b.style.setProperty('--c', COLORS[Math.floor(Math.random() * COLORS.length)]);
    b.style.setProperty('--d', `${6 + Math.random() * 3.5}s`);
    b.style.setProperty('--sway', `${(Math.random() - 0.5) * 60}px`);
    b.addEventListener('animationend', (e) => {
      if (e.animationName === 'floatUp' || e.animationName === 'popB') b.remove();
    });
    b.addEventListener('pointerdown', () => {
      if (b.classList.contains('popped')) return;
      b.classList.add('popped');
      Sound.play('pop');
      popped++;
      $('#popCount').textContent = String(popped);
      if (popped >= 10) {
        Voice.say('Ура! Десять шариков!', 'ru-RU', { pitch: 1.35 });
        owlSay('Ура! Десять шариков! 🎉', false, true);
        Sound.play('yay');
        confetti();
        popped = 0;
        setTimeout(() => ($('#popCount').textContent = '0'), 1200);
      } else Voice.say(COUNT[popped - 1], 'ru-RU', { pitch: 1.35, rate: 1.05 });
    });
    field.append(b);
  }
  function startBalloons() {
    popped = 0;
    $('#popCount').textContent = '0';
    spawn();
    spawnTimer = setInterval(spawn, 750);
  }
  function stopBalloons() {
    clearInterval(spawnTimer);
    field.textContent = '';
  }

  // ── Пианино ──
  const NOTES = [60, 62, 64, 65, 67, 69];
  const NAMES = ['до', 'ре', 'ми', 'фа', 'соль', 'ля'];
  const nn = $('#noteName');
  const keys = $$('#keys button');
  function hit(i) {
    const k = keys[i];
    k.classList.add('on');
    setTimeout(() => k.classList.remove('on'), 180);
    nn.textContent = NAMES[i];
    nn.style.color = getComputedStyle(k).getPropertyValue('--c');
    nn.classList.remove('hit');
    void nn.offsetWidth;
    nn.classList.add('hit');
    Sound.play('note', NOTES[i]);
  }
  keys.forEach((k, i) => k.addEventListener('pointerdown', () => hit(i)));
  // «Братец Яков» — народная песенка.
  const SONG = [0, 1, 2, 0, 0, 1, 2, 0, 2, 3, 4, -1, 2, 3, 4, -1];
  let songTimer = 0;
  $('#kSong').addEventListener('click', () => {
    clearInterval(songTimer);
    if (!Sound.on) owlSay('Включи звук — я сыграю! 🔊', false);
    let i = 0;
    songTimer = setInterval(() => {
      if (current !== 'piano' || i >= SONG.length) return clearInterval(songTimer);
      if (SONG[i] >= 0) hit(SONG[i]);
      i++;
    }, 380);
  });

  // ── Звонок маме ──
  const callAv = $('#callAv');
  const callSt = $('#callSt');
  const callBtn = $('#callBtn');
  let callTimers = [];
  function endCall(silent) {
    callTimers.forEach((t) => clearTimeout(t) || clearInterval(t));
    callTimers = [];
    Sound.play('ringOff');
    callAv.classList.remove('ringing');
    callBtn.classList.remove('end');
    callSt.textContent = 'Нажми зелёную кнопку';
    if (!silent && current === 'call') owlSay('Позвоним ещё? Мама всегда рада!', true);
  }
  callBtn.addEventListener('click', () => {
    if (callBtn.classList.contains('end')) return endCall(false);
    callBtn.classList.add('end');
    callAv.classList.add('ringing');
    callSt.textContent = 'Звоним маме…';
    Sound.play('ring');
    callTimers.push(
      setTimeout(() => {
        Sound.play('ringOff');
        callAv.classList.remove('ringing');
        let s = 0;
        callSt.textContent = 'Мама на связи · 0:00';
        Voice.say('Привет, солнышко! Я тебя очень люблю!', 'ru-RU', { pitch: 1.05, rate: 0.95 });
        callTimers.push(
          setInterval(() => {
            s++;
            callSt.textContent = `Мама на связи · 0:${String(s).padStart(2, '0')}`;
            if (s >= 30) endCall(false);
          }, 1000),
        );
      }, 3400),
    );
  });
  renderCard();

  // ════════════════ 35 игр: бесконечная лента ════════════════
  $$('.mq-row').forEach((row) => row.append(...[...row.children].map((n) => n.cloneNode(true))));
  const num = $('.big-num');
  whenVisible(
    num,
    (v) => {
      if (!v || num.dataset.done) return;
      num.dataset.done = '1';
      const to = Number(num.dataset.count);
      const t0 = performance.now();
      const step = (t) => {
        const k = Math.min(1, (t - t0) / 1200);
        num.textContent = String(Math.round(to * (1 - (1 - k) ** 3)));
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    },
    0.6,
  );

  // ════════════════ Кабинет родителя ════════════════
  const tabs = $$('#ptabs button');
  const shots = $$('#pshot img');
  const dark = $('#darkShots');
  let ti = 0;
  let auto = true;
  let tabTimer = 0;
  const DUR = 6000;
  $('#ptabs').style.setProperty('--dur', `${DUR}ms`);
  function showTab(i) {
    ti = i;
    tabs.forEach((t, j) => t.classList.toggle('on', j === i));
    const t = tabs[i];
    const name = t.dataset.shot + (dark.checked && t.dataset.dark ? '-dark' : '');
    shots.forEach((s) => s.classList.toggle('on', s.dataset.shot === name));
  }
  const nextTab = () => auto && showTab((ti + 1) % tabs.length);
  tabs.forEach((t, i) =>
    t.addEventListener('click', () => {
      auto = false;
      clearInterval(tabTimer);
      $('#ptabs').classList.add('paused');
      showTab(i);
      Sound.play('tap');
    }),
  );
  dark.addEventListener('change', () => {
    showTab(ti);
    Sound.play('tap');
  });
  whenVisible($('#parents'), (v) => {
    clearInterval(tabTimer);
    if (v && auto && !calm) {
      showTab(ti);
      tabTimer = setInterval(nextTab, DUR);
    }
  });
})();
