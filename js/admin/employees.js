import { supabaseClient } from '../supabase-client.js';
import { openModal } from './modal.js';

// ===== Загружает профили сотрудников из таблицы employees =====
async function getEmployees() {
  const { data, error } = await supabaseClient
    .from('employees')
    .select('id, user_id, full_name, position, phone')
    .order('full_name');
  if (error) throw error;
  return data || [];
}

// ===== Показывает форму профиля и сохраняет изменения в базе =====
function openEmployeeForm(employee, currentUserId, reload) {
  const fields = [
    { type: 'text', name: 'full_name', label: 'Имя сотрудника', value: employee ? employee.full_name : '', placeholder: 'Имя и фамилия', required: true },
    { type: 'text', name: 'position', label: 'Должность', value: employee ? employee.position || '' : '', placeholder: 'Например, менеджер' },
    { type: 'tel', name: 'phone', label: 'Телефон', value: employee ? employee.phone || '' : '', placeholder: '+373 …' }
  ];

  // Собственную связь с Auth нельзя менять, чтобы случайно не закрыть себе доступ.
  const isOwnProfile = employee && employee.user_id === currentUserId;
  if (!isOwnProfile) {
    fields.push({
      type: 'text', name: 'user_id', label: 'UUID пользователя Supabase Auth',
      value: employee ? employee.user_id || '' : '',
      placeholder: 'Например, 123e4567-e89b-12d3-a456-426614174000',
      help: 'Необязательно. Создай аккаунт в Supabase Auth и вставь его UUID, чтобы связать его с профилем.'
    });
  }

  openModal(employee ? 'Профиль сотрудника' : 'Новый сотрудник', fields, async function (values) {
    const fullName = values.full_name.trim();
    const userId = isOwnProfile ? employee.user_id : (values.user_id || '').trim() || null;
    if (!fullName) throw new Error('Укажи имя сотрудника.');
    if (userId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
      throw new Error('UUID должен быть в формате 123e4567-e89b-12d3-a456-426614174000.');
    }

    const employeeData = {
      full_name: fullName,
      position: values.position || null,
      phone: values.phone || null,
      user_id: userId
    };
    const query = employee
      ? supabaseClient.from('employees').update(employeeData).eq('id', employee.id)
      : supabaseClient.from('employees').insert(employeeData);
    const { error } = await query;
    if (error) {
      if (error.code === '23505') throw new Error('Этот Auth UUID уже привязан к другому профилю.');
      if (error.code === '23503') throw new Error('Пользователь с таким UUID не найден в Supabase Auth.');
      throw new Error('Не удалось сохранить профиль. ' + error.message);
    }

    if (window.closeAdminModal) window.closeAdminModal();
    await reload();
  });
}

// ===== Удаляет профиль, кроме записи текущего администратора =====
async function deleteEmployee(employee, currentUserId, reload) {
  if (employee.user_id && employee.user_id === currentUserId) {
    window.alert('Нельзя удалить свой профиль сотрудника, пока ты вошёл в админ-панель.');
    return;
  }
  if (!window.confirm('Удалить сотрудника «' + employee.full_name + '»?')) return;

  try {
    const { error } = await supabaseClient.from('employees').delete().eq('id', employee.id);
    if (error) throw error;
    await reload();
  } catch (error) {
    window.alert('Не удалось удалить сотрудника. Возможно, он указан в приходах, расходах или операциях. ' + (error.message || ''));
  }
}

// ===== Показывает сотрудников, их Auth-связь и кнопки управления =====
export async function loadEmployees(container) {
  if (!container) return;
  container.innerHTML =
    '<div class="admin-section__heading"><div><h1>Сотрудники</h1><p>Профили команды и доступ к панели</p></div>' +
    '<button class="admin-button admin-button--primary" type="button" data-add-employee>+ ДОБАВИТЬ</button></div>' +
    '<p class="admin-employees-hint">Аккаунты создаются в Supabase Auth. Здесь добавляется профиль, который можно связать с аккаунтом по UUID.</p>' +
    '<p class="admin-employees-error" data-employees-error role="status" aria-live="polite"></p>' +
    '<div class="admin-table-wrap"><table class="admin-table admin-employees-table"><thead><tr>' +
    '<th>Сотрудник</th><th>Должность</th><th>Телефон</th><th>Доступ</th><th>Действия</th>' +
    '</tr></thead><tbody data-employees-body></tbody></table></div>';

  const body = container.querySelector('[data-employees-body]');
  const errorBox = container.querySelector('[data-employees-error]');
  let currentUserId = null;
  if (supabaseClient) {
    try {
      const { data, error } = await supabaseClient.auth.getUser();
      if (error) throw error;
      currentUserId = data && data.user ? data.user.id : null;
    } catch (error) {
      errorBox.textContent = 'Не удалось проверить текущую сессию. Обнови страницу и войди снова.';
      return;
    }
  }

  const reload = async function () {
    errorBox.textContent = '';
    body.innerHTML = '<tr><td class="admin-empty" colspan="5">Загружаем сотрудников…</td></tr>';
    if (!supabaseClient) {
      body.replaceChildren();
      errorBox.textContent = 'Не удалось подключиться к Supabase. Проверь настройки проекта.';
      return;
    }

    try {
      const employees = await getEmployees();
      body.replaceChildren();
      if (!employees.length) {
        const row = document.createElement('tr');
        const cell = document.createElement('td');
        cell.className = 'admin-empty';
        cell.colSpan = 5;
        cell.textContent = 'Профилей сотрудников пока нет.';
        row.appendChild(cell);
        body.appendChild(row);
        return;
      }

      employees.forEach(function (employee) {
        const row = document.createElement('tr');
        const nameCell = document.createElement('td');
        const name = document.createElement('strong');
        name.className = 'admin-product-name';
        name.textContent = employee.full_name;
        nameCell.appendChild(name);
        if (employee.user_id) {
          const uuid = document.createElement('small');
          uuid.className = 'admin-employee-uuid';
          uuid.textContent = 'Auth: ' + employee.user_id;
          uuid.title = employee.user_id;
          nameCell.appendChild(uuid);
        }
        row.appendChild(nameCell);

        const positionCell = document.createElement('td');
        positionCell.textContent = employee.position || '—';
        row.appendChild(positionCell);
        const phoneCell = document.createElement('td');
        phoneCell.textContent = employee.phone || '—';
        row.appendChild(phoneCell);

        const accessCell = document.createElement('td');
        const access = document.createElement('span');
        access.className = employee.user_id ? 'admin-status' : 'admin-status admin-status--hidden';
        access.textContent = employee.user_id ? 'Связан' : 'Не связан';
        accessCell.appendChild(access);
        row.appendChild(accessCell);

        const actions = document.createElement('td');
        actions.className = 'admin-table__actions';
        const editButton = document.createElement('button');
        editButton.className = 'admin-button admin-button--small';
        editButton.type = 'button';
        editButton.textContent = 'Изменить';
        editButton.addEventListener('click', function () { openEmployeeForm(employee, currentUserId, reload); });
        const deleteButton = document.createElement('button');
        deleteButton.className = 'admin-button admin-button--small admin-button--danger';
        deleteButton.type = 'button';
        deleteButton.textContent = 'Удалить';
        if (employee.user_id && employee.user_id === currentUserId) {
          deleteButton.disabled = true;
          deleteButton.title = 'Нельзя удалить собственный профиль';
        } else {
          deleteButton.addEventListener('click', function () { deleteEmployee(employee, currentUserId, reload); });
        }
        actions.append(editButton, deleteButton);
        row.appendChild(actions);
        body.appendChild(row);
      });
    } catch (error) {
      body.replaceChildren();
      errorBox.textContent = 'Не удалось загрузить сотрудников. ' + (error.message || 'Проверь права доступа и попробуй ещё раз.');
    }
  };

  container.querySelector('[data-add-employee]').addEventListener('click', function () {
    openEmployeeForm(null, currentUserId, reload);
  });
  await reload();
}
