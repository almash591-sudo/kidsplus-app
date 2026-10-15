// Инструкция: переключатель iPhone / Android (запоминается) и появление шагов.
(() => {
  'use strict';
  document.documentElement.classList.add('js');
  const btns = [...document.querySelectorAll('.g-os button')];
  const set = (os) => {
    document.body.dataset.os = os;
    btns.forEach((b) => b.classList.toggle('on', b.dataset.os === os));
    try {
      localStorage.setItem('kp-os', os);
    } catch {
      /* без памяти */
    }
  };
  let saved = null;
  try {
    saved = localStorage.getItem('kp-os');
  } catch {
    /* без памяти */
  }
  set(saved || (/android/i.test(navigator.userAgent) ? 'android' : 'ios'));
  btns.forEach((b) => b.addEventListener('click', () => set(b.dataset.os)));

  const io = new IntersectionObserver(
    (es) =>
      es.forEach((e) => {
        if (!e.isIntersecting) return;
        e.target.classList.add('in');
        io.unobserve(e.target);
      }),
    { threshold: 0.1 },
  );
  document.querySelectorAll('.reveal').forEach((el) => io.observe(el));
})();
