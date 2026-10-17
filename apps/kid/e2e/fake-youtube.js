// Подмена https://www.youtube.com/iframe_api в e2e-тестах.
// Плеер рисует пустой iframe (about:blank) и даёт тесту управлять временем и состоянием через window.__yt.
(() => {
  class Player {
    constructor(el, opts) {
      this.opts = opts;
      this.state = -1;
      this.time = Number(opts.playerVars?.start ?? 0);
      this.calls = [];
      this.destroyed = false;

      const iframe = document.createElement('iframe');
      iframe.src = 'about:blank';
      iframe.dataset.fakeYoutube = '1';
      el.replaceWith(iframe);
      this.iframe = iframe;

      // Считаем касания, дошедшие до «YouTube». Должно оставаться 0.
      window.__iframeHits = 0;
      const count = () => (window.__iframeHits += 1);
      const doc = iframe.contentDocument;
      if (doc) {
        doc.addEventListener('pointerdown', count);
        doc.addEventListener('click', count);
        // iPhone: видео запускается только касанием самого плеера.
        doc.addEventListener('pointerdown', () => window.__ytNeedsFrameTap && this.set(1));
      }

      window.__yt = this;
      setTimeout(() => opts.events?.onReady?.({ target: this, data: null }), 20);
    }

    playVideo() {
      this.calls.push('play');
      // Имитация Safari на iPhone: playVideo() снаружи не запускает видео вообще.
      if (window.__ytNeedsFrameTap) return;
      // Имитация запрета автовоспроизведения: первый вызов без касания игнорируется.
      if (window.__ytBlockAutoplay && !this.triedAutoplay) {
        this.triedAutoplay = true;
        return;
      }
      this.set(1);
    }
    pauseVideo() {
      this.calls.push('pause');
      this.set(2);
    }
    seekTo(s) {
      this.time = s;
    }
    getCurrentTime() {
      return this.time;
    }
    getDuration() {
      return 3600;
    }
    getPlayerState() {
      return this.state;
    }
    destroy() {
      this.destroyed = true;
      this.iframe.remove();
    }

    // Управление из теста.
    set(state) {
      this.state = state;
      this.opts.events?.onStateChange?.({ target: this, data: state });
    }
    fail(code) {
      this.opts.events?.onError?.({ target: this, data: code });
    }
  }

  window.YT = { Player };
  setTimeout(() => window.onYouTubeIframeAPIReady?.(), 0);
})();
