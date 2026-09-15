(() => {
  const heroStyle = document.createElement('style');
  heroStyle.textContent = `
    /* Hero follows the actual uploaded artwork ratio automatically.
       Recommended: desktop 1920x900 and mobile 1080x1350/1440. */
    .shopify-section--adula-hero-carousel .adula-hero-carousel__slide {
      aspect-ratio: auto !important;
      height: auto !important;
      min-height: 0 !important;
    }
    .shopify-section--adula-hero-carousel .adula-hero-carousel__media {
      position: relative !important;
      inset: auto !important;
      width: 100% !important;
      height: auto !important;
    }
    .shopify-section--adula-hero-carousel .adula-hero-carousel__media picture {
      display: block !important;
      width: 100% !important;
      height: auto !important;
    }
    .shopify-section--adula-hero-carousel .adula-hero-carousel__media img {
      display: block !important;
      width: 100% !important;
      height: auto !important;
      max-width: none !important;
      object-fit: contain !important;
      object-position: center !important;
    }
    @media (max-width: 699px) {
      .shopify-section--adula-hero-carousel .adula-hero-carousel__slide {
        aspect-ratio: auto !important;
        height: auto !important;
        min-height: 0 !important;
        max-height: none !important;
      }
      .shopify-section--adula-hero-carousel .adula-hero-carousel__media,
      .shopify-section--adula-hero-carousel .adula-hero-carousel__media picture,
      .shopify-section--adula-hero-carousel .adula-hero-carousel__media img {
        width: 100% !important;
        height: auto !important;
      }
    }
  `;
  document.head.appendChild(heroStyle);

  const SELECTOR = '.adula-home-video-carousel';

  const enhance = (carousel) => {
    if (!carousel || carousel.dataset.adulaFocusReady === 'true') return;
    carousel.dataset.adulaFocusReady = 'true';

    const track = carousel.querySelector('[data-home-video-track]');
    if (!track) return;

    const originalCards = [...track.querySelectorAll('.adula-home-video-card')];
    const preferredInitial = Math.floor(originalCards.length / 2);

    originalCards.forEach((card, index) => {
      const clone = card.cloneNode(true);
      const video = clone.querySelector('video');

      if (video) {
        video.defaultMuted = true;
        video.muted = true;
        video.loop = true;
        video.playsInline = true;
        video.setAttribute('muted', '');
        video.setAttribute('playsinline', '');
        video.preload = 'auto';
        video.setAttribute('preload', 'auto');

        if (index === preferredInitial) {
          video.autoplay = true;
          video.setAttribute('autoplay', '');
        } else {
          video.autoplay = false;
          video.removeAttribute('autoplay');
        }
      }

      card.replaceWith(clone);
    });

    const cards = [...track.querySelectorAll('.adula-home-video-card')];
    const videos = cards.map((card) => card.querySelector('video'));
    if (!cards.length || videos.some((video) => !video)) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const desktop = window.matchMedia('(min-width: 1000px)').matches;
    let activeIndex = preferredInitial;
    let programmaticScroll = false;
    let programmaticScrollTimer;

    const style = document.createElement('style');
    style.textContent = `
      .adula-home-video-card { cursor: pointer; transition: transform .28s ease, opacity .28s ease, box-shadow .28s ease; }
      .adula-home-video-card:not(.is-active) { opacity: .82; transform: scale(.96); }
      .adula-home-video-card.is-active { opacity: 1; transform: scale(1); box-shadow: 0 12px 30px rgba(68,44,31,.16); }
      .adula-home-video-card:not(.is-active) .adula-home-video-card__sound { opacity: 0; pointer-events: none; }
      .adula-home-video-card.is-active .adula-home-video-card__sound { opacity: 1; }
    `;
    document.head.appendChild(style);

    const prepare = (video) => {
      video.defaultMuted = true;
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.setAttribute('muted', '');
      video.setAttribute('playsinline', '');
      video.preload = 'auto';
      video.setAttribute('preload', 'auto');
    };

    const play = (video) => {
      if (!video || reduceMotion) return;
      prepare(video);
      video.autoplay = true;
      video.setAttribute('autoplay', '');
      const run = () => {
        try {
          const promise = video.play();
          if (promise && typeof promise.catch === 'function') promise.catch(() => {});
        } catch (_) {}
      };
      if (video.readyState >= 2) run();
      else {
        video.addEventListener('loadeddata', run, { once: true });
        video.addEventListener('canplay', run, { once: true });
        try { video.load(); } catch (_) {}
      }
    };

    const pause = (video) => {
      if (!video) return;
      video.pause();
      video.autoplay = false;
      video.removeAttribute('autoplay');
      video.muted = true;
    };

    videos.forEach((video, index) => {
      prepare(video);
      if (index !== activeIndex) {
        video.autoplay = false;
        video.removeAttribute('autoplay');
      }
      try { video.load(); } catch (_) {}
    });

    const setActive = (index) => {
      activeIndex = Math.max(0, Math.min(cards.length - 1, index));
      cards.forEach((card, i) => {
        const active = i === activeIndex;
        card.classList.toggle('is-active', active);
        card.setAttribute('aria-current', active ? 'true' : 'false');
        if (!active) pause(videos[i]);
      });
    };

    const center = (index) => {
      const card = cards[index];
      if (!card) return;
      clearTimeout(programmaticScrollTimer);
      programmaticScroll = true;
      const left = card.offsetLeft - (track.clientWidth - card.clientWidth) / 2;
      track.scrollTo({ left: Math.max(0, left), behavior: reduceMotion ? 'auto' : 'smooth' });
      programmaticScrollTimer = setTimeout(() => {
        programmaticScroll = false;
        play(videos[activeIndex]);
      }, reduceMotion ? 50 : 520);
    };

    const activate = (index, shouldCenter = true) => {
      setActive(index);
      play(videos[activeIndex]);
      if (shouldCenter) center(activeIndex);
    };

    cards.forEach((card, index) => {
      const video = videos[index];
      card.tabIndex = 0;
      card.setAttribute('role', 'button');
      card.addEventListener('pointerenter', () => {
        prepare(video);
        if (video.readyState < 2) { try { video.load(); } catch (_) {} }
      }, { passive: true });
      card.addEventListener('click', (event) => {
        if (event.target.closest('[data-home-video-sound]')) return;
        setActive(index);
        prepare(video);
        try {
          const promise = video.play();
          if (promise && typeof promise.catch === 'function') promise.catch(() => play(video));
        } catch (_) { play(video); }
        center(index);
      });
      card.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        activate(index, true);
      });
    });

    cards.forEach((card, index) => {
      const button = card.querySelector('[data-home-video-sound]');
      const video = videos[index];
      if (!button) return;
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (activeIndex !== index) {
          setActive(index);
          center(index);
          play(video);
        }
        video.muted = !video.muted;
        if (video.paused) { try { video.play().catch(() => {}); } catch (_) {} }
        button.setAttribute('aria-label', video.muted ? 'Ativar som' : 'Desativar som');
      });
    });

    const closestToCenter = () => {
      const rect = track.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      let winner = 0;
      let distance = Infinity;
      cards.forEach((card, index) => {
        const box = card.getBoundingClientRect();
        const delta = Math.abs((box.left + box.width / 2) - centerX);
        if (delta < distance) { distance = delta; winner = index; }
      });
      return winner;
    };

    let scrollTimer;
    track.addEventListener('scroll', () => {
      if (programmaticScroll) return;
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => {
        const index = closestToCenter();
        if (index !== activeIndex) activate(index, false);
      }, 160);
    }, { passive: true });

    const resumeActive = () => {
      if (document.visibilityState !== 'visible') return;
      const activeVideo = videos[activeIndex];
      if (activeVideo?.paused) play(activeVideo);
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) resumeActive();
        else videos.forEach(pause);
      });
    }, { threshold: .2 });
    observer.observe(carousel);

    document.addEventListener('visibilitychange', resumeActive);
    window.addEventListener('focus', resumeActive);
    window.addEventListener('pageshow', resumeActive);
    window.addEventListener('load', resumeActive, { once: true });

    setActive(activeIndex);
    play(videos[activeIndex]);

    if (desktop) {
      [0, 150, 450, 900, 1600].forEach((delay) => {
        setTimeout(() => {
          const activeVideo = videos[activeIndex];
          if (activeIndex === preferredInitial && activeVideo?.paused) play(activeVideo);
        }, delay);
      });
    }
  };

  const scan = () => document.querySelectorAll(SELECTOR).forEach(enhance);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scan, { once: true });
  else scan();
  new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true });
})();
