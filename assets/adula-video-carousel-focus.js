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
      @media (prefers-reduced-motion: reduce) {
        .adula-home-video-card { transition: none; }
      }
    `;
    document.head.appendChild(style);

    const safePlay = (video) => {
      if (!video || reduceMotion) return;
      video.muted = true;
      video.playsInline = true;

      const tryPlay = () => {
        const result = video.play();
        if (result && typeof result.catch === 'function') result.catch(() => {});
      };

      if (video.readyState >= 2) {
        tryPlay();
      } else {
        video.addEventListener('canplay', tryPlay, { once: true });
        video.addEventListener('loadeddata', tryPlay, { once: true });
      }
    };

    const activate = (index, { center = true } = {}) => {
      const safeIndex = Math.max(0, Math.min(cards.length - 1, index));

      cards.forEach((card, cardIndex) => {
        const active = cardIndex === safeIndex;
        card.classList.toggle('is-active', active);
        card.setAttribute('aria-current', active ? 'true' : 'false');

        const video = videos[cardIndex];
        if (!video) return;

        if (active) {
          safePlay(video);
        } else {
          video.pause();
          video.muted = true;
          try {
            if (video.readyState > 0) video.currentTime = 0;
          } catch (_) {}
        }
      });

      if (center) {
        const card = cards[safeIndex];
        const targetLeft = card.offsetLeft - (track.clientWidth - card.clientWidth) / 2;
        track.scrollTo({ left: Math.max(0, targetLeft), behavior: reduceMotion ? 'auto' : 'smooth' });
      }
    };

    cards.forEach((card, index) => {
      card.setAttribute('tabindex', '0');
      card.setAttribute('role', 'button');
      card.setAttribute('aria-label', `${card.querySelector('.adula-home-video-card__label')?.textContent?.trim() || 'Vídeo Adüla'} — reproduzir`);

      card.addEventListener('click', (event) => {
        if (event.target.closest('[data-home-video-sound]')) return;
        activate(index, { center: true });
        const video = videos[index];
        if (video && !reduceMotion) {
          video.muted = true;
          video.play().catch(() => {});
        }
      });

      card.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        activate(index, { center: true });
      });
    });

    carousel.querySelectorAll('[data-home-video-sound]').forEach((button, index) => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const video = videos[index];
        if (!video) return;

        if (!cards[index].classList.contains('is-active')) {
          activate(index, { center: true });
        }

        video.muted = !video.muted;
        if (video.paused && !reduceMotion) video.play().catch(() => {});
        button.setAttribute('aria-label', video.muted ? 'Ativar som' : 'Desativar som');
      }, true);
    });

    const activeFromCenter = () => {
      const trackRect = track.getBoundingClientRect();
      const centerX = trackRect.left + trackRect.width / 2;
      let bestIndex = 0;
      let bestDistance = Infinity;

      cards.forEach((card, index) => {
        const rect = card.getBoundingClientRect();
        const distance = Math.abs((rect.left + rect.width / 2) - centerX);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestIndex = index;
        }
      });

      return bestIndex;
    };

    let scrollTimer;
    track.addEventListener('scroll', () => {
      window.clearTimeout(scrollTimer);
      scrollTimer = window.setTimeout(() => activate(activeFromCenter(), { center: false }), 140);
    }, { passive: true });

    const preferredInitial = Math.floor(cards.length / 2);
    videos.forEach((video) => {
      if (!video) return;
      video.pause();
      video.muted = true;
      video.playsInline = true;
      video.removeAttribute('autoplay');
    });

    activate(preferredInitial, { center: false });
    const initialVideo = videos[preferredInitial];
    if (initialVideo) {
      window.setTimeout(() => safePlay(initialVideo), 250);
      window.setTimeout(() => safePlay(initialVideo), 900);
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
