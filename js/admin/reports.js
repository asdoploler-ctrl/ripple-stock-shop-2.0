import { supabaseClient } from '../supabase-client.js';

// ===== Форматирует сумму в MDL для таблиц и итогов =====
function money(value) {
  return Number(value || 0).toLocaleString('ru-RU', { maximumFractionDigits: 2 }) + ' MDL';
}

// ===== Преобразует дату из базы в привычный формат =====
function dateText(value) {
  if (!value) return '—';
  return new Date(value + 'T00:00:00').toLocaleDateString('ru-RU');
}

// ===== Загружает поставщиков и сотрудников для фильтров отчётов =====
async function loadReportOptions(container) {
  const [suppliersResult, employeesResult] = await Promise.all([
    supabaseClient.from('receipts').select('supplier').order('supplier'),
    supabaseClient.from('employees').select('id, full_name').order('full_name')
  ]);
  if (suppliersResult.error) throw suppliersResult.error;
  if (employeesResult.error) throw employeesResult.error;
  const suppliers = Array.from(new Set((suppliersResult.data || []).map(function (row) { return row.supplier; })));
  const supplierSelect = container.querySelector('[data-report-supplier]');
  const employeeSelect = container.querySelector('[data-report-employee]');
  supplierSelect.innerHTML = '<option value="">Выбери поставщика</option>' + suppliers.map(function (name) {
    return '<option value="' + escapeHtml(name) + '">' + escapeHtml(name) + '</option>';
  }).join('');
  employeeSelect.innerHTML = '<option value="">Выбери сотрудника</option>' + (employeesResult.data || []).map(function (employee) {
    return '<option value="' + employee.id + '">' + escapeHtml(employee.full_name) + '</option>';
  }).join('');
}

// ===== Защищает подписи из базы перед вставкой в HTML =====
function escapeHtml(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
  });
}

// ===== Строит HTML таблицы и строки итогов для выбранного отчёта =====
function renderReport(container, title, headers, rows, totals, options, result) {
  result = result || container.querySelector('[data-report-result]');
  const headHtml = headers.map(function (header) { return '<th>' + header + '</th>'; }).join('');
  let bodyHtml = '';
  if (!rows.length) {
    bodyHtml = '<tr><td class="admin-empty" colspan="' + headers.length + '">За выбранный период данных нет.</td></tr>';
  } else if (options && options.groupBy) {
    let current = null;
    let subtotal = 0;
    rows.forEach(function (row) {
      if (current !== row[options.groupBy]) {
        if (current !== null) bodyHtml += '<tr class="report-subtotal"><td colspan="' + (headers.length - 1) + '">Итого по группе</td><td>' + subtotal + ' шт.</td></tr>';
        current = row[options.groupBy]; subtotal = 0;
        bodyHtml += '<tr class="report-group"><th colspan="' + headers.length + '">' + escapeHtml(current) + '</th></tr>';
      }
      subtotal += Number(row[options.quantityKey] || 0);
      bodyHtml += '<tr>' + row.cells.map(function (cell) { return '<td>' + cell + '</td>'; }).join('') + '</tr>';
    });
    bodyHtml += '<tr class="report-subtotal"><td colspan="' + (headers.length - 1) + '">Итого по группе</td><td>' + subtotal + ' шт.</td></tr>';
  } else {
    bodyHtml = rows.map(function (row) { return '<tr>' + row.cells.map(function (cell) { return '<td>' + cell + '</td>'; }).join('') + '</tr>'; }).join('');
  }
  if (totals) {
    if (Array.isArray(totals)) {
      bodyHtml += '<tr class="report-total"><th colspan="' + (headers.length - totals.length) + '">ИТОГО</th>' + totals.map(function (value) { return '<th>' + value + '</th>'; }).join('') + '</tr>';
    } else {
      bodyHtml += '<tr class="report-total"><th colspan="' + (headers.length - 1) + '">ИТОГО</th><th>' + totals + '</th></tr>';
    }
  }
  result.innerHTML = '<div class="report-result__heading"><h2>' + escapeHtml(title) + '</h2><button class="admin-button" type="button" data-export-report>СКАЧАТЬ XLSX</button></div>' +
    '<div class="admin-table-wrap"><table class="admin-table"><thead><tr>' + headHtml + '</tr></thead><tbody>' + bodyHtml + '</tbody></table></div>';
  result.dataset.reportTitle = title;
  const exportHeaders = (options && options.exportHeaders) || headers;
  const exportRows = ((options && options.exportRows) || []).slice();
  if (totals && !(options && options.groupBy)) {
    const totalCells = Array.isArray(totals) ? totals : [totals];
    exportRows.push(['ИТОГО'].concat(Array(Math.max(exportHeaders.length - totalCells.length - 1, 0)).fill(''), totalCells));
  }
  result.dataset.exportRows = JSON.stringify(exportRows);
  result.dataset.exportHeaders = JSON.stringify(exportHeaders);
  result.querySelector('[data-export-report]').addEventListener('click', function () { exportReport(result); });
}

// ===== Создаёт и скачивает XLSX-файл из уже показанного отчёта =====
function exportReport(result) {
  if (!window.XLSX) {
    window.alert('Не удалось загрузить экспорт XLSX. Обнови страницу и попробуй ещё раз.');
    return;
  }
  const rows = JSON.parse(result.dataset.exportRows || '[]');
  const headers = JSON.parse(result.dataset.exportHeaders || '[]');
  const sheet = window.XLSX.utils.aoa_to_sheet([headers].concat(rows));
  const book = window.XLSX.utils.book_new();
  window.XLSX.utils.book_append_sheet(book, sheet, 'Отчёт');
  window.XLSX.writeFile(book, result.dataset.reportTitle + '.xlsx');
}

// ===== Загружает данные и формирует один из пяти отчётов =====
async function buildReport(container, type) {
  const isRequirements = type === 'requirements';
  const message = container.querySelector(isRequirements ? '[data-purchase-message]' : '[data-report-message]');
  const result = container.querySelector(isRequirements ? '[data-purchase-result]' : '[data-report-result]');
  const from = container.querySelector('[data-report-from]').value;
  const to = container.querySelector('[data-report-to]').value;
  message.textContent = '';
  result.innerHTML = '<p class="admin-loading">Формируем отчёт…</p>';
  try {
    if (['reconciliation', 'employee-sales', 'receipts', 'sales'].includes(type) && (!from || !to)) {
      throw new Error('Укажи даты начала и конца периода.');
    }
    if (from && to && from > to) throw new Error('Дата начала периода не может быть позже даты окончания.');
    let data, error, headers, rows, title, total;
    const exportRows = [];
    if (type === 'reconciliation') {
      const supplier = container.querySelector('[data-report-supplier]').value;
      if (!supplier) throw new Error('Выбери поставщика.');
      let query = supabaseClient.from('v_supplier_reconciliation').select('*').eq('supplier', supplier).order('doc_date');
      if (from) query = query.gte('doc_date', from);
      if (to) query = query.lte('doc_date', to);
      ({ data, error } = await query);
      title = 'Акт сверки — ' + supplier;
      headers = ['Дата', 'Документ', 'Поставлено', 'Оплачено', 'Долг'];
      rows = (data || []).map(function (item) {
        const cells = [dateText(item.doc_date), '#' + item.doc_number, money(item.delivered), money(item.paid), money(item.debt)];
        exportRows.push(cells); return { cells: cells.map(escapeHtml) };
      });
      total = [money((data || []).reduce((sum, item) => sum + Number(item.delivered || 0), 0)), money((data || []).reduce((sum, item) => sum + Number(item.paid || 0), 0)), money((data || []).reduce((sum, item) => sum + Number(item.debt || 0), 0))];
    } else if (type === 'sales' || type === 'employee-sales') {
      let query = supabaseClient.from('v_sales_report').select('*').order('doc_date').order('doc_number');
      if (from) query = query.gte('doc_date', from);
      if (to) query = query.lte('doc_date', to);
      if (type === 'employee-sales') {
        const employee = container.querySelector('[data-report-employee]').value;
        if (!employee) throw new Error('Выбери сотрудника.');
        const selectedName = container.querySelector('[data-report-employee] option:checked').textContent;
        query = query.eq('employee', selectedName);
        title = 'Реализация — ' + selectedName;
      } else title = 'Ведомость расхода товаров';
      ({ data, error } = await query);
      headers = type === 'sales' ? ['Дата', 'Документ', 'Товар', 'Количество', 'Цена за штуку', 'Сумма', 'Сотрудник'] : ['Дата', 'Документ', 'Товар', 'Количество', 'Цена за штуку', 'Сумма'];
      rows = (data || []).map(function (item) {
        const cells = [dateText(item.doc_date), '#' + item.doc_number, item.product, item.quantity + ' шт.', money(item.price), money(item.amount)];
        if (type === 'sales') cells.push(item.employee);
        exportRows.push(cells); return { cells: cells.map(escapeHtml) };
      });
      const salesTotal = money((data || []).reduce((sum, item) => sum + Number(item.amount || 0), 0));
      total = type === 'sales' ? [salesTotal, '—'] : salesTotal;
    } else if (type === 'receipts') {
      let query = supabaseClient.from('v_receipts_report').select('*').order('doc_date').order('doc_number');
      if (from) query = query.gte('doc_date', from);
      if (to) query = query.lte('doc_date', to);
      ({ data, error } = await query);
      title = 'Ведомость прихода товаров';
      headers = ['Дата', 'Документ', 'Поставщик', 'Товар', 'Количество', 'Цена закупки', 'Сумма'];
      rows = (data || []).map(function (item) {
        const cells = [dateText(item.doc_date), '#' + item.doc_number, item.supplier, item.product, item.quantity + ' шт.', money(item.purchase_price), money(item.amount)];
        exportRows.push(cells); return { cells: cells.map(escapeHtml) };
      });
      total = money((data || []).reduce((sum, item) => sum + Number(item.amount || 0), 0));
    } else if (type === 'stock') {
      const date = container.querySelector('[data-report-stock-date]').value;
      if (!date) throw new Error('Выбери дату остатков.');
      ({ data, error } = await supabaseClient.rpc('stock_on_date', { p_date: date }));
      title = 'Остатки на ' + dateText(date);
      headers = ['Товар', 'Остаток'];
      let exportGroup = null;
      let exportSubtotal = 0;
      rows = (data || []).map(function (item) {
        if (exportGroup !== null && exportGroup !== item.group_name) {
          exportRows.push([exportGroup, 'Итого по группе', exportSubtotal + ' шт.']);
          exportSubtotal = 0;
        }
        exportGroup = item.group_name;
        exportSubtotal += Number(item.quantity || 0);
        const cells = [item.product_name, item.quantity + ' шт.'];
        exportRows.push([item.group_name, ...cells]);
        return { group: item.group_name, quantity: item.quantity, cells: cells.map(escapeHtml) };
      });
      if (exportGroup !== null) exportRows.push([exportGroup, 'Итого по группе', exportSubtotal + ' шт.']);
    } else if (type === 'requirements') {
      ({ data, error } = await supabaseClient.from('v_purchase_requirements').select('*').order('to_buy', { ascending: false }));
      title = 'Рекомендации к закупке';
      headers = ['Группа', 'Продано за 30 дней', 'В наличии', 'Рекомендуется докупить'];
      rows = (data || []).map(function (item) {
        const cells = [item.group_name, item.sold_30d + ' шт.', item.in_stock + ' шт.', item.to_buy + ' шт.'];
        exportRows.push(cells); return { cells: cells.map(escapeHtml) };
      });
    }
    if (error) throw error;
    renderReport(container, title, headers, rows, total, type === 'stock' ? { groupBy: 'group', quantityKey: 'quantity', exportRows: exportRows, exportHeaders: ['Группа', 'Товар', 'Остаток'] } : { exportRows: exportRows }, result);
  } catch (error) {
    result.innerHTML = '';
    message.textContent = error.message || 'Не удалось сформировать отчёт. Проверь подключение и права доступа.';
  }
}

// ===== Показывает формы фильтров и связывает их с загрузкой отчёта =====
export async function loadReports(container) {
  if (!container) return;
  container.innerHTML = '<div class="admin-section__heading"><div><h1>Отчёты</h1><p>Актуальные данные из документов и журнала операций</p></div></div>' +
    '<div class="reports-tabs" role="tablist">' +
    '<button class="reports-tab is-active" data-report-type="reconciliation">Акт сверки</button><button class="reports-tab" data-report-type="employee-sales">Реализация сотрудника</button><button class="reports-tab" data-report-type="stock">Остатки на дату</button><button class="reports-tab" data-report-type="receipts">Ведомость прихода</button><button class="reports-tab" data-report-type="sales">Ведомость расхода</button></div>' +
    '<section class="reports-filter"><label class="admin-field" data-filter-supplier><span>Поставщик</span><select data-report-supplier><option value="">Загрузка…</option></select></label>' +
    '<label class="admin-field" data-filter-employee hidden><span>Сотрудник</span><select data-report-employee><option value="">Загрузка…</option></select></label>' +
    '<label class="admin-field" data-filter-period><span>Дата с</span><input type="date" data-report-from></label><label class="admin-field" data-filter-period-end><span>Дата по</span><input type="date" data-report-to></label>' +
    '<label class="admin-field" data-filter-stock hidden><span>Дата остатков</span><input type="date" data-report-stock-date></label>' +
    '<button class="admin-button admin-button--primary" type="button" data-run-report>СФОРМИРОВАТЬ</button></section>' +
    '<p class="admin-error" data-report-message role="status" aria-live="polite"></p><div class="report-result" data-report-result></div>' +
    '<section class="purchase-requirements"><div><p class="admin-eyebrow">ЗАПАСЫ И СПРОС</p><h2>Требования на закупку</h2><p>Группы, где за последние 30 дней продали больше товаров, чем сейчас есть в наличии.</p></div><button class="admin-button" type="button" data-run-purchase>ПОКАЗАТЬ РЕКОМЕНДАЦИИ</button><p class="admin-error" data-purchase-message role="status" aria-live="polite"></p><div class="report-result" data-purchase-result></div></section>';
  const tabs = Array.from(container.querySelectorAll('[data-report-type]'));
  let activeType = 'reconciliation';
  function setFilters(type) {
    activeType = type;
    tabs.forEach(function (tab) { tab.classList.toggle('is-active', tab.dataset.reportType === type); });
    container.querySelector('[data-filter-supplier]').hidden = type !== 'reconciliation';
    container.querySelector('[data-filter-employee]').hidden = type !== 'employee-sales';
    container.querySelector('[data-filter-period]').hidden = type === 'stock';
    container.querySelector('[data-filter-period-end]').hidden = type === 'stock';
    container.querySelector('[data-filter-stock]').hidden = type !== 'stock';
  }
  tabs.forEach(function (tab) { tab.addEventListener('click', function () { setFilters(tab.dataset.reportType); }); });
  container.querySelector('[data-run-report]').addEventListener('click', function () { buildReport(container, activeType); });
  container.querySelector('[data-run-purchase]').addEventListener('click', function () { buildReport(container, 'requirements'); });
  container.querySelector('[data-report-stock-date]').value = new Date().toISOString().slice(0, 10);
  try {
    if (!supabaseClient) throw new Error('Нет подключения к Supabase. Проверь настройки проекта.');
    await loadReportOptions(container);
  } catch (error) {
    container.querySelector('[data-report-message]').textContent = 'Не удалось загрузить фильтры. ' + (error.message || 'Проверь права доступа.');
  }
  setFilters(activeType);
}
