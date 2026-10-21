import { supabaseClient } from './supabase-client.js';

// ===== Определяет простую категорию товара по его названию и группе =====
function getProductCategory(product) {
  const text = (product.name + ' ' + (product.product_groups ? product.product_groups.name : '')).toLowerCase();

  if (/сумк|рюкзак|\bbag\b|backpack/.test(text)) return 'bags';
  if (/аксессуар|ремень|\bbelt\b|кепк|\bcap\b|шапк|beanie/.test(text)) return 'accessories';
  return 'clothing';
}

// ===== Сортирует фотографии товара так, чтобы первой была обложка =====
function getProductPhotos(product) {
  return (product.product_images || []).slice().sort(function (first, second) {
    return first.sort_order - second.sort_order;
  });
}

// ===== Создаёт одну карточку из данных товара, полученных из базы =====
function createProductCard(product, headingTag) {
  const card = document.createElement('article');
  const groupName = product.product_groups ? product.product_groups.name : '';
  const coverImage = getProductPhotos(product)[0];
  const searchableText = [product.name, product.size, product.description, groupName].filter(Boolean).join(' ').toLowerCase();
  const createdAt = new Date(product.created_at).getTime();
  card.className = 'card catalog-product reveal';
  card.dataset.category = getProductCategory(product);
  card.dataset.name = searchableText;
  card.dataset.price = String(Number(product.price));
  card.dataset.order = String(Number.isFinite(createdAt) ? createdAt : 0);

  const imageWrap = document.createElement('div');
  imageWrap.className = 'card__image-wrap';

  const imageLink = document.createElement('a');
  imageLink.className = 'card__image-link';
  imageLink.href = 'product.html?id=' + encodeURIComponent(product.id);
  imageLink.setAttribute('aria-label', 'Открыть товар ' + product.name);

  if (coverImage) {
    const image = document.createElement('img');
    image.className = 'card__image';
    image.src = coverImage.url;
    image.alt = product.name;
    image.loading = 'lazy';
    imageLink.appendChild(image);
  } else {
    const noPhoto = document.createElement('span');
    noPhoto.className = 'catalog-product__no-photo';
    noPhoto.textContent = 'ФОТО НЕ ДОБАВЛЕНО';
    imageLink.appendChild(noPhoto);
  }
  imageWrap.appendChild(imageLink);

  const badge = document.createElement('span');
  badge.className = 'card__badge';
  badge.textContent = 'NEW';
  imageWrap.appendChild(badge);

  const details = document.createElement('div');
  details.className = 'card__details';

  const title = document.createElement(headingTag || 'h2');
  title.className = 'card__title';
  title.textContent = product.name;

  const description = document.createElement('p');
  description.className = 'card__variant';
  description.textContent = product.size ? 'Размер ' + product.size : groupName;

  const footer = document.createElement('div');
  footer.className = 'card__footer';

  const price = document.createElement('p');
  price.className = 'card__price';
  price.textContent = Number(product.price).toLocaleString('ru-RU') + ' MDL';

  const arrow = document.createElement('a');
  arrow.className = 'card__arrow';
  arrow.href = imageLink.href;
  arrow.setAttribute('aria-label', 'Подробнее о товаре ' + product.name);
  arrow.textContent = '→';

  footer.append(price, arrow);
  details.append(title, description, footer);
  card.append(imageWrap, details);
  return card;
}

// ===== Фильтрует, ищет, сортирует и обновляет счётчик карточек =====
function initCatalogControls(grid, products, filterButtons, searchInput, sortSelect, countLabel) {
  let activeCategory = 'all';

  function updateCatalog() {
    const searchText = searchInput ? searchInput.value.trim().toLowerCase() : '';
    const sortOrder = sortSelect ? sortSelect.value : 'newest';
    const visibleCards = products.filter(function (card) {
      const matchesCategory = activeCategory === 'all' || card.dataset.category === activeCategory;
      const matchesSearch = card.dataset.name.includes(searchText);
      card.hidden = !(matchesCategory && matchesSearch);
      return !card.hidden;
    });

    visibleCards.sort(function (first, second) {
      if (sortOrder === 'price-low') return Number(first.dataset.price) - Number(second.dataset.price);
      if (sortOrder === 'price-high') return Number(second.dataset.price) - Number(first.dataset.price);
      return Number(second.dataset.order) - Number(first.dataset.order);
    });
    visibleCards.forEach(function (card) { grid.appendChild(card); });
    if (countLabel) countLabel.textContent = 'Найдено товаров: ' + visibleCards.length;
  }

  filterButtons.forEach(function (button) {
    button.addEventListener('click', function () {
      activeCategory = button.dataset.category;
      filterButtons.forEach(function (otherButton) {
        const isSelected = otherButton === button;
        otherButton.classList.toggle('is-selected', isSelected);
        otherButton.setAttribute('aria-pressed', String(isSelected));
      });
      updateCatalog();
    });
  });

  if (searchInput) searchInput.addEventListener('input', updateCatalog);
  if (sortSelect) sortSelect.addEventListener('change', updateCatalog);
  updateCatalog();
}

// ===== Анимирует появление карточек после их загрузки из базы =====
function animateProductCards(container, cards) {
  if (!container || !cards.length) return;

  const reduceMotion = window.matchMedia('(max-width: 1024px), (prefers-reduced-motion: reduce)').matches;
  if (reduceMotion) {
    cards.forEach(function (card) { card.classList.add('visible'); });
    return;
  }

  if (window.gsap && window.ScrollTrigger) {
    window.gsap.registerPlugin(window.ScrollTrigger);
    document.documentElement.classList.add('gsap-ready');
    window.gsap.fromTo(cards,
      { autoAlpha: 0, y: 18 },
      {
        autoAlpha: 1,
        y: 0,
        duration: 0.72,
        stagger: 0.1,
        ease: 'power2.out',
        scrollTrigger: { trigger: container, start: 'top 86%', once: true },
        onComplete: function () {
          cards.forEach(function (card) { card.classList.add('visible'); });
        }
      }
    );
    return;
  }

  if (!('IntersectionObserver' in window)) {
    cards.forEach(function (card) { card.classList.add('visible'); });
    return;
  }

  const observer = new IntersectionObserver(function (entries, currentObserver) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('visible');
      currentObserver.unobserve(entry.target);
    });
  }, { threshold: 0.12 });
  cards.forEach(function (card) { observer.observe(card); });
}

// ===== Загружает опубликованные товары для каталога и главного экрана =====
async function loadStorefrontProducts() {
  const catalog = document.querySelector('.catalog-page');
  const catalogGrid = catalog ? catalog.querySelector('#catalog-list') : null;
  const catalogMessage = catalog ? catalog.querySelector('#catalog-message') : null;
  const countLabel = catalog ? catalog.querySelector('#catalog-count') : null;
  const homeGrid = document.querySelector('#products-list');
  const homeMessage = document.querySelector('#home-products-message');
  if (!catalogGrid && !homeGrid) return;

  if (!supabaseClient) {
    if (catalogMessage) catalogMessage.textContent = 'Не удалось подключиться к каталогу. Проверь подключение Supabase.';
    if (homeMessage) homeMessage.textContent = 'Не удалось загрузить товары. Проверь подключение Supabase.';
    return;
  }

  try {
    const { data, error } = await supabaseClient
      .from('products')
      .select('id, group_id, name, size, description, price, quantity, is_published, created_at, product_groups(name), product_images(url, sort_order)')
      .eq('is_published', true)
      .gt('quantity', 0)
      .order('created_at', { ascending: false })
      .order('sort_order', { referencedTable: 'product_images', ascending: true });

    if (error) throw error;

    if (!data || !data.length) {
      if (catalogGrid) catalogGrid.replaceChildren();
      if (homeGrid) homeGrid.replaceChildren();
      if (catalogMessage) catalogMessage.textContent = 'Сейчас нет товаров в наличии.';
      if (homeMessage) homeMessage.textContent = 'Новых поступлений пока нет.';
      if (countLabel) countLabel.textContent = 'Найдено товаров: 0';
      return;
    }

    if (catalogGrid) {
      const filterButtons = catalog.querySelectorAll('.catalog-filter');
      const searchInput = catalog.querySelector('#catalog-search');
      const sortSelect = catalog.querySelector('#catalog-sort');
      const catalogCards = data.map(function (product) { return createProductCard(product, 'h2'); });
      catalogGrid.replaceChildren(...catalogCards);
      if (catalogMessage) catalogMessage.hidden = true;
      animateProductCards(catalogGrid, catalogCards);
      initCatalogControls(catalogGrid, catalogCards, filterButtons, searchInput, sortSelect, countLabel);
    }

    if (homeGrid) {
      const homeCards = data.slice(0, 4).map(function (product) { return createProductCard(product, 'h3'); });
      homeGrid.replaceChildren(...homeCards);
      if (homeMessage) homeMessage.hidden = true;
      animateProductCards(homeGrid, homeCards);
    }
  } catch (error) {
    if (catalogGrid) catalogGrid.replaceChildren();
    if (homeGrid) homeGrid.replaceChildren();
    const messageText = error.message
      ? 'Не удалось загрузить товары. ' + error.message
      : 'Не удалось загрузить товары. Проверь соединение и настройки Supabase.';
    if (catalogMessage) catalogMessage.textContent = messageText;
    if (homeMessage) homeMessage.textContent = messageText;
  }
}

// ===== Запускает загрузку после готовности страницы =====
document.addEventListener('DOMContentLoaded', loadStorefrontProducts);
