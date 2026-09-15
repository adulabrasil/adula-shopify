(() => {
  const SELECTOR = '.adula-home-video-carousel';

  const enhance = (carousel) => {
    if (!carousel || carousel.dataset.adulaFocusReady === 'true') return;
    carousel.dataset.adulaFocusReady = 'true';

    const track = carousel.querySelector('[data-home-video-track]');
    const cards = [...carousel.querySelectorAll('.adula-home-video-card')];
    if (!track || !cards.length) return;

    const videos = cards.map((card) => card.querySelector('video'));
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const desktop = window.matchMedia('(min-width: 1000px)').matches;
    let activeIndex = Math.floor(cards.length / 2);
    let programmaticScroll = false;
    let programmaticScrollTimer;

    const style = document.createElement('style');
    style.textContent = `
      .adula-home-video-card {
        cursor: pointer;
        transition: transform .28s ease, opacity .28s ease, box-shadow .28s ease;
      }
      .adula-home-video-card:not(.is-active) {
        opacity: .82;
        transform: scale(.96);
      }
      .adula-home-video-card.is-active {
        opacity: 1;
        transform: scale(1);
        box-shadow: 0 12px 30px rgba(68,44,31,.16);
      }
      .adula-home-video-card:not(.is-active) .adula-home-video-card__sound {
        opacity: 0;
        pointer-events: none;
      }
      .adula-home-video-card.is-active .adula-home-video-card__sound {
        opacity: 1;
      }
    `;
    document.head.appendChild(style);

    const prepareVideo = (video) => {
      if (!video) return;
      video.defaultMuted = true;
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.setAttribute('playsinline', '');
      video.setAttribute('muted', '');
      video.preload = 'auto';
      video.setAttribute('preload', 'auto');
    };

    const directPlay = (video) => {
      if (!video || reduceMotion) return;
      prepareVideo(video);
      video.autoplay = true;
      video.setAttribute('autoplay', '');
      try {
        const promise = video.play();
        if (promise && typeof promise.catch === 'function') promise.catch(() => {});
      } catch (_) {}
    };

    const ensureReadyThenPlay = (video) => {
      if (!video || reduceMotion) return;
      prepareVideo(video);

      if (video.readyState >= 2) {
        directPlay(video);
        return;
      }

      const playWhenReady = () => directPlay(video);
      video.addEventListener('loadeddata', playWhenReady, { once: true });
      video.addEventListener('canplay', playWhenReady, { once: true });
      try { video.load(); } catch (_) {}
    };

    const pauseVideo = (video) => {
      if (!video) return;
      video.pause();
      video.autoplay = false;
      video.removeAttribute('autoplay');
      video.muted = true;
    };

    // The template originally ships side videos as preload="metadata". On
    // desktop that leaves them without enough buffered data at selection time.
    // Promote every card to preload=auto as soon as the carousel mounts.
    videos.forEach((video) => {
      prepareVideo(video);
      try { video.load(); } catch (_) {}
    });

    const setActiveState = (index) => {
      activeIndex = Math.max(0, Math.min(cards.length - 1, index));
      cards.forEach((card, cardIndex) => {
        const active = cardIndex === activeIndex;
        card.classList.toggle('is-active', active);
        card.setAttribute('aria-current', active ? 'true' : 'false');
        if (!active) pauseVideo(videos[cardIndex]);
      });
    };

    const centerCard = (index) => {
      const card = cards[index];
      if (!card) return;
      clearTimeout(programmaticScrollTimer);
      programmaticScroll = true;
      const targetLeft = card.offsetLeft - (track.clientWidth - card.clientWidth) / 2;
      track.scrollTo({ left: Math.max(0, targetLeft), behavior: reduceMotion ? 'auto' : 'smooth' });
      programmaticScrollTimer = window.setTimeout(() => {
        programmaticScroll = false;
        ensureReadyThenPlay(videos[activeIndex]);
      }, reduceMotion ? 50 : 550);
    };

    const activate = (index, center = true) => {
      setActiveState(index);
      ensureReadyThenPlay(videos[activeIndex]);
      if (center) centerCard(activeIndex);
    };

    cards.forEach((card, index) => {
      const video = videos[index];
      card.setAttribute('tabindex', '0');
      card.setAttribute('role', 'button');

      // Desktop users hover before clicking. Start buffering here so the
      // selected video is already decodable when the click arrives.
      card.addEventListener('pointerenter', () => {
        if (!video) return;
        prepareVideo(video);
        if (video.readyState < 2) {
          try { video.load(); } catch (_) {}
        }
      }, { passive: true });

      card.addEventListener('pointerdown', (event) => {
        if (event.target.closest('[data-home-video-sound]')) return;
        if (!video) return;
        setActiveState(index);
        prepareVideo(video);
        ensureReadyThenPlay(video);
      }, { capture: true });

      card.addEventListener('click', (event) => {
        if (event.target.closest('[data-home-video-sound]')) return;
        if (!video) return;
        ensureReadyThenPlay(video);
        centerCard(index);
        [100, 350, 800].forEach((delay) => {
          window.setTimeout(() => {
            if (activeIndex === index && video.paused) ensureReadyThenPlay(video);
          }, delay);
        });
      });

      card.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        activate(index, true);
      });
    });

    carousel.querySelectorAll('[data-home-video-sound]').forEach((button, index) => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();

        if (activeIndex !== index) {
          setActiveState(index);
          centerCard(index);
        }

        const video = videos[index];
        if (!video) return;
        video.muted = !video.muted;
        if (video.paused) ensureReadyThenPlay(video);
        button.setAttribute('aria-label', video.muted ? 'Ativar som' : 'Desativar som');
      }, true);
    });

    const getClosestToCenter = () => {
      const rect = track.getBoundingClientRect();
      const center = rect.left + rect.width / 2;
      let winner = 0;
      let bestDistance = Infinity;

      cards.forEach((card, index) => {
        const box = card.getBoundingClientRect();
        const distance = Math.abs((box.left + box.width / 2) - center);
        if (distance < bestDistance) {
          bestDistance = distance;
          winner = index;
        }
      });
      return winner;
    };

    let scrollTimer;
    track.addEventListener('scroll', () => {
      if (programmaticScroll) return;
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => {
        const index = getClosestToCenter();
        if (index !== activeIndex) activate(index, false);
      }, 160);
    }, { passive: true });

    const resumeActive = () => {
      if (document.visibilityState !== 'visible') return;
      const video = videos[activeIndex];
      if (video?.paused) ensureReadyThenPlay(video);
    };

    const visibility = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) resumeActive();
        else videos.forEach(pauseVideo);
      });
    }, { threshold: 0.2 });
    visibility.observe(carousel);

    document.addEventListener('visibilitychange', resumeActive);
    window.addEventListener('focus', resumeActive);
    window.addEventListener('pageshow', resumeActive);
    window.addEventListener('load', resumeActive, { once: true });

    activate(activeIndex, false);

    if (desktop) {
      const centralVideo = videos[activeIndex];
      if (centralVideo) {
        [0, 250, 700, 1500].forEach((delay) => {
          window.setTimeout(() => {
            if (activeIndex === Math.floor(cards.length / 2) && centralVideo.paused) ensureReadyThenPlay(centralVideo);
          }, delay);
        });
      }
    }
  };

  const scan = () => document.querySelectorAll(SELECTOR).forEach(enhance);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scan, { once: true });
  } else {
    scan();
  }

  new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true });
})();
