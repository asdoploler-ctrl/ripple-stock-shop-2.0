import { supabaseClient } from './supabase-client.js';

let activeProduct = null;

// ===== Открывает окно заявки и подставляет название товара =====
function openRequestModal() {
  const modal = document.querySelector('[data-request-modal]');
  const productLabel = document.querySelector('[data-request-product]');
  const firstInput = modal && modal.querySelector('input[name="client_name"]');
  if (!modal || !activeProduct) return;

  productLabel.textContent = activeProduct.name + (activeProduct.size ? ' / ' + activeProduct.size : '');
  const quantityInput = modal.querySelector('input[name="quantity"]');
  const stockLabel = modal.querySelector('[data-request-stock]');
  if (quantityInput) {
    quantityInput.max = String(activeProduct.quantity);
    quantityInput.value = '1';
  }
  if (stockLabel) stockLabel.textContent = 'В наличии: ' + activeProduct.quantity + ' шт.';
  modal.hidden = false;
  document.body.classList.add('request-modal-open');
  if (firstInput) firstInput.focus();
}

// ===== Закрывает окно заявки и возвращает прокрутку страницы =====
function closeRequestModal() {
  const modal = document.querySelector('[data-request-modal]');
  if (!modal) return;
  modal.hidden = true;
  document.body.classList.remove('request-modal-open');
}

// ===== Подключает открытие окна, закрытие и отправку заявки в Supabase =====
function initProductRequest() {
  const modal = document.querySelector('[data-request-modal]');
  const openButton = document.querySelector('[data-open-request]');
  const form = document.querySelector('[data-request-form]');
  if (!modal || !openButton || !form) return;

  openButton.addEventListener('click', openRequestModal);
  modal.querySelectorAll('[data-close-request]').forEach(function (button) {
    button.addEventListener('click', closeRequestModal);
  });
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && !modal.hidden) closeRequestModal();
  });

  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    const message = form.querySelector('[data-request-message]');
    const submitButton = form.querySelector('[type="submit"]');
    const formData = new FormData(form);
    if (!activeProduct || !supabaseClient) {
      message.textContent = 'Не удалось подключиться. Попробуй ещё раз позже.';
      message.classList.remove('is-success');
      return;
    }

    const requestedQuantity = Number(formData.get('quantity'));
    if (!Number.isInteger(requestedQuantity) || requestedQuantity < 1) {
      message.textContent = 'Укажи количество от 1 штуки.';
      message.classList.remove('is-success');
      return;
    }

    // Перед отправкой заявки перечитывает остаток, чтобы проверить его актуальность.
    let currentProduct;
    let stockError;
    try {
      const stockResult = await supabaseClient
        .from('products')
        .select('quantity')
        .eq('id', activeProduct.id)
        .eq('is_published', true)
        .maybeSingle();
      currentProduct = stockResult.data;
      stockError = stockResult.error;
    } catch (error) {
      stockError = error;
    }
    if (stockError || !currentProduct) {
      message.textContent = 'Не удалось проверить остаток. Обнови страницу и попробуй ещё раз.';
      message.classList.remove('is-success');
      return;
    }
    if (requestedQuantity > Number(currentProduct.quantity)) {
      message.textContent = 'Сейчас в наличии только ' + currentProduct.quantity + ' шт. Измени количество.';
      message.classList.remove('is-success');
      return;
    }

    const lead = {
      product_id: activeProduct.id,
      quantity: requestedQuantity,
      client_name: String(formData.get('client_name') || '').trim() || null,
      contact_type: String(formData.get('contact_type') || 'other'),
      contact_value: String(formData.get('contact_value') || '').trim(),
      comment: [
        activeProduct.size ? 'Размер: ' + activeProduct.size : '',
        String(formData.get('comment') || '').trim()
      ].filter(Boolean).join('\n') || null,
      status: 'new'
    };
    if (!lead.contact_value) {
      message.textContent = 'Укажи контакт, чтобы мы могли тебе ответить.';
      message.classList.remove('is-success');
      return;
    }

    submitButton.disabled = true;
    message.textContent = '';
    message.classList.remove('is-success');
    try {
      const { error } = await supabaseClient.from('leads').insert(lead);
      if (error) throw error;
      form.reset();
      message.textContent = 'Заявка отправлена! Скоро свяжемся с тобой.';
      message.classList.add('is-success');
    } catch (error) {
      if (error.code === '42703' && error.message && error.message.includes('quantity')) {
        message.textContent = 'В базе ещё не включено хранение количества в заявках. Выполни migration-lead-quantity.sql в Supabase SQL Editor.';
      } else {
        message.textContent = 'Не удалось отправить заявку. ' + (error.message || 'Попробуй ещё раз.');
      }
      message.classList.remove('is-success');
    } finally {
      submitButton.disabled = false;
    }
  });
}

// ===== Загружает выбранный опубликованный товар по его ID =====
async function loadDatabaseProduct() {
  const productPage = document.querySelector('.product-page');
  const productId = new URLSearchParams(window.location.search).get('id');
  if (!productPage || !productId) return;
  if (!/^[0-9]+$/.test(productId)) {
    showProductError(productPage, 'Некорректный номер товара.');
    return;
  }

  const detail = productPage.querySelector('.product-detail');
  if (detail) detail.hidden = true;
  const crumbs = productPage.querySelector('.product-crumbs');
  if (crumbs) crumbs.hidden = true;
  showProductMessage(productPage, 'Загружаем товар…');

  if (!supabaseClient) {
    showProductError(productPage, 'Не удалось подключиться к Supabase. Проверь настройки проекта.');
    return;
  }

  try {
    const { data, error } = await supabaseClient
      .from('products')
      .select('id, name, size, quantity, description, price, product_groups(name), product_images(url, sort_order)')
      .eq('id', productId)
      .eq('is_published', true)
      .gt('quantity', 0)
      .order('sort_order', { referencedTable: 'product_images', ascending: true })
      .maybeSingle();

    if (error) {
      showProductError(productPage, 'Не удалось загрузить товар. ' + error.message);
      return;
    }
    if (!data) {
      showProductError(productPage, 'Этот товар сейчас отсутствует в наличии или снят с публикации.');
      return;
    }

    showDatabaseProduct(productPage, data);
  } catch (error) {
    showProductError(productPage, 'Нет соединения с Supabase. Проверь интернет и попробуй ещё раз.');
  }
}

// ===== Показывает сообщение, если товар не получилось загрузить =====
function showProductError(productPage, text) {
  showProductMessage(productPage, text);
  const detail = productPage.querySelector('.product-detail');
  if (detail) detail.hidden = true;
}

// ===== Показывает загрузку или ошибку вместо устаревших данных в разметке =====
function showProductMessage(productPage, text) {
  let message = productPage.querySelector('.product-db-message');
  if (!message) {
    message = document.createElement('p');
    message.className = 'product-db-message container';
    message.setAttribute('role', 'status');
    productPage.prepend(message);
  }
  message.textContent = text;
}

// ===== Заполняет страницу товара данными из строки products =====
function showDatabaseProduct(productPage, product) {
  activeProduct = product;
  const groupName = product.product_groups ? product.product_groups.name : 'КАТАЛОГ';
  const images = (product.product_images || []).slice().sort(function (first, second) {
    return first.sort_order - second.sort_order;
  });
  const mainImage = productPage.querySelector('.product-gallery__image');
  const thumbnails = productPage.querySelector('.product-gallery__thumbs');
  const count = productPage.querySelector('.product-gallery__count');
  const badge = productPage.querySelector('.product-gallery__main .card__badge');
  const description = productPage.querySelector('.product-info__description');
  const sizes = productPage.querySelector('.product-sizes');
  const benefits = productPage.querySelector('.product-benefits');

  productPage.querySelector('.product-crumbs__category').textContent = groupName.toUpperCase();
  productPage.querySelector('.product-crumbs__current').textContent = product.name;
  productPage.querySelector('.product-info__label').textContent = 'STREETWEAR / ' + groupName.toUpperCase();
  productPage.querySelector('.product-info__title').textContent = product.name;
  productPage.querySelector('.product-info__variant').textContent = product.size ? 'Размер ' + product.size : groupName;
  productPage.querySelector('.product-info__price').textContent = Number(product.price).toLocaleString('ru-RU') + ' MDL';
  const requestButton = productPage.querySelector('[data-open-request]');
  if (requestButton) requestButton.disabled = false;
  document.title = product.name + ' — Ripple Stock';

  if (description) {
    description.textContent = product.description || '';
    description.hidden = !product.description;
  }

  if (sizes) {
    const sizeList = sizes.querySelector('.product-sizes__list');
    if (sizeList) {
      sizeList.replaceChildren();
      if (product.size) {
        const sizeValue = document.createElement('span');
        sizeValue.className = 'product-sizes__button is-selected';
        const normalizedSize = product.size.trim().toLowerCase();
        if (normalizedSize === 'one size' || normalizedSize === 'onesize') {
          sizeValue.classList.add('product-sizes__button--one-size');
          sizeValue.textContent = 'ONE SIZE';
        } else {
          sizeValue.textContent = product.size.toUpperCase();
        }
        sizeList.appendChild(sizeValue);
        sizes.hidden = false;
      } else {
        sizes.hidden = true;
      }
    }
  }

  if (benefits) {
    const benefitTexts = benefits.querySelectorAll('.product-benefit p');
    const values = [
      ['РАЗМЕР', product.size || 'НЕ УКАЗАН'],
      ['ГРУППА', groupName.toUpperCase()],
      ['В НАЛИЧИИ', String(product.quantity) + ' ШТ.']
    ];
    benefitTexts.forEach(function (paragraph, index) {
      const value = values[index];
      if (!value) return;
      paragraph.replaceChildren(document.createTextNode(value[0]), document.createElement('br'), document.createTextNode(value[1]));
    });
  }

  if (images.length && mainImage) {
    mainImage.src = images[0].url;
    mainImage.alt = product.name;
    if (thumbnails) {
      thumbnails.hidden = false;
      thumbnails.replaceChildren();
      images.forEach(function (productImage, index) {
        const button = document.createElement('button');
        const thumbnail = document.createElement('img');
        button.className = 'product-gallery__thumb' + (index === 0 ? ' is-selected' : '');
        button.type = 'button';
        button.setAttribute('aria-label', 'Показать фото ' + (index + 1));
        button.setAttribute('aria-pressed', String(index === 0));
        thumbnail.src = productImage.url;
        thumbnail.alt = '';
        thumbnail.loading = 'lazy';
        button.appendChild(thumbnail);
        button.addEventListener('click', function () {
          mainImage.src = productImage.url;
          mainImage.alt = product.name + ', фото ' + (index + 1);
          thumbnails.querySelectorAll('.product-gallery__thumb').forEach(function (otherButton) {
            const selected = otherButton === button;
            otherButton.classList.toggle('is-selected', selected);
            otherButton.setAttribute('aria-pressed', String(selected));
          });
          if (count) count.querySelector('span:first-child').textContent = String(index + 1).padStart(2, '0');
        });
        thumbnails.appendChild(button);
      });
    }
  } else {
    if (mainImage) mainImage.removeAttribute('src');
    if (thumbnails) thumbnails.hidden = true;
    const imageWrap = productPage.querySelector('.product-gallery__main');
    if (imageWrap && !imageWrap.querySelector('.product-db-no-photo')) {
      const noPhoto = document.createElement('span');
      noPhoto.className = 'product-db-no-photo';
      noPhoto.textContent = 'ФОТО НЕ ДОБАВЛЕНО';
      imageWrap.appendChild(noPhoto);
    }
  }

  if (count) {
    count.querySelector('span:first-child').textContent = '01';
    count.querySelector('span:last-child').textContent = String(Math.max(images.length, 1)).padStart(2, '0');
    const separator = count.querySelector('span:nth-child(2)');
    if (separator) separator.hidden = images.length < 2;
  }
  if (badge) badge.hidden = false;

  const detail = productPage.querySelector('.product-detail');
  if (detail) detail.hidden = false;
  const crumbs = productPage.querySelector('.product-crumbs');
  if (crumbs) crumbs.hidden = false;
  const message = productPage.querySelector('.product-db-message');
  if (message) message.remove();
}

// ===== Запускает загрузку после готовности страницы =====
document.addEventListener('DOMContentLoaded', function () {
  initProductRequest();
  loadDatabaseProduct();
});
