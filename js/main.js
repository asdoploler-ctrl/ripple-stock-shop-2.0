// ===== Открытие и закрытие мобильной навигации =====
function initBurger() {
  const burger = document.querySelector('.header__burger');
  const menu = document.querySelector('.header__nav');
  if (!burger || !menu) return;

  burger.addEventListener('click', function () {
    const isOpen = menu.classList.toggle('open');
    burger.setAttribute('aria-expanded', String(isOpen));
    burger.setAttribute('aria-label', isOpen ? 'Закрыть меню' : 'Открыть меню');
  });
}

// ===== Спокойно показывает заголовок и текст первого экрана =====
function initHeroAnimations() {
  const hero = document.querySelector('.hero');
  if (!hero || !window.gsap) return;
  // На планшетах и телефонах сразу показываем содержимое без вступительных эффектов.
  if (window.matchMedia('(max-width: 1024px), (prefers-reduced-motion: reduce)').matches) return;

  // Не анимируем пункты меню, чтобы GSAP не задавал им inline-прозрачность поверх CSS-состояний.
  const headerItems = document.querySelectorAll('.header__logo, .header__social .icon-link');
  const heroItems = hero.querySelectorAll('.hero__title, .hero__subtitle, .hero__text, .hero__button');

  // Лёгкое появление шапки поддерживает общий ритм, не отвлекая от заголовка.
  if (headerItems.length) {
    gsap.from(headerItems, {
      autoAlpha: 0,
      y: -8,
      duration: 0.55,
      stagger: 0.045,
      ease: 'power2.out'
    });
  }

  // Появление идёт сверху вниз небольшими смещениями без резких масштабирований.
  if (heroItems.length) {
    gsap.from(heroItems, {
      autoAlpha: 0,
      y: 16,
      duration: 0.72,
      delay: 0.08,
      stagger: 0.1,
      ease: 'power2.out'
    });
  }
}

// ===== Настраивает мягкое появление блоков при прокрутке =====
function initReveal() {
  const items = document.querySelectorAll('.reveal');
  if (!items.length) return;

  // На компактных экранах блоки сразу видны, чтобы прокрутка оставалась спокойной.
  const reduceMotion = window.matchMedia('(max-width: 1024px), (prefers-reduced-motion: reduce)').matches;
  const hasScrollAnimations = window.gsap && window.ScrollTrigger && !reduceMotion;

  if (reduceMotion) {
    items.forEach(function (item) { item.classList.add('visible'); });
    return;
  }

  if (hasScrollAnimations) {
    gsap.registerPlugin(ScrollTrigger);
    document.documentElement.classList.add('gsap-ready');
    const animatedItems = new Set();

    // Появление дочерних карточек с небольшой паузой выглядит плавнее, чем один общий блок.
    const groups = [
      { container: '.catalog__grid', children: '.card.reveal' },
      { container: '.buy-steps__list', children: '.buy-step' },
      { container: '.faq-list', children: '.faq__item' },
      { container: '.contact-list', children: '.contact-item' },
      { container: '.contact-place__details', children: '.place-detail' }
    ];

    groups.forEach(function (group) {
      const container = document.querySelector(group.container);
      if (!container) return;
      const children = Array.from(container.querySelectorAll(group.children));
      if (!children.length) return;

      children.forEach(function (child) { animatedItems.add(child); });
      gsap.fromTo(children,
        { autoAlpha: 0, y: 18 },
        {
          autoAlpha: 1,
          y: 0,
          duration: 0.72,
          stagger: 0.1,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: container,
            start: 'top 86%',
            once: true
          },
          onComplete: function () {
            children.forEach(function (child) { child.classList.add('visible'); });
          }
        }
      );
    });

    // Остальные блоки появляются по одному, когда подходят к нижней части экрана.
    items.forEach(function (item) {
      if (animatedItems.has(item)) return;

      gsap.fromTo(item,
        { autoAlpha: 0, y: 18 },
        {
          autoAlpha: 1,
          y: 0,
          duration: 0.72,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: item,
            start: 'top 86%',
            once: true
          },
          onComplete: function () { item.classList.add('visible'); }
        }
      );
    });
    return;
  }

  // Если GSAP или ScrollTrigger недоступны, остаётся простое появление через браузерный наблюдатель.
  if (!('IntersectionObserver' in window)) {
    items.forEach(function (item) { item.classList.add('visible'); });
    return;
  }

  const observer = new IntersectionObserver(function (entries, currentObserver) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        currentObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15 });

  items.forEach(function (item) { observer.observe(item); });
}

// ===== Запуск плавного подсчёта, когда цифры появляются на экране =====
function initCounters() {
  const counters = document.querySelectorAll('.counter');
  if (!counters.length) return;

  // Показывает конечные значения, если устройство не поддерживает наблюдение за прокруткой.
  function showFinalValues() {
    counters.forEach(function (counter) {
      const target = Number(counter.dataset.target);
      const suffix = counter.dataset.suffix || '';
      if (Number.isFinite(target)) counter.textContent = String(target) + suffix;
    });
  }

  if (!('IntersectionObserver' in window)) {
    showFinalValues();
    return;
  }

  const observer = new IntersectionObserver(
    // Начинает анимацию только для тех значений, которые вошли в видимую область.
    function (entries, currentObserver) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;

      const counter = entry.target;
      const target = Number(counter.dataset.target);
      const suffix = counter.dataset.suffix || '';
      currentObserver.unobserve(counter);
      if (!Number.isFinite(target)) return;

      const duration = 1500;
      let startTime = null;

      // Плавно увеличивает число кадр за кадром и добавляет знак в конце.
      function updateCount(time) {
        if (startTime === null) startTime = time;
        const progress = Math.min((time - startTime) / duration, 1);
        const easedProgress = 1 - Math.pow(1 - progress, 3);
        const value = Math.floor(target * easedProgress);

        if (progress < 1) {
          counter.textContent = String(value);
          requestAnimationFrame(updateCount);
        } else {
          counter.textContent = String(target) + suffix;
        }
      }

      requestAnimationFrame(updateCount);
    });
    },
    { threshold: 0.4 }
  );

  // Подписывает каждый счётчик на появление в области просмотра.
  counters.forEach(function (counter) { observer.observe(counter); });
}

// ===== Открывает один ответ FAQ и закрывает остальные =====
function initFaq() {
  const items = document.querySelectorAll('.faq__item');
  if (!items.length) return;

  items.forEach(function (item) {
    const question = item.querySelector('.faq__question');
    const symbol = item.querySelector('.faq__symbol');
    if (!question || !symbol) return;

    question.addEventListener('click', function () {
      const shouldOpen = !item.classList.contains('open');

      items.forEach(function (otherItem) {
        otherItem.classList.remove('open');
        const otherQuestion = otherItem.querySelector('.faq__question');
        const otherSymbol = otherItem.querySelector('.faq__symbol');
        if (otherQuestion) otherQuestion.setAttribute('aria-expanded', 'false');
        if (otherSymbol) otherSymbol.textContent = '+';
      });

      if (shouldOpen) {
        item.classList.add('open');
        question.setAttribute('aria-expanded', 'true');
        symbol.textContent = '−';
      }
    });
  });
}

// ===== Проверяет поля формы и отправляет сообщение в Formspree =====
function initContactForm() {
  const form = document.querySelector('#contact-form');
  const message = document.querySelector('#form-message');
  const submitButton = form ? form.querySelector('[type="submit"]') : null;
  if (!form || !message) return;

  const nameField = form.querySelector('[name="name"]');
  const contactField = form.querySelector('[name="contact"]');
  const messageField = form.querySelector('[name="message"]');
  const consentField = form.querySelector('[name="consent"]');
  if (!nameField || !contactField || !messageField || !consentField || !submitButton) return;

  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    message.classList.remove('is-error', 'is-success');

    const hasEmptyField = !nameField.value.trim() ||
      !contactField.value.trim() ||
      !messageField.value.trim();

    if (hasEmptyField || !consentField.checked) {
      message.textContent = 'Заполни все поля и поставь галочку';
      message.classList.add('is-error');
      return;
    }

    const endpoint = form.getAttribute('action');
    if (!endpoint || endpoint.includes('/FORM_ID')) {
      message.textContent = 'Укажите ID формы Formspree, чтобы отправить сообщение';
      message.classList.add('is-error');
      return;
    }

    submitButton.disabled = true;
    form.setAttribute('aria-busy', 'true');
    message.textContent = 'Отправляем сообщение…';

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        body: new FormData(form),
        headers: { Accept: 'application/json' }
      });

      if (!response.ok) {
        message.textContent = 'Не удалось отправить сообщение. Попробуй ещё раз.';
        message.classList.add('is-error');
        return;
      }

      message.textContent = 'Сообщение отправлено! Мы ответим в течение 1–2 часов';
      message.classList.add('is-success');
      form.reset();
    } catch (error) {
      message.textContent = 'Нет соединения. Проверь интернет и попробуй ещё раз.';
      message.classList.add('is-error');
    } finally {
      submitButton.disabled = false;
      form.removeAttribute('aria-busy');
    }
  });
}

// ===== Переключает кадр галереи и выбранный размер на странице товара =====
function initProductPage() {
  const productPage = document.querySelector('.product-page');
  if (!productPage) return;
  // Товар с параметром id загружается отдельным модулем напрямую из Supabase.
  if (new URLSearchParams(window.location.search).has('id')) return;

  // Эти данные нужны, чтобы одна и та же простая страница показывала разные товары.
  const products = {
    stussy: {
      title: 'STÜSSY T-SHIRT', category: 'ФУТБОЛКИ', color: 'Black', price: '1 200 MDL',
      image: './img/items/1.JPEG', alt: 'Чёрная футболка Stüssy с белым логотипом на груди', sizes: ['S', 'M', 'L', 'XL'], selectedSize: 'L',
      features: ['Комфортная|посадка', 'Проверенный|бренд', 'Быстрая|связь']
    },
    spyder: {
      title: 'SPYDER T-SHIRT', category: 'ФУТБОЛКИ', color: 'White', price: '1 100 MDL',
      image: './img/items/2.JPEG', alt: 'Белая футболка Spyder', sizes: ['S', 'M', 'L', 'XL'], selectedSize: 'L',
      features: ['Комфортная|посадка', 'Проверенный|бренд', 'Быстрая|связь']
    },
    arcteryx: {
      title: "ARC'TERYX BAG", category: 'СУМКИ', color: 'Grey', price: '2 000 MDL',
      image: './img/items/3.JPEG', alt: "Серая сумка Arc'teryx", sizes: ['One size'], selectedSize: 'One size',
      features: ['Городской|формат', 'Проверенный|бренд', 'Быстрая|связь']
    },
    belt: {
      title: 'STÜSSY BELT', category: 'АКСЕССУАРЫ', color: 'Black', price: '800 MDL',
      image: './img/items/4.JPEG', alt: 'Чёрный ремень Stüssy', sizes: ['One size'], selectedSize: 'One size',
      features: ['Универсальный|размер', 'Проверенный|бренд', 'Быстрая|связь']
    }
  };

  const productKey = new URLSearchParams(window.location.search).get('item') || 'stussy';
  const product = products[productKey] || products.stussy;
  const mainImage = productPage.querySelector('.product-gallery__image');
  const viewButtons = productPage.querySelectorAll('.product-gallery__thumb');
  const count = productPage.querySelector('.product-gallery__count span:first-child');
  const variant = productPage.querySelector('.product-info__variant');
  const sizeList = productPage.querySelector('.product-sizes__list');

  // Подставляет название, фото, цену и подписи выбранного товара в общий макет.
  productPage.querySelector('.product-crumbs__category').textContent = product.category;
  productPage.querySelector('.product-crumbs__current').textContent = product.title;
  productPage.querySelector('.product-info__label').textContent = 'STREETWEAR / ' + product.title.split(' ')[0];
  productPage.querySelector('.product-info__title').textContent = product.title;
  productPage.querySelector('.product-info__price').textContent = product.price;
  document.title = product.title + ' — Ripple Stock';
  if (mainImage) {
    mainImage.src = product.image;
    mainImage.alt = product.alt;
  }
  productPage.querySelectorAll('.product-gallery__thumb img').forEach(function (image) {
    image.src = product.image;
    image.alt = '';
  });
  productPage.querySelectorAll('.product-benefit p').forEach(function (text, index) {
    const feature = product.features[index].split('|');
    text.innerHTML = feature[0] + '<br>' + feature[1];
  });

  // Создаёт только те кнопки размера, которые есть у выбранного товара.
  if (sizeList) {
    sizeList.replaceChildren();
    product.sizes.forEach(function (size) {
      const button = document.createElement('button');
      const isSelected = size === product.selectedSize;
      button.type = 'button';
      button.className = 'product-sizes__button' + (isSelected ? ' is-selected' : '');
      button.setAttribute('aria-pressed', String(isSelected));
      button.textContent = size === 'One size' ? 'ONE SIZE' : size;
      sizeList.appendChild(button);
    });
  }
  const sizeButtons = productPage.querySelectorAll('.product-sizes__button');
  if (variant) {
    const selectedText = product.selectedSize === 'One size' ? 'One size' : 'Size ' + product.selectedSize;
    variant.textContent = product.color + ' / ' + selectedText;
  }

  // Показывает выбранный фрагмент фото и номер кадра галереи.
  if (mainImage && viewButtons.length) {
    const views = {
      full: { scale: 'scale(1)', position: 'center 55%' },
      logo: { scale: 'scale(1.45)', position: '64% 46%' },
      neck: { scale: 'scale(1.8)', position: '50% 29%' },
      fabric: { scale: 'scale(2)', position: '40% 70%' }
    };

    viewButtons.forEach(function (button, index) {
      button.addEventListener('click', function () {
        const view = views[button.dataset.view];
        if (!view) return;

        mainImage.style.transform = view.scale;
        mainImage.style.objectPosition = view.position;
        viewButtons.forEach(function (otherButton) {
          const isSelected = otherButton === button;
          otherButton.classList.toggle('is-selected', isSelected);
          otherButton.setAttribute('aria-pressed', String(isSelected));
        });
        if (count) count.textContent = String(index + 1).padStart(2, '0');
      });
    });
  }

  // Отмечает нажатый размер и обновляет подпись рядом с названием товара.
  if (sizeButtons.length) {
    sizeButtons.forEach(function (button) {
      button.addEventListener('click', function () {
        sizeButtons.forEach(function (otherButton) {
          const isSelected = otherButton === button;
          otherButton.classList.toggle('is-selected', isSelected);
          otherButton.setAttribute('aria-pressed', String(isSelected));
        });
        if (variant) {
          const selectedSize = button.textContent.trim();
          variant.textContent = product.color + ' / ' + (selectedSize === 'ONE SIZE' ? 'One size' : 'Size ' + selectedSize);
        }
      });
    });
  }
}

// ===== Запуск функций после загрузки разметки страницы =====
document.addEventListener('DOMContentLoaded', function () {
  initBurger();
  initHeroAnimations();
  initReveal();
  initCounters();
  initFaq();
  initContactForm();
  initProductPage();
});
