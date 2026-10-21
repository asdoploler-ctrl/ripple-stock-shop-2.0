import { loadProducts } from './products.js';
import { loadLeads } from './leads.js';
import { loadGroups } from './groups.js';
import { loadEmployees } from './employees.js';
import { loadReceipts } from './receipts.js';
import { loadSales } from './sales.js';
import { loadReports } from './reports.js';

// ===== Переключает разделы меню без перезагрузки страницы =====
export function initNav() {
  const section = document.querySelector('#admin-section');
  const buttons = document.querySelectorAll('.admin-nav__item');
  if (!section || !buttons.length) return;

  // Показывает сообщение-заглушку для раздела, который ещё не сделан.
  function showComingSoon(title) {
    section.innerHTML = '<div class="admin-section__heading"><div><h1>' + title + '</h1></div></div><div class="admin-placeholder">Скоро</div>';
  }

  // Подсвечивает нужный пункт и открывает его содержимое.
  function openSection(button) {
    buttons.forEach(function (item) {
      const isActive = item === button;
      item.classList.toggle('is-active', isActive);
      if (isActive) item.setAttribute('aria-current', 'page');
      else item.removeAttribute('aria-current');
    });

    if (button.dataset.section === 'products') {
      loadProducts(section);
    } else if (button.dataset.section === 'requests') {
      loadLeads(section);
    } else if (button.dataset.section === 'groups') {
      loadGroups(section);
    } else if (button.dataset.section === 'employees') {
      loadEmployees(section);
    } else if (button.dataset.section === 'income') {
      loadReceipts(section);
    } else if (button.dataset.section === 'expenses') {
      loadSales(section);
    } else if (button.dataset.section === 'reports') {
      loadReports(section);
    } else {
      showComingSoon(button.textContent.trim());
    }
  }

  buttons.forEach(function (button) {
    button.addEventListener('click', function () { openSection(button); });
  });

  // Повторно загружает выбранный раздел после входа, когда сессия уже готова.
  document.addEventListener('admin:session-ready', function () {
    const activeButton = document.querySelector('.admin-nav__item.is-active');
    if (activeButton) openSection(activeButton);
  });

  const productsButton = document.querySelector('[data-section="products"]');
  if (productsButton) openSection(productsButton);
}
