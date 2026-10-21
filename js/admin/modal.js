// ===== Создаёт и закрывает одно общее модальное окно формы =====
export function initModal() {
  const modal = document.querySelector('#admin-modal');
  const form = document.querySelector('#modal-form');
  const title = document.querySelector('#modal-title');
  if (!modal || !form || !title) return;

  // Закрывает окно и очищает поля перед следующим открытием.
  function closeModal() {
    modal.hidden = true;
    form.replaceChildren();
  }

  modal.querySelectorAll('[data-modal-close]').forEach(function (button) {
    button.addEventListener('click', closeModal);
  });
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && !modal.hidden) closeModal();
  });

  window.closeAdminModal = closeModal;
}

// ===== Открывает форму с заданными полями и вызывает сохранение =====
export function openModal(modalTitle, fields, onSave) {
  const modal = document.querySelector('#admin-modal');
  const form = document.querySelector('#modal-form');
  const title = document.querySelector('#modal-title');
  if (!modal || !form || !title) return;

  title.textContent = modalTitle;
  form.replaceChildren();
  const values = {};

  fields.forEach(function (field) {
    // Специальное поле показывает уже загруженные фото и позволяет выбрать обложку.
    if (field.type === 'image-manager') {
      const manager = document.createElement('div');
      manager.className = 'admin-field admin-image-manager';
      const caption = document.createElement('span');
      caption.textContent = field.label;
      manager.appendChild(caption);

      const grid = document.createElement('div');
      grid.className = 'admin-image-manager__grid';
      const images = field.images || [];

      if (!images.length) {
        const emptyNote = document.createElement('small');
        emptyNote.className = 'admin-file-note';
        emptyNote.textContent = 'У товара пока нет загруженных фотографий.';
        grid.appendChild(emptyNote);
      }

      images.forEach(function (image, index) {
        const card = document.createElement('div');
        card.className = 'admin-image-card';
        const preview = document.createElement('img');
        preview.src = image.url;
        preview.alt = 'Фотография товара ' + (index + 1);
        card.appendChild(preview);

        const coverLabel = document.createElement('label');
        coverLabel.className = 'admin-image-card__option';
        const coverInput = document.createElement('input');
        coverInput.type = 'radio';
        coverInput.name = 'cover-photo';
        coverInput.value = String(image.id);
        coverInput.checked = index === 0;
        coverLabel.append(coverInput, document.createTextNode('Обложка'));
        card.appendChild(coverLabel);

        const removeLabel = document.createElement('label');
        removeLabel.className = 'admin-image-card__option admin-image-card__option--remove';
        const removeInput = document.createElement('input');
        removeInput.type = 'checkbox';
        removeInput.name = 'remove-photo';
        removeInput.value = String(image.id);
        removeLabel.append(removeInput, document.createTextNode('Удалить фото'));
        card.appendChild(removeLabel);
        grid.appendChild(card);
      });
      manager.appendChild(grid);

      if (field.help) {
        const help = document.createElement('small');
        help.className = 'admin-file-note';
        help.textContent = field.help;
        manager.appendChild(help);
      }
      form.appendChild(manager);
      values[field.name] = function () {
        const cover = manager.querySelector('input[name="cover-photo"]:checked');
        return {
          coverId: cover ? cover.value : null,
          removeIds: Array.from(manager.querySelectorAll('input[name="remove-photo"]:checked')).map(function (input) { return input.value; })
        };
      };
      return;
    }

    const label = document.createElement('label');
    label.className = field.type === 'checkbox' ? 'admin-field admin-field--checkbox' : 'admin-field';
    const input = field.type === 'textarea' ? document.createElement('textarea') : document.createElement('input');
    if (field.type === 'select') {
      const select = document.createElement('select');
      field.options.forEach(function (option) {
        const item = document.createElement('option');
        item.value = option.value;
        item.textContent = option.label;
        select.appendChild(item);
      });
      label.appendChild(select);
      select.name = field.name;
      if (field.required) select.required = true;
      if (field.value) select.value = field.value;
      values[field.name] = function () { return select.value; };
    } else {
      if (field.type !== 'textarea') input.type = field.type || 'text';
      input.name = field.name;
      if (field.type === 'checkbox') input.checked = Boolean(field.value);
      else if (field.type !== 'file' && field.value !== undefined) input.value = field.value;
      if (field.required) input.required = true;
      if (field.accept) input.accept = field.accept;
      if (field.multiple) input.multiple = true;
      if (field.min !== undefined) input.min = field.min;
      if (field.max !== undefined) input.max = field.max;
      if (field.step !== undefined) input.step = field.step;
      if (field.placeholder) input.placeholder = field.placeholder;
      label.appendChild(input);
      values[field.name] = function () {
        if (field.type === 'checkbox') return input.checked;
        if (field.type === 'file') return field.multiple ? Array.from(input.files) : input.files[0] || null;
        return input.value.trim();
      };
    }

    const caption = document.createElement('span');
    caption.textContent = field.label;
    label.insertBefore(caption, label.firstChild);
    if (field.help) {
      const help = document.createElement('small');
      help.className = 'admin-file-note';
      help.textContent = field.help;
      label.appendChild(help);
    }
    form.appendChild(label);
  });

  const error = document.createElement('p');
  error.className = 'admin-modal__error';
  error.setAttribute('role', 'status');
  form.appendChild(error);

  const actions = document.createElement('div');
  actions.className = 'admin-modal__actions';
  actions.innerHTML = '<button class="admin-button" type="button" data-cancel>ОТМЕНА</button><button class="admin-button admin-button--primary" type="submit">СОХРАНИТЬ <span aria-hidden="true">→</span></button>';
  form.appendChild(actions);
  actions.querySelector('[data-cancel]').addEventListener('click', function () {
    if (window.closeAdminModal) window.closeAdminModal();
  });

  // Передаёт значения полей обработчику, который сохраняет их в Supabase.
  form.onsubmit = async function (event) {
    event.preventDefault();
    error.textContent = '';
    const result = {};
    Object.keys(values).forEach(function (key) { result[key] = values[key](); });
    const saveButton = actions.querySelector('[type="submit"]');
    saveButton.disabled = true;
    try {
      await onSave(result, error);
    } catch (saveError) {
      error.textContent = saveError.message || 'Не удалось сохранить данные.';
    } finally {
      saveButton.disabled = false;
    }
  };

  modal.hidden = false;
  const firstField = form.querySelector('input, textarea, select');
  if (firstField) firstField.focus();
}
