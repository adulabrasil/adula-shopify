const priceTemplateFor = (card, variantId) =>
  Array.from(card.querySelectorAll('template[data-product-card-price-template]')).find(
    (template) => template.dataset.productCardPriceTemplate === variantId,
  );

document.addEventListener('change', (event) => {
  const control = event.target;

  if (!(control instanceof HTMLInputElement) || control.type !== 'radio' || !control.hasAttribute('data-variant-id')) {
    return;
  }

  const card = control.closest('product-card');

  if (!card) {
    return;
  }

  const variantId = control.getAttribute('data-variant-id');
  const priceArea = card.querySelector('[data-product-card-price]');
  const priceTemplate = priceTemplateFor(card, variantId);

  if (priceArea && priceTemplate) {
    priceArea.replaceChildren(priceTemplate.content.cloneNode(true));
  }

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
