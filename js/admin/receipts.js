import { supabaseClient } from '../supabase-client.js';
import { openModal } from './modal.js';

// ===== Загружает приходные документы с товарами и сотрудниками =====
async function getReceipts() {
  const { data, error } = await supabaseClient
    .from('receipts')
    .select('id, doc_date, supplier, product_id, quantity, purchase_price, paid_amount, products(name, size), employees(full_name)')
    .order('doc_date', { ascending: false })
    .order('id', { ascending: false });
  if (error) throw error;
  return data || [];
}

// ===== Загружает товары с текущим остатком для выбора в документе =====
async function getReceiptProducts() {
  const { data, error } = await supabaseClient
    .from('products')
    .select('id, name, size, quantity')
    .order('name');
  if (error) throw error;
  return data || [];
}

// ===== Находит запись сотрудника для текущего аккаунта Supabase =====
async function getCurrentEmployeeId() {
  const { data: authData, error: authError } = await supabaseClient.auth.getUser();
  if (authError) throw authError;
  if (!authData.user) throw new Error('Войди в админ-панель под аккаунтом сотрудника.');

  const { data, error } = await supabaseClient
    .from('employees')
    .select('id')
    .eq('user_id', authData.user.id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Текущий аккаунт не привязан к профилю в таблице employees.');
  return data.id;
}

// ===== Форматирует денежную сумму для отображения =====
function formatMoney(value) {
  return Number(value || 0).toLocaleString('ru-RU', { maximumFractionDigits: 2 }) + ' MDL';
}

// ===== Возвращает сегодняшнюю дату в формате для поля date =====
function getTodayDate() {
  const today = new Date();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return today.getFullYear() + '-' + month + '-' + day;
}

// ===== Открывает форму приходного документа и записывает его в receipts =====
async function openReceiptForm(products, reload) {
  if (!products.length) {
    window.alert('Сначала добавь товар в разделе «Товары», затем оформи приход.');
    return;
  }

  let employeeId;
  try {
    employeeId = await getCurrentEmployeeId();
  } catch (error) {
    window.alert(error.message || 'Не удалось определить текущего сотрудника.');
    return;
  }

  const productOptions = [{ value: '', label: 'Выбери товар' }].concat(products.map(function (product) {
    const size = product.size ? ' / ' + product.size : '';
    return {
      value: String(product.id),
      label: product.name + size + ' · остаток ' + product.quantity
    };
  }));

  openModal('Оформить приход', [
    { type: 'date', name: 'doc_date', label: 'Дата документа', value: getTodayDate(), required: true },
    { type: 'text', name: 'supplier', label: 'Поставщик', placeholder: 'Название или имя поставщика', required: true },
    { type: 'select', name: 'product_id', label: 'Товар', options: productOptions, required: true },
    { type: 'number', name: 'quantity', label: 'Количество, шт.', min: '1', step: '1', value: '1', required: true },
    { type: 'number', name: 'purchase_price', label: 'Закупочная цена за штуку (MDL)', min: '0', step: '0.01', value: '0', required: true },
    { type: 'number', name: 'paid_amount', label: 'Уже оплачено поставщику (MDL)', min: '0', step: '0.01', value: '0', required: true,
      help: 'Можно указать частичную оплату или оставить 0.' }
  ], async function (values) {
    const quantity = Number(values.quantity);
    const purchasePrice = Number(values.purchase_price);
    const paidAmount = Number(values.paid_amount);
    const totalCost = quantity * purchasePrice;

    if (!Number.isInteger(quantity) || quantity < 1) throw new Error('Количество должно быть целым числом от 1.');
    if (!Number.isFinite(purchasePrice) || purchasePrice < 0) throw new Error('Укажи корректную закупочную цену.');
    if (!Number.isFinite(paidAmount) || paidAmount < 0) throw new Error('Укажи корректную сумму оплаты.');
    if (paidAmount > totalCost) throw new Error('Оплаченная сумма не может быть больше общей стоимости прихода (' + formatMoney(totalCost) + ').');

    const { error } = await supabaseClient.from('receipts').insert({
      doc_date: values.doc_date,
      supplier: values.supplier,
      product_id: Number(values.product_id),
      quantity: quantity,
      purchase_price: purchasePrice,
      paid_amount: paidAmount,
      employee_id: employeeId
    });
    if (error) {
      throw new Error('Не удалось оформить приход. ' + (error.message || 'Проверь данные и права доступа.'));
    }

    // Остаток товара и строка operations добавляются триггером после вставки документа.
    if (window.closeAdminModal) window.closeAdminModal();
    await reload();
  });
}

// ===== Создаёт строку журнала прихода и рассчитывает долг поставщику =====
function createReceiptRow(receipt) {
  const row = document.createElement('tr');
  const docCell = document.createElement('td');
  const docNumber = document.createElement('strong');
  docNumber.className = 'admin-product-name';
  docNumber.textContent = '#' + receipt.id;
  const date = document.createElement('small');
  date.className = 'admin-receipt-date';
  date.textContent = new Date(receipt.doc_date + 'T00:00:00').toLocaleDateString('ru-RU');
  docCell.append(docNumber, date);
  row.appendChild(docCell);

  const supplierCell = document.createElement('td');
  supplierCell.textContent = receipt.supplier;
  row.appendChild(supplierCell);

  const productCell = document.createElement('td');
  const product = document.createElement('strong');
  product.className = 'admin-product-name';
  product.textContent = receipt.products ? receipt.products.name : 'Товар удалён';
  productCell.appendChild(product);
  if (receipt.products && receipt.products.size) {
    const size = document.createElement('small');
    size.className = 'admin-product-size';
    size.textContent = 'Размер: ' + receipt.products.size;
    productCell.appendChild(size);
  }
  row.appendChild(productCell);

  const quantityCell = document.createElement('td');
  quantityCell.textContent = String(receipt.quantity) + ' шт.';
  row.appendChild(quantityCell);
  const priceCell = document.createElement('td');
  priceCell.textContent = formatMoney(receipt.purchase_price);
  row.appendChild(priceCell);
  const total = Number(receipt.purchase_price) * Number(receipt.quantity);
  const totalCell = document.createElement('td');
  totalCell.textContent = formatMoney(total);
  row.appendChild(totalCell);
  const paidCell = document.createElement('td');
  paidCell.textContent = formatMoney(receipt.paid_amount);
  row.appendChild(paidCell);
  const debtCell = document.createElement('td');
  debtCell.className = 'admin-receipt-debt';
  debtCell.textContent = formatMoney(Math.max(total - Number(receipt.paid_amount), 0));
  row.appendChild(debtCell);
  const employeeCell = document.createElement('td');
  employeeCell.textContent = receipt.employees ? receipt.employees.full_name : '—';
  row.appendChild(employeeCell);
  return row;
}

// ===== Загружает документы и строит журнал приходов =====
export async function loadReceipts(container) {
  if (!container) return;
  container.innerHTML =
    '<div class="admin-section__heading"><div><h1>Приход</h1><p>Поступление товаров и расчёты с поставщиками</p></div>' +
    '<button class="admin-button admin-button--primary" type="button" data-add-receipt>+ ОФОРМИТЬ ПРИХОД</button></div>' +
    '<p class="admin-receipts-error" data-receipts-error role="status" aria-live="polite"></p>' +
    '<div class="admin-table-wrap"><table class="admin-table admin-receipts-table"><thead><tr>' +
    '<th>Документ</th><th>Поставщик</th><th>Товар</th><th>Количество</th><th>Цена / шт.</th><th>Сумма</th><th>Оплачено</th><th>Долг</th><th>Сотрудник</th>' +
    '</tr></thead><tbody data-receipts-body></tbody></table></div>';

  const body = container.querySelector('[data-receipts-body]');
  const errorBox = container.querySelector('[data-receipts-error]');
  let products = [];
  const reload = async function () {
    errorBox.textContent = '';
    body.innerHTML = '<tr><td class="admin-empty" colspan="9">Загружаем приходные документы…</td></tr>';
    if (!supabaseClient) {
      body.replaceChildren();
      errorBox.textContent = 'Не удалось подключиться к Supabase. Проверь настройки проекта.';
      return;
    }

    try {
      const results = await Promise.all([getReceipts(), getReceiptProducts()]);
      const receipts = results[0];
      products = results[1];
      body.replaceChildren();
      if (!receipts.length) {
        const row = document.createElement('tr');
        const cell = document.createElement('td');
        cell.className = 'admin-empty';
        cell.colSpan = 9;
        cell.textContent = 'Приходных документов пока нет. Нажми «Оформить приход», чтобы записать поступление.';
        row.appendChild(cell);
        body.appendChild(row);
        return;
      }
      receipts.forEach(function (receipt) { body.appendChild(createReceiptRow(receipt)); });
    } catch (error) {
      body.replaceChildren();
      errorBox.textContent = 'Не удалось загрузить приход. ' + (error.message || 'Проверь права доступа и попробуй ещё раз.');
    }
  };

  container.querySelector('[data-add-receipt]').addEventListener('click', function () {
    openReceiptForm(products, reload);
  });
  await reload();
}
