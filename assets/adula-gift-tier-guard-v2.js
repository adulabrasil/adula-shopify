(() => {
  const ROOT = window.Shopify?.routes?.root || '/';
  const FIRST_THRESHOLD = 19900;
  const SECOND_THRESHOLD = 39900;
  const GIFT_PRODUCTS = {
    keychain: {
      handle: 'chaveiro-de-torre-eiffel',
      fallbackId: 47876818075811,
    },
    tray: {
      handle: 'bandeja-de-joias-em-veludo',
      fallbackId: 47977612837027,
    },
  };

  const nativeFetch = window.fetch.bind(window);
  let resolvedGifts = null;
  let enforcementPromise = null;
  let timer = null;

  const endpoint = (path) => `${ROOT}${path}`.replace(/\/{2,}/g, '/');

  const requestJson = async (url, options = {}) => {
    const response = await nativeFetch(url, options);

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`${response.status} ${body}`.trim());
    }

    return response.json();
  };

  const resolveVariant = async ({ handle, fallbackId }) => {
    try {
      const product = await requestJson(endpoint(`products/${encodeURIComponent(handle)}.js`), {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      });
      const variant = product?.variants?.find((item) => item.available) || product?.variants?.[0];
      return Number(variant?.id || fallbackId);
    } catch (error) {
      console.warn(`[Adula gifts] Using fallback variant for ${handle}.`, error);
      return Number(fallbackId);
    }
  };

  const resolveGiftVariants = async () => {
    if (resolvedGifts) return resolvedGifts;

    const [keychainId, trayId] = await Promise.all([
      resolveVariant(GIFT_PRODUCTS.keychain),
      resolveVariant(GIFT_PRODUCTS.tray),
    ]);

    const giftIds = new Set([
      keychainId,
      trayId,
      Number(GIFT_PRODUCTS.keychain.fallbackId),
      Number(GIFT_PRODUCTS.tray.fallbackId),
    ]);

    resolvedGifts = { keychainId, trayId, giftIds };
    return resolvedGifts;
  };

  const fetchCart = () =>
    requestJson(endpoint('cart.js'), {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    });

  const eligibleSubtotal = (cart, giftIds) =>
    (cart.items || []).reduce((total, item) => {
      const variantId = Number(item.variant_id || item.id);
      return giftIds.has(variantId) ? total : total + Number(item.final_line_price || 0);
    }, 0);

  const desiredGiftFor = (subtotal, gifts) => {
    if (subtotal < FIRST_THRESHOLD) return null;
    if (subtotal < SECOND_THRESHOLD) return gifts.keychainId;
    return gifts.trayId;
  };

  const dispatchRefresh = (cart) => {
    document.dispatchEvent(new CustomEvent('cart:refresh', {
      bubbles: true,
      detail: { cart, source: 'adula-gift-tier-guard-v2' },
    }));
  };

  const enforceGiftTier = () => {
    if (enforcementPromise) return enforcementPromise;

    enforcementPromise = (async () => {
      const gifts = await resolveGiftVariants();
      let cart = await fetchCart();
      const desiredGift = desiredGiftFor(eligibleSubtotal(cart, gifts.giftIds), gifts);
      const updates = {};
      let hasDesiredGift = false;

      for (const item of cart.items || []) {
        const variantId = Number(item.variant_id || item.id);
        if (!gifts.giftIds.has(variantId)) continue;

        if (variantId !== desiredGift || hasDesiredGift) {
          updates[item.key] = 0;
        } else {
          hasDesiredGift = true;
          if (Number(item.quantity) !== 1) updates[item.key] = 1;
        }
      }

      if (desiredGift !== null && !hasDesiredGift) {
        await requestJson(endpoint('cart/add.js'), {
          method: 'POST',
          credentials: 'same-origin',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ items: [{ id: desiredGift, quantity: 1 }] }),
        });
        cart = await fetchCart();
      }

      if (Object.keys(updates).length > 0) {
        cart = await requestJson(endpoint('cart/update.js'), {
          method: 'POST',
          credentials: 'same-origin',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ updates }),
        });
      }

      dispatchRefresh(cart);
      return cart;
    })()
      .catch((error) => {
        console.error('[Adula gifts v2] Gift reconciliation failed.', error);
        return null;
      })
      .finally(() => {
        enforcementPromise = null;
      });

    return enforcementPromise;
  };

  const schedule = (delay = 300) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(enforceGiftTier, delay);
  };

  window.fetch = (...args) => {
    const request = nativeFetch(...args);

    try {
      const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
      if (/\/cart\/(add|change|update)(\.js)?(?:\?|$)/.test(url)) {
        request.finally(() => schedule(250));
      }
    } catch (_) {
      // Keep the native request untouched if inspection fails.
    }

    return request;
  };

  ['cart:change', 'line-item:change', 'cart-drawer:refreshed'].forEach((eventName) => {
    document.addEventListener(eventName, () => schedule(200));
  });

  document.addEventListener('cart:refresh', (event) => {
    if (event.detail?.source !== 'adula-gift-tier-guard-v2') schedule(200);
  });

  document.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;

    if (event.target.closest(
      'button[name="add"], product-form button[type="submit"], quantity-selector button, line-item-quantity button, [data-quantity-selector] button, [aria-controls*="cart"]',
    )) {
      schedule(600);
      window.setTimeout(enforceGiftTier, 1800);
    }
  }, true);

  document.addEventListener('change', (event) => {
    if (!(event.target instanceof Element)) return;
    if (event.target.closest('quantity-selector, line-item-quantity, [name="updates[]"]')) schedule(250);
  }, true);

  const start = () => {
    schedule(600);
    window.setTimeout(enforceGiftTier, 1800);
    window.setTimeout(enforceGiftTier, 4000);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }

  window.AdulaGiftTierGuardV2 = {
    enforce: enforceGiftTier,
    resolveGifts: resolveGiftVariants,
  };
})();

(() => {
  const BLOCK_ID = 'shopify-block-progressify_multi_bar_upsells_block_zWpHh9';
  const FALLBACK_DELAY = 7000;

  const style = document.createElement('style');
  style.textContent = `
    #${BLOCK_ID}.adula-progressify-loading {
      opacity: 0 !important;
      visibility: hidden !important;
      pointer-events: none !important;
      background: transparent !important;
    }

    #${BLOCK_ID}.adula-progressify-ready {
      opacity: 1 !important;
      visibility: visible !important;
      transition: opacity 180ms ease !important;
    }
  `;
  document.head.appendChild(style);

  const hasRenderedBars = (block) => {
    if (!block) return false;

    const text = (block.innerText || block.textContent || '').replace(/\s+/g, ' ').trim();
    const semanticProgress = block.querySelector(
      '[role="progressbar"], progress, [class*="progress"], [class*="milestone"], [class*="goal"], [class*="reward"], [class*="shipping"]',
    );
    const visibleSvg = Array.from(block.querySelectorAll('svg')).some((svg) => {
      const box = svg.getBoundingClientRect();
      return box.width > 8 && box.height > 8;
    });
    const loadedIframe = Array.from(block.querySelectorAll('iframe')).some((iframe) => {
      try {
        return Boolean(iframe.src && iframe.contentDocument?.readyState === 'complete');
      } catch (_) {
        return Boolean(iframe.src);
      }
    });

    return Boolean(semanticProgress || visibleSvg || loadedIframe || text.length > 35);
  };

  const reveal = (block) => {
    block.classList.remove('adula-progressify-loading');
    block.classList.add('adula-progressify-ready');
  };

  const prepare = () => {
    const block = document.getElementById(BLOCK_ID);
    if (!block || block.dataset.adulaProgressifyGuard === '1') return;

    block.dataset.adulaProgressifyGuard = '1';
    block.classList.add('adula-progressify-loading');

    const check = () => {
      if (hasRenderedBars(block)) reveal(block);
    };

    const observer = new MutationObserver(check);
    observer.observe(block, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
    });

    block.querySelectorAll('iframe').forEach((iframe) => {
      iframe.addEventListener('load', check, { once: true });
    });

    check();
    window.setTimeout(() => reveal(block), FALLBACK_DELAY);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', prepare, { once: true });
  } else {
    prepare();
  }

  new MutationObserver(prepare).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
})();
