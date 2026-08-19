const priceTemplateFor = (card, variantId) =>
  Array.from(card.querySelectorAll('template[data-product-card-price-template]')).find(
    (template) => template.dataset.productCardPriceTemplate === variantId,
  );

const variantRequests = new Map();
const productRequests = new Map();
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

const loadProduct = (handle) => {
  if (!productRequests.has(handle)) {
    const request = fetch(`${window.location.origin}/products/${encodeURIComponent(handle)}.js`, {
      headers: { Accept: 'application/json' },
    }).then((response) => {
      if (!response.ok) {
        throw new Error(`Não foi possível carregar o produto ${handle}.`);
      }

      return response.json();
    });

    productRequests.set(handle, request);
  }

  return productRequests.get(handle);
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

const updateCardPrice = (card, control, variant) => {
  const variantId = control.getAttribute('data-variant-id');
  const priceArea = card.querySelector('[data-product-card-price]');
  const priceTemplate = priceTemplateFor(card, variantId);

  if (priceArea && priceTemplate) {
    priceArea.replaceChildren(priceTemplate.content.cloneNode(true));
    return;
  }

  updateRenderedPrice(card, variant);
};

const imageSource = (media) => media?.preview_image?.src || media?.src || null;

const sourceWithWidth = (source, width) => {
  const separator = source.includes('?') ? '&' : '?';
  return `${source}${separator}width=${width}`;
};

const updateImage = (image, media) => {
  const source = imageSource(media);

  if (!image || !source) {
    return;
  }

  const widths = [200, 300, 400, 500, 600, 700, 800, 1000, 1200]
    .filter((width) => !media.width || width <= media.width);
  image.src = sourceWithWidth(source, media.width || 1000);
  image.srcset = widths.map((width) => `${sourceWithWidth(source, width)} ${width}w`).join(', ');

  if (media.width) image.width = media.width;
  if (media.height) image.height = media.height;
  if (media.alt) image.alt = media.alt;
};

const sameMedia = (media, featuredImage) => {
  if (!media || !featuredImage) return false;
  if (String(media.id) === String(featuredImage.id)) return true;

  const mediaSrc = imageSource(media)?.split('?')[0];
  const featuredSrc = (featuredImage.src || '')?.split('?')[0];
  return Boolean(mediaSrc && featuredSrc && mediaSrc === featuredSrc);
};

const updateCardMedia = async (card, control, variant) => {
  const variantId = control.getAttribute('data-variant-id');
  const featuredImage = variant.featured_image;

  if (!featuredImage) {
    return;
  }

  card.dataset.selectedMediaVariant = variantId;
  const handle = card.getAttribute('handle');
  const product = handle ? await loadProduct(handle) : null;

  if (card.dataset.selectedMediaVariant !== variantId) {
    return;
  }

  const mediaList = Array.isArray(product?.media) ? product.media : [];
  const primaryIndex = mediaList.findIndex((media) => sameMedia(media, featuredImage));
  const primaryMedia = primaryIndex >= 0 ? mediaList[primaryIndex] : featuredImage;
  const secondaryMedia = primaryIndex >= 0 ? mediaList[primaryIndex + 1] : null;
  const primaryImage = card.querySelector('.product-card__image--primary');
  const secondaryImage = card.querySelector('.product-card__image--secondary');

  updateImage(primaryImage, primaryMedia);

  if (secondaryImage && secondaryMedia?.media_type === 'image') {
    updateImage(secondaryImage, secondaryMedia);
    secondaryImage.removeAttribute('hidden');
  } else {
    secondaryImage?.setAttribute('hidden', '');
  }
};

const updateQuickBuySelection = (card, control, variant) => {
  const variantId = control.getAttribute('data-variant-id');
  const available = variant.available !== false && control.dataset.variantAvailable !== 'false';
  const directVariantInput = card.querySelector('product-form input[name="id"]');
  const quickBuyModal = card.querySelector('quick-buy-modal');
  const quickBuyButton = card.querySelector('[data-adula-quick-buy]');
  const quickBuyLabel = quickBuyButton?.querySelector('[data-adula-quick-buy-label]');

  if (directVariantInput) {
    directVariantInput.value = variantId;
  }

  if (quickBuyModal) {
    quickBuyModal.setAttribute('handle', `${card.getAttribute('handle')}?variant=${variantId}`);
  }

  if (quickBuyButton) {
    quickBuyButton.disabled = !available;
    quickBuyButton.setAttribute('aria-disabled', String(!available));
  }

  if (quickBuyLabel) {
    quickBuyLabel.textContent = available ? 'Adicionar ao carrinho' : 'Esgotado';
  }
};

const synchronizeCard = async (card, control) => {
  const variantId = control.getAttribute('data-variant-id');

  if (!variantId) {
    return;
  }

  card.dataset.selectedVariant = variantId;

  try {
    const variant = await loadVariant(variantId);

    if (card.dataset.selectedVariant !== variantId) {
      return;
    }

    updateQuickBuySelection(card, control, variant);
    updateCardPrice(card, control, variant);
    await updateCardMedia(card, control, variant);
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

  if (card) {
    synchronizeCard(card, control);
  }
});

const synchronizeVisibleCard = (card) => {
  const selectedControl = card.querySelector('input[type="radio"][data-variant-id]:checked');

  if (selectedControl) {
    synchronizeCard(card, selectedControl);
  }
};

if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      observer.unobserve(entry.target);
      synchronizeVisibleCard(entry.target);
    }
  }, { rootMargin: '300px' });

  document.querySelectorAll('product-card').forEach((card) => observer.observe(card));
} else {
  document.querySelectorAll('product-card').forEach(synchronizeVisibleCard);
}
