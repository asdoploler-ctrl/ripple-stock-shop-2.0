import { supabaseClient } from '../supabase-client.js';
import { openModal } from './modal.js';

// ===== Загружает справочник групп товаров из Supabase =====
async function getGroups() {
  const { data, error } = await supabaseClient.from('product_groups').select('id, name').order('name');
  if (error) throw error;
  return data || [];
}

// ===== Считает количество товаров, которые используют каждую группу =====
async function getProductCounts() {
  const { data, error } = await supabaseClient.from('products').select('group_id');
  if (error) throw error;
  const counts = {};
  (data || []).forEach(function (product) {
    const key = String(product.group_id);
    counts[key] = (counts[key] || 0) + 1;
  });
  return counts;
}

// ===== Открывает общее модальное окно, чтобы создать или изменить группу =====
function openGroupForm(group, reload) {
  openModal(group ? 'Изменить группу' : 'Новая группа', [
    { type: 'text', name: 'name', label: 'Название группы', value: group ? group.name : '', placeholder: 'Например, Футболки', required: true }
  ], async function (values) {
    const name = values.name.trim();
    if (!name) throw new Error('Введи название группы.');

    const query = group
      ? supabaseClient.from('product_groups').update({ name: name }).eq('id', group.id)
      : supabaseClient.from('product_groups').insert({ name: name });
    const { error } = await query;
    if (error) {
      if (error.code === '23505') throw new Error('Группа с таким названием уже существует.');
      throw new Error('Не удалось сохранить группу. ' + error.message);
    }

    if (window.closeAdminModal) window.closeAdminModal();
    await reload();
  });
}

// ===== Удаляет группу, только если её не используют товары =====
async function deleteGroup(group, productCount, reload) {
  if (productCount > 0) {
    window.alert('Нельзя удалить группу «' + group.name + '»: к ней привязано товаров — ' + productCount + '. Сначала перенеси их в другую группу.');
    return;
  }
  if (!window.confirm('Удалить группу «' + group.name + '»?')) return;

  try {
    const { error } = await supabaseClient.from('product_groups').delete().eq('id', group.id);
    if (error) throw error;
    await reload();
  } catch (error) {
    window.alert('Не удалось удалить группу. ' + (error.message || 'Проверь, не используется ли она товарами.'));
  }
}

// ===== Показывает список групп, число товаров и действия управления =====
export async function loadGroups(container) {
  if (!container) return;
  container.innerHTML =
    '<div class="admin-section__heading"><div><h1>Группы</h1><p>Категории товаров в каталоге</p></div>' +
    '<button class="admin-button admin-button--primary" type="button" data-add-group>+ ДОБАВИТЬ</button></div>' +
    '<p class="admin-groups-error" data-groups-error role="status" aria-live="polite"></p>' +
    '<div class="admin-table-wrap"><table class="admin-table admin-groups-table"><thead><tr><th>Название группы</th><th>Товаров</th><th>Действия</th></tr></thead>' +
    '<tbody data-groups-body></tbody></table></div>';

  const body = container.querySelector('[data-groups-body]');
  const errorBox = container.querySelector('[data-groups-error]');
  const reload = async function () {
    errorBox.textContent = '';
    body.innerHTML = '<tr><td class="admin-empty" colspan="3">Загружаем группы…</td></tr>';
    if (!supabaseClient) {
      body.replaceChildren();
      errorBox.textContent = 'Не удалось подключиться к Supabase. Проверь настройки проекта.';
      return;
    }

    try {
      const results = await Promise.all([getGroups(), getProductCounts()]);
      const groups = results[0];
      const counts = results[1];
      body.replaceChildren();
      if (!groups.length) {
        const row = document.createElement('tr');
        const cell = document.createElement('td');
        cell.className = 'admin-empty';
        cell.colSpan = 3;
        cell.textContent = 'Групп пока нет. Добавь первую группу, чтобы назначать её товарам.';
        row.appendChild(cell);
        body.appendChild(row);
        return;
      }

      groups.forEach(function (group) {
        const row = document.createElement('tr');
        const nameCell = document.createElement('td');
        const name = document.createElement('strong');
        name.className = 'admin-product-name';
        name.textContent = group.name;
        nameCell.appendChild(name);
        row.appendChild(nameCell);

        const countCell = document.createElement('td');
        countCell.textContent = String(counts[String(group.id)] || 0);
        row.appendChild(countCell);

        const actions = document.createElement('td');
        actions.className = 'admin-table__actions';
        const editButton = document.createElement('button');
        editButton.className = 'admin-button admin-button--small';
        editButton.type = 'button';
        editButton.textContent = 'Изменить';
        editButton.addEventListener('click', function () { openGroupForm(group, reload); });
        const deleteButton = document.createElement('button');
        deleteButton.className = 'admin-button admin-button--small admin-button--danger';
        deleteButton.type = 'button';
        deleteButton.textContent = 'Удалить';
        deleteButton.addEventListener('click', function () {
          deleteGroup(group, counts[String(group.id)] || 0, reload);
        });
        actions.append(editButton, deleteButton);
        row.appendChild(actions);
        body.appendChild(row);
      });
    } catch (error) {
      body.replaceChildren();
      errorBox.textContent = 'Не удалось загрузить группы. ' + (error.message || 'Проверь доступ и попробуй ещё раз.');
    }
  };

  container.querySelector('[data-add-group]').addEventListener('click', function () { openGroupForm(null, reload); });
  await reload();
}
