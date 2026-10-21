import { supabaseClient } from '../supabase-client.js';

// ===== Превращает тип контакта в понятную подпись =====
function getContactTypeLabel(type) {
  const labels = { telegram: 'Telegram', phone: 'Телефон / WhatsApp', instagram: 'Instagram', other: 'Другой' };
  return labels[type] || 'Другой';
}

// ===== Форматирует дату заявки для таблицы =====
function formatLeadDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

// ===== Показывает контакт ссылкой только для известных способов связи =====
function createLeadContact(lead) {
  const cell = document.createElement('td');
  const value = document.createElement('span');
  value.textContent = lead.contact_value || '—';
  const type = document.createElement('small');
  type.className = 'admin-lead-contact__type';
  type.textContent = getContactTypeLabel(lead.contact_type);
  cell.className = 'admin-lead-contact';

  if (lead.contact_type === 'telegram') {
    const link = document.createElement('a');
    const username = lead.contact_value.replace(/^@/, '');
    link.href = 'https://t.me/' + encodeURIComponent(username);
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = lead.contact_value;
    value.replaceWith(link);
  } else if (lead.contact_type === 'phone') {
    const link = document.createElement('a');
    link.href = 'tel:' + lead.contact_value.replace(/[^+\d]/g, '');
    link.textContent = lead.contact_value;
    value.replaceWith(link);
  } else if (lead.contact_type === 'instagram') {
    const link = document.createElement('a');
    const username = lead.contact_value.replace(/^@/, '');
    link.href = 'https://instagram.com/' + encodeURIComponent(username);
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = lead.contact_value;
    value.replaceWith(link);
  }

  cell.append(value, type);
  return cell;
}

// ===== Создаёт строку с данными заявки и быстрым изменением статуса =====
function createLeadRow(lead, reload) {
  const row = document.createElement('tr');
  const date = document.createElement('td');
  date.className = 'admin-lead-date';
  date.textContent = formatLeadDate(lead.created_at);
  row.appendChild(date);

  const productCell = document.createElement('td');
  const productName = document.createElement('strong');
  productName.className = 'admin-product-name';
  productName.textContent = lead.products ? lead.products.name : 'Товар удалён';
  productCell.appendChild(productName);
  const quantity = document.createElement('small');
  quantity.className = 'admin-product-size';
  quantity.textContent = 'Количество: ' + lead.quantity + ' шт.';
  productCell.appendChild(quantity);
  row.appendChild(productCell);

  const clientCell = document.createElement('td');
  clientCell.textContent = lead.client_name || 'Не указано';
  row.appendChild(clientCell);
  row.appendChild(createLeadContact(lead));

  const commentCell = document.createElement('td');
  commentCell.className = 'admin-lead-comment';
  commentCell.textContent = lead.comment || '—';
  row.appendChild(commentCell);

  const statusCell = document.createElement('td');
  const statusSelect = document.createElement('select');
  statusSelect.className = 'admin-lead-status';
  statusSelect.setAttribute('aria-label', 'Статус заявки');
  [
    { value: 'new', label: 'Новая' },
    { value: 'in_progress', label: 'В работе' }
  ].forEach(function (optionData) {
    const option = document.createElement('option');
    option.value = optionData.value;
    option.textContent = optionData.label;
    statusSelect.appendChild(option);
  });
  if (lead.status === 'closed') {
    const closedOption = document.createElement('option');
    closedOption.value = 'closed';
    closedOption.textContent = 'Закрыта продажей';
    statusSelect.appendChild(closedOption);
    statusSelect.disabled = true;
  }
  statusSelect.value = lead.status;
  statusCell.appendChild(statusSelect);
  row.appendChild(statusCell);

  const actionsCell = document.createElement('td');
  actionsCell.className = 'admin-table__actions';
  const saveButton = document.createElement('button');
  saveButton.className = 'admin-button admin-button--small';
  saveButton.type = 'button';
  saveButton.textContent = 'Сохранить';
  saveButton.disabled = lead.status === 'closed';
  if (lead.status === 'closed') saveButton.title = 'Заявка закрывается только при оформлении продажи';
  saveButton.addEventListener('click', async function () {
    saveButton.disabled = true;
    try {
      const { error } = await supabaseClient.from('leads').update({ status: statusSelect.value }).eq('id', lead.id);
      if (error) throw error;
      await reload();
    } catch (error) {
      window.alert('Не удалось изменить статус заявки. ' + (error.message || 'Попробуй ещё раз.'));
      saveButton.disabled = false;
    }
  });
  actionsCell.appendChild(saveButton);
  row.appendChild(actionsCell);
  return row;
}

// ===== Загружает заявки, связанные товары и строит рабочую таблицу =====
export async function loadLeads(container) {
  if (!container) return;
  container.innerHTML =
    '<div class="admin-section__heading"><div><h1>Заявки</h1><p>Входящие обращения покупателей</p></div>' +
    '<button class="admin-button" type="button" data-refresh-leads>ОБНОВИТЬ</button></div>' +
    '<p class="admin-leads-migration" data-leads-migration hidden>Для заявок с количеством запусти migration-lead-quantity.sql в Supabase SQL Editor. Пока старые заявки считаются по 1 штуке.</p>' +
    '<p class="admin-leads-error" data-leads-error role="status" aria-live="polite"></p>' +
    '<div class="admin-table-wrap"><table class="admin-table admin-leads-table"><thead><tr>' +
    '<th>Дата</th><th>Товар</th><th>Имя</th><th>Контакт</th><th>Комментарий</th><th>Статус</th><th>Действие</th>' +
    '</tr></thead><tbody data-leads-body></tbody></table></div>';

  const body = container.querySelector('[data-leads-body]');
  const errorBox = container.querySelector('[data-leads-error]');
  const migrationNote = container.querySelector('[data-leads-migration]');
  const reload = async function () {
    errorBox.textContent = '';
    migrationNote.hidden = true;
    body.innerHTML = '<tr><td class="admin-empty" colspan="7">Загружаем заявки…</td></tr>';
    if (!supabaseClient) {
      errorBox.textContent = 'Не удалось подключиться к Supabase. Проверь настройки проекта.';
      body.replaceChildren();
      return;
    }

    try {
      let result = await supabaseClient
        .from('leads')
        .select('id, product_id, quantity, client_name, contact_type, contact_value, comment, status, created_at, products(name)')
        .order('created_at', { ascending: false });
      if (result.error && result.error.code === '42703' && result.error.message.includes('leads.quantity')) {
        migrationNote.hidden = false;
        result = await supabaseClient
          .from('leads')
          .select('id, product_id, client_name, contact_type, contact_value, comment, status, created_at, products(name)')
          .order('created_at', { ascending: false });
        if (!result.error) {
          result.data = (result.data || []).map(function (lead) {
            lead.quantity = 1;
            return lead;
          });
        }
      }
      if (result.error) throw result.error;
      const data = result.data;
      body.replaceChildren();
      if (!data || !data.length) {
        const row = document.createElement('tr');
        const cell = document.createElement('td');
        cell.className = 'admin-empty';
        cell.colSpan = 7;
        cell.textContent = 'Заявок пока нет. Новые обращения появятся здесь.';
        row.appendChild(cell);
        body.appendChild(row);
        return;
      }
      data.forEach(function (lead) { body.appendChild(createLeadRow(lead, reload)); });
    } catch (error) {
      body.replaceChildren();
      errorBox.textContent = 'Не удалось загрузить заявки. ' + (error.message || 'Проверь доступ и попробуй ещё раз.');
    }
  };

  container.querySelector('[data-refresh-leads]').addEventListener('click', reload);
  await reload();
}
