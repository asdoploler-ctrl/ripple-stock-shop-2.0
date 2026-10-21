import { supabaseClient } from '../supabase-client.js';
import { openModal } from './modal.js';

// ===== Загружает продажи с товарами, сотрудниками и связанными заявками =====
async function getSales() {
  const { data, error } = await supabaseClient
    .from('sales')
    .select('id, doc_date, product_id, quantity, price, customer_name, lead_id, products(name, size), employees(full_name), leads(client_name)')
    .order('doc_date', { ascending: false })
    .order('id', { ascending: false });
  if (error) throw error;
  return data || [];
}

// ===== Загружает товары с остатками и ценой из каталога =====
async function getSaleProducts() {
  const { data, error } = await supabaseClient
    .from('products')
    .select('id, name, size, quantity, price')
    .order('name');
  if (error) throw error;
  return data || [];
}

// ===== Загружает заявки, которые ещё не стали продажами =====
async function getOpenLeads() {
  const { data, error } = await supabaseClient
    .from('leads')
    .select('id, quantity, client_name, contact_type, contact_value, comment, status, created_at, products(id, name, size, quantity, price)')
    .neq('status', 'closed')
    .order('created_at', { ascending: true });
  if (!error) return { items: data || [], supportsQuantity: true };

  // При старой схеме пока показывает заявки как заказы по одной штуке.
  if (error.code === '42703' && error.message.includes('leads.quantity')) {
    const legacyResult = await supabaseClient
      .from('leads')
      .select('id, client_name, contact_type, contact_value, comment, status, created_at, products(id, name, size, quantity, price)')
      .neq('status', 'closed')
      .order('created_at', { ascending: true });
    if (legacyResult.error) throw legacyResult.error;
    return {
      items: (legacyResult.data || []).map(function (lead) {
        lead.quantity = 1;
        return lead;
      }),
      supportsQuantity: false
    };
  }
  throw error;
}

// ===== Находит профиль текущего сотрудника для записи продажи =====
async function getCurrentEmployeeId() {
  const { data: authData, error: authError } = await supabaseClient.auth.getUser();
  if (authError) throw authError;
  if (!authData.user) throw new Error('Войди в админ-панель под аккаунтом сотрудника.');
  const { data, error } = await supabaseClient.from('employees').select('id').eq('user_id', authData.user.id).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Текущий аккаунт не привязан к профилю в таблице employees.');
  return data.id;
}

// ===== Форматирует сумму MDL без лишних десятичных знаков =====
function formatSaleMoney(value) {
  return Number(value || 0).toLocaleString('ru-RU', { maximumFractionDigits: 2 }) + ' MDL';
}

// ===== Возвращает сегодняшнюю дату для формы продажи =====
function getSaleToday() {
  const today = new Date();
  return today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
}

// ===== Показывает форму ручного расходного документа =====
async function openSaleForm(products, reload) {
  const availableProducts = products.filter(function (product) { return Number(product.quantity) > 0; });
  if (!availableProducts.length) {
    window.alert('Нет товаров с положительным остатком. Сначала оформи приход.');
    return;
  }

  let employeeId;
  try {
    employeeId = await getCurrentEmployeeId();
  } catch (error) {
    window.alert(error.message || 'Не удалось определить текущего сотрудника.');
    return;
  }

  const options = [{ value: '', label: 'Выбери товар' }].concat(availableProducts.map(function (product) {
    return {
      value: String(product.id),
      label: product.name + (product.size ? ' / ' + product.size : '') + ' · остаток ' + product.quantity
    };
  }));
  openModal('Оформить продажу', [
    { type: 'date', name: 'doc_date', label: 'Дата продажи', value: getSaleToday(), required: true },
    { type: 'select', name: 'product_id', label: 'Товар', options: options, required: true },
    { type: 'number', name: 'quantity', label: 'Количество, шт.', min: '1', step: '1', value: '1', required: true },
    { type: 'number', name: 'price', label: 'Цена продажи за штуку (MDL)', min: '0', step: '0.01', required: true,
      help: 'Укажи фактическую цену продажи. Она может отличаться от цены в каталоге.' },
    { type: 'text', name: 'customer_name', label: 'Покупатель', placeholder: 'Необязательно' }
  ], async function (values) {
    const product = availableProducts.find(function (item) { return String(item.id) === values.product_id; });
    const quantity = Number(values.quantity);
    const price = Number(values.price);
    if (!product) throw new Error('Выбери товар из списка.');
    if (!Number.isInteger(quantity) || quantity < 1) throw new Error('Количество должно быть целым числом от 1.');
    if (quantity > Number(product.quantity)) throw new Error('На складе только ' + product.quantity + ' шт. Триггер базы также проверит остаток при сохранении.');
    if (!Number.isFinite(price) || price < 0) throw new Error('Укажи корректную цену продажи.');

    const { error } = await supabaseClient.from('sales').insert({
      doc_date: values.doc_date,
      product_id: Number(values.product_id),
      quantity: quantity,
      price: price,
      customer_name: values.customer_name || null,
      employee_id: employeeId
    });
    if (error) {
      if ((error.message || '').includes('Недостаточно товара')) {
        throw new Error('Недостаточно товара на складе. Обнови список и проверь остаток.');
      }
      throw new Error('Не удалось оформить расход. ' + (error.message || 'Проверь данные и права доступа.'));
    }

    // Остаток и запись operations изменяет триггер после добавления продажи.
    if (window.closeAdminModal) window.closeAdminModal();
    await reload();
  });
}

// ===== Продаёт товар по заявке атомарно через функцию базы данных =====
async function closeLeadAsSale(lead, reload) {
  if (!lead.products) {
    window.alert('У заявки не найден товар. Проверь запись в базе.');
    return;
  }
  if (Number(lead.products.quantity) < Number(lead.quantity)) {
    window.alert('Для заявки нужно ' + lead.quantity + ' шт., а в наличии только ' + lead.products.quantity + '. Продажу оформить нельзя.');
    return;
  }

  let employeeId;
  try {
    employeeId = await getCurrentEmployeeId();
  } catch (error) {
    window.alert(error.message || 'Не удалось определить текущего сотрудника.');
    return;
  }

  const productLabel = lead.products.name + (lead.products.size ? ' / ' + lead.products.size : '');
  const customerLabel = lead.client_name || 'покупатель не указал имя';
  openModal('Продажа по заявке #' + lead.id, [
    { type: 'number', name: 'price', label: 'Цена за штуку (MDL)', min: '0', step: '0.01', value: String(lead.products.price),
      help: productLabel + ' · ' + customerLabel + '. Будет продано ' + lead.quantity + ' шт.; остаток спишется, заявка закроется.' }
  ], async function (values) {
    const price = Number(values.price);
    if (!Number.isFinite(price) || price < 0) throw new Error('Укажи корректную цену продажи.');

    const { error } = await supabaseClient.rpc('close_lead_as_sale', {
      p_lead_id: lead.id,
      p_employee_id: employeeId,
      p_price: price
    });
    if (error) {
      if ((error.message || '').includes('Недостаточно товара')) {
        throw new Error('Недостаточно товара на складе. Заявка осталась открытой.');
      }
      throw new Error('Не удалось закрыть заявку продажей. ' + (error.message || 'Попробуй ещё раз.'));
    }

    // close_lead_as_sale сама создаёт продажу, списывает единицу и меняет статус заявки.
    if (window.closeAdminModal) window.closeAdminModal();
    await reload();
  });
}

// ===== Создаёт строку журнала продаж с суммой и сотрудником =====
function createSaleRow(sale) {
  const row = document.createElement('tr');
  const docCell = document.createElement('td');
  const number = document.createElement('strong');
  number.className = 'admin-product-name';
  number.textContent = '#' + sale.id;
  const date = document.createElement('small');
  date.className = 'admin-receipt-date';
  date.textContent = new Date(sale.doc_date + 'T00:00:00').toLocaleDateString('ru-RU');
  docCell.append(number, date);
  row.appendChild(docCell);

  const productCell = document.createElement('td');
  const productName = document.createElement('strong');
  productName.className = 'admin-product-name';
  productName.textContent = sale.products ? sale.products.name : 'Товар удалён';
  productCell.appendChild(productName);
  if (sale.products && sale.products.size) {
    const size = document.createElement('small');
    size.className = 'admin-product-size';
    size.textContent = 'Размер: ' + sale.products.size;
    productCell.appendChild(size);
  }
  row.appendChild(productCell);

  const quantity = document.createElement('td');
  quantity.textContent = String(sale.quantity) + ' шт.';
  row.appendChild(quantity);
  const price = document.createElement('td');
  price.textContent = formatSaleMoney(sale.price);
  row.appendChild(price);
  const total = document.createElement('td');
  total.className = 'admin-sale-total';
  total.textContent = formatSaleMoney(Number(sale.quantity) * Number(sale.price));
  row.appendChild(total);

  const customer = document.createElement('td');
  customer.textContent = sale.customer_name || (sale.leads ? sale.leads.client_name : '') || '—';
  row.appendChild(customer);
  const employee = document.createElement('td');
  employee.textContent = sale.employees ? sale.employees.full_name : '—';
  row.appendChild(employee);
  return row;
}

// ===== Создаёт строку заявки, которую можно оформить как продажу =====
function createOpenLeadRow(lead, reload) {
  const row = document.createElement('tr');
  const leadCell = document.createElement('td');
  const name = document.createElement('strong');
  name.className = 'admin-product-name';
  name.textContent = lead.client_name || 'Покупатель не указал имя';
  const contact = document.createElement('small');
  contact.className = 'admin-product-size';
  contact.textContent = lead.contact_value + ' · ' + lead.contact_type;
  leadCell.append(name, contact);
  row.appendChild(leadCell);

  const productCell = document.createElement('td');
  productCell.textContent = lead.products ? lead.products.name + (lead.products.size ? ' / ' + lead.products.size : '') : 'Товар не найден';
  row.appendChild(productCell);
  const stockCell = document.createElement('td');
  stockCell.textContent = lead.products ? String(lead.products.quantity) + ' шт. (запрос: ' + lead.quantity + ')' : '—';
  row.appendChild(stockCell);
  const statusCell = document.createElement('td');
  const status = document.createElement('span');
  status.className = lead.status === 'in_progress' ? 'admin-status' : 'admin-status admin-status--hidden';
  status.textContent = lead.status === 'in_progress' ? 'В работе' : 'Новая';
  statusCell.appendChild(status);
  row.appendChild(statusCell);

  const actions = document.createElement('td');
  actions.className = 'admin-table__actions';
  const button = document.createElement('button');
  button.className = 'admin-button admin-button--small admin-button--primary';
  button.type = 'button';
  button.textContent = 'Оформить продажу';
  button.disabled = !lead.products || Number(lead.products.quantity) < Number(lead.quantity);
  button.addEventListener('click', function () { closeLeadAsSale(lead, reload); });
  actions.appendChild(button);
  row.appendChild(actions);
  return row;
}

// ===== Загружает расходные документы и очередь заявок к продаже =====
export async function loadSales(container) {
  if (!container) return;
  container.innerHTML =
    '<div class="admin-section__heading"><div><h1>Расход</h1><p>Продажи, списание товара и закрытие заявок</p></div>' +
    '<button class="admin-button admin-button--primary" type="button" data-add-sale>+ ОФОРМИТЬ ПРОДАЖУ</button></div>' +
    '<p class="admin-sales-error" data-sales-error role="status" aria-live="polite"></p>' +
    '<p class="admin-sales-migration" data-sales-migration hidden>В базе ещё нет количества в заявках. Выполни файл migration-lead-quantity.sql в Supabase SQL Editor, чтобы учитывать заказанное количество.</p>' +
    '<section class="admin-sales-block"><div class="admin-sales-block__heading"><div><p class="admin-eyebrow">ЖУРНАЛ ДВИЖЕНИЙ</p><h2>Расходные документы</h2></div></div>' +
    '<div class="admin-table-wrap"><table class="admin-table admin-sales-table"><thead><tr><th>Документ</th><th>Товар</th><th>Количество</th><th>Цена / шт.</th><th>Сумма</th><th>Покупатель</th><th>Сотрудник</th></tr></thead><tbody data-sales-body></tbody></table></div></section>' +
    '<section class="admin-sales-block admin-sales-block--leads"><div class="admin-sales-block__heading"><div><p class="admin-eyebrow">ИЗ ЗАЯВКИ В ПРОДАЖУ</p><h2>Ожидают оформления</h2></div></div>' +
    '<div class="admin-table-wrap"><table class="admin-table admin-open-leads-table"><thead><tr><th>Покупатель</th><th>Товар</th><th>Остаток</th><th>Статус</th><th>Действие</th></tr></thead><tbody data-open-leads-body></tbody></table></div></section>';

  const salesBody = container.querySelector('[data-sales-body]');
  const leadsBody = container.querySelector('[data-open-leads-body]');
  const errorBox = container.querySelector('[data-sales-error]');
  const migrationNote = container.querySelector('[data-sales-migration]');
  let products = [];
  const reload = async function () {
    errorBox.textContent = '';
    salesBody.innerHTML = '<tr><td class="admin-empty" colspan="7">Загружаем расходные документы…</td></tr>';
    leadsBody.innerHTML = '<tr><td class="admin-empty" colspan="5">Загружаем заявки…</td></tr>';
    if (!supabaseClient) {
      salesBody.replaceChildren();
      leadsBody.replaceChildren();
      errorBox.textContent = 'Не удалось подключиться к Supabase. Проверь настройки проекта.';
      return;
    }

    try {
      const results = await Promise.all([getSales(), getSaleProducts(), getOpenLeads()]);
      const sales = results[0];
      products = results[1];
      const leadsResult = results[2];
      const leads = leadsResult.items;
      migrationNote.hidden = leadsResult.supportsQuantity;
      salesBody.replaceChildren();
      leadsBody.replaceChildren();

      if (!sales.length) {
        const row = document.createElement('tr');
        const cell = document.createElement('td');
        cell.className = 'admin-empty';
        cell.colSpan = 7;
        cell.textContent = 'Расходных документов пока нет.';
        row.appendChild(cell);
        salesBody.appendChild(row);
      } else {
        sales.forEach(function (sale) { salesBody.appendChild(createSaleRow(sale)); });
      }

      if (!leads.length) {
        const row = document.createElement('tr');
        const cell = document.createElement('td');
        cell.className = 'admin-empty';
        cell.colSpan = 5;
        cell.textContent = 'Нет открытых заявок. Новые обращения появятся здесь.';
        row.appendChild(cell);
        leadsBody.appendChild(row);
      } else {
        leads.forEach(function (lead) { leadsBody.appendChild(createOpenLeadRow(lead, reload)); });
      }
    } catch (error) {
      salesBody.replaceChildren();
      leadsBody.replaceChildren();
      errorBox.textContent = 'Не удалось загрузить расход. ' + (error.message || 'Проверь права доступа и попробуй ещё раз.');
    }
  };

  container.querySelector('[data-add-sale]').addEventListener('click', function () { openSaleForm(products, reload); });
  await reload();
}
