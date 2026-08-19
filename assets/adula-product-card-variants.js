const priceTemplateFor = (card, variantId) =>
  Array.from(card.querySelectorAll('template[data-product-card-price-template]')).find(
    (template) => template.dataset.productCardPriceTemplate === variantId,
  );

const variantRequests = new Map();
const moneyFormatter = new Intl.NumberFormat(document.documentElement.lang || 'pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

const formatMoney = (cents) => moneyFormatter.format(Number(cents || 0) / 100);

const loadVariant = (variantId) => {
  if (!variantRequests.has(variantId)) {
    const request = fetch(`${window.location.origin}/variants/${variantId}.js`, {
      headers: { Accept: 'application/json' },
    }).then((response) => {
      if (!response.ok) {
        throw new Error(`Não foi possível carregar a variante ${variantId}.`);
      }

      return response.json();
    });

    variantRequests.set(variantId, request);
  }

  return variantRequests.get(variantId);
};

const replacePriceText = (element, label, price) => {
  if (!element) {
    return;
  }

  element.replaceChildren();

  const accessibleLabel = document.createElement('span');
  accessibleLabel.className = 'sr-only';
  accessibleLabel.textContent = label;
  element.append(accessibleLabel, document.createTextNode(formatMoney(price)));
};

const updateRenderedPrice = (card, variant) => {
  const priceList = card.querySelector('price-list');
  const salePrice = priceList?.querySelector('sale-price');

  if (!priceList || !salePrice) {
    return;
  }

  const onSale = Number(variant.compare_at_price || 0) > Number(variant.price || 0);
  const headingClass = Array.from(salePrice.classList).find((className) => /^h[1-6]$/.test(className));
  salePrice.className = [headingClass, onSale ? 'text-on-sale' : 'text-subdued'].filter(Boolean).join(' ');
  replacePriceText(salePrice, onSale ? 'Preço promocional' : 'Preço', variant.price);

  let compareAtPrice = priceList.querySelector('compare-at-price');

  if (onSale) {
    if (!compareAtPrice) {
      compareAtPrice = document.createElement('compare-at-price');
      priceList.append(compareAtPrice);
    }

    compareAtPrice.className = [headingClass, 'text-subdued', 'line-through'].filter(Boolean).join(' ');
    replacePriceText(compareAtPrice, 'Preço normal', variant.compare_at_price);
  } else {
    compareAtPrice?.remove();
  }

  const conditions = card.querySelector('.adula-payment-conditions');
  const installmentPrice = conditions?.querySelector('.adula-payment-conditions__installment strong');
  const pixPrice = conditions?.querySelector('.adula-payment-conditions__pix strong');

  if (installmentPrice) {
    installmentPrice.textContent = `4x de ${formatMoney(Number(variant.price || 0) / 4)}`;
  }

  if (pixPrice) {
    pixPrice.textContent = formatMoney(Number(variant.price || 0) * 0.97);
  }
};

const updateCardPrice = async (card, control) => {
  const variantId = control.getAttribute('data-variant-id');
  const priceArea = card.querySelector('[data-product-card-price]');
  const priceTemplate = priceTemplateFor(card, variantId);

  if (priceArea && priceTemplate) {
    priceArea.replaceChildren(priceTemplate.content.cloneNode(true));
    return;
  }

  // Some Shopify theme synchronizations can keep an older cached card snippet.
  // In that case, use the public variant endpoint and update the rendered price
  // directly. The selected ID check prevents a slower request from overwriting
  // a more recent click.
  card.dataset.selectedPriceVariant = variantId;

  try {
    const variant = await loadVariant(variantId);

    if (card.dataset.selectedPriceVariant === variantId) {
      updateRenderedPrice(card, variant);
    }
  } catch (error) {
    console.error(error);
  }
};

document.addEventListener('change', (event) => {
  const control = event.target;

  if (!(control instanceof HTMLInputElement) || control.type !== 'radio' || !control.hasAttribute('data-variant-id')) {
    return;
  }

  const card = control.closest('product-card');

  if (!card) {
    return;
  }

  updateCardPrice(card, control);

  // Prestige swaps the primary and secondary images in its own change handler.
  // Wait one frame so we can hide a stale hover image when this finish has no
  // corresponding model photo, or reveal the newly swapped image when it has.
  requestAnimationFrame(() => {
    const secondaryImage = card.querySelector('.product-card__image--secondary');

    if (!secondaryImage) {
      return;
    }

    secondaryImage.toggleAttribute('hidden', !control.hasAttribute('data-variant-secondary-media'));
  });
});
