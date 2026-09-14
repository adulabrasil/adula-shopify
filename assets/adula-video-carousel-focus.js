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
    let activeIndex = Math.floor(cards.length / 2);

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
    };

    videos.forEach((video) => {
      prepareVideo(video);
      try { video.load(); } catch (_) {}
    });

    const playVideo = (video) => {
      if (!video || reduceMotion) return;
      prepareVideo(video);
      video.autoplay = true;

      const attempt = () => {
        const promise = video.play();
        if (promise && typeof promise.catch === 'function') {
          promise.catch(() => {
            window.setTimeout(() => video.play().catch(() => {}), 180);
          });
        }
      };

      if (video.readyState >= 2) {
        attempt();
      } else {
        video.addEventListener('canplay', attempt, { once: true });
        video.addEventListener('loadeddata', attempt, { once: true });
        try { video.load(); } catch (_) {}
      }
    };

    const pauseVideo = (video) => {
      if (!video) return;
      video.autoplay = false;
      video.pause();
      video.muted = true;
    };

    const activate = (index, center = true) => {
      activeIndex = Math.max(0, Math.min(cards.length - 1, index));

      cards.forEach((card, cardIndex) => {
        const isActive = cardIndex === activeIndex;
        card.classList.toggle('is-active', isActive);
        card.setAttribute('aria-current', isActive ? 'true' : 'false');
        if (isActive) playVideo(videos[cardIndex]);
        else pauseVideo(videos[cardIndex]);
      });

      if (center) {
        const card = cards[activeIndex];
        const targetLeft = card.offsetLeft - (track.clientWidth - card.clientWidth) / 2;
        track.scrollTo({ left: Math.max(0, targetLeft), behavior: reduceMotion ? 'auto' : 'smooth' });
      }
    };

    cards.forEach((card, index) => {
      card.setAttribute('tabindex', '0');
      card.setAttribute('role', 'button');

      card.addEventListener('click', (event) => {
        if (event.target.closest('[data-home-video-sound]')) return;
        activate(index, true);
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

        if (activeIndex !== index) activate(index, true);
        const video = videos[index];
        if (!video) return;

        video.muted = !video.muted;
        if (video.paused) video.play().catch(() => {});
        button.setAttribute('aria-label', video.muted ? 'Ativar som' : 'Desativar som');
      }, true);
    });

    const getClosestToCenter = () => {
      const rect = track.getBoundingClientRect();
      const center = rect.left + rect.width / 2;
      let winner = 0;
      let distance = Infinity;

      cards.forEach((card, index) => {
        const box = card.getBoundingClientRect();
        const delta = Math.abs((box.left + box.width / 2) - center);
        if (delta < distance) {
          distance = delta;
          winner = index;
        }
      });
      return winner;
    };

    let scrollTimer;
    track.addEventListener('scroll', () => {
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => {
        const index = getClosestToCenter();
        if (index !== activeIndex) activate(index, false);
      }, 160);
    }, { passive: true });

    const visibility = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) playVideo(videos[activeIndex]);
        else videos.forEach(pauseVideo);
      });
    }, { threshold: 0.2 });
    visibility.observe(carousel);

    activate(activeIndex, false);
    requestAnimationFrame(() => playVideo(videos[activeIndex]));
    setTimeout(() => playVideo(videos[activeIndex]), 500);
    setTimeout(() => playVideo(videos[activeIndex]), 1500);
  };

  const scan = () => document.querySelectorAll(SELECTOR).forEach(enhance);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scan, { once: true });
  } else {
    scan();
  }

  new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true });
})();
