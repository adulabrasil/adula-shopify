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
  const money = (cents) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  let painting = false;

  const style = document.createElement('style');
  style.textContent = `
    #cart-drawer .adula-benefits-native { padding: .85rem 0 .1rem; }
    #cart-drawer .adula-benefits-native__row { margin: 0 0 .85rem; }
    #cart-drawer .adula-benefits-native__message { font-size: 12px; line-height: 1.35; margin: 0 0 .38rem; }
    #cart-drawer .adula-benefits-native__track { height: 5px; border-radius: 999px; overflow: hidden; background: rgb(var(--text-color) / .12); }
    #cart-drawer .adula-benefits-native__fill { display: block; height: 100%; border-radius: inherit; background: #b08d57; transition: width .25s ease; }
    #cart-drawer .adula-benefits-native__label { display: flex; justify-content: space-between; gap: 10px; margin-top: .3rem; font-size: 10px; opacity: .68; }
  `;
  document.head.appendChild(style);

  const row = (message, subtotal, threshold, label) => {
    const progress = Math.max(0, Math.min(100, (subtotal / threshold) * 100));
    return `<div class="adula-benefits-native__row"><p class="adula-benefits-native__message">${message}</p><div class="adula-benefits-native__track"><span class="adula-benefits-native__fill" style="width:${progress}%"></span></div><div class="adula-benefits-native__label"><span>${label}</span><span>${progress >= 100 ? 'Conquistado ✓' : `${Math.round(progress)}%`}</span></div></div>`;
  };

  const paint = async () => {
    if (painting) return;
    const shipping = document.querySelector('#cart-drawer .adula-free-shipping');
    if (!shipping) return;

    painting = true;
    try {
      const gifts = await window.AdulaGiftTierGuardV2?.resolveGifts?.();
      if (!gifts) return;
      const response = await fetch(`${window.Shopify?.routes?.root || '/'}cart.js`, { headers: { Accept: 'application/json' } });
      const cart = await response.json();
      const subtotal = (cart.items || []).reduce((total, item) => gifts.giftIds.has(Number(item.variant_id || item.id)) ? total : total + Number(item.final_line_price || 0), 0);
      const keychainMessage = subtotal >= 19900 ? 'Chaveiro Torre Eiffel conquistado ✓' : `Faltam ${money(19900 - subtotal)} para ganhar o Chaveiro Torre Eiffel`;
      const trayMessage = subtotal >= 39900 ? 'Bandeja de Joias em Veludo conquistada ✓' : `Faltam ${money(39900 - subtotal)} para ganhar a Bandeja de Joias em Veludo`;
      let box = shipping.querySelector('.adula-benefits-native');
      if (!box) {
        box = document.createElement('div');
        box.className = 'adula-benefits-native';
        shipping.appendChild(box);
      }
      box.innerHTML = row(keychainMessage, subtotal, 19900, 'Brinde · R$ 199') + row(trayMessage, subtotal, 39900, 'Brinde · R$ 399');
    } catch (error) {
      console.warn('[Adula benefits] Could not refresh native bars.', error);
    } finally {
      painting = false;
    }
  };

  ['cart:refresh', 'cart:change', 'line-item:change', 'cart-drawer:refreshed'].forEach((eventName) => document.addEventListener(eventName, () => window.setTimeout(paint, 100)));
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', paint, { once: true }); else paint();
  new MutationObserver(() => { if (document.querySelector('#cart-drawer .adula-free-shipping:not(:has(.adula-benefits-native))')) paint(); }).observe(document.documentElement, { childList: true, subtree: true });
})();
