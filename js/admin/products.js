import { supabaseClient } from '../supabase-client.js';
import { openModal } from './modal.js';

// ===== Показывает понятную ошибку Supabase в разделе товаров =====
function showProductsError(container, error) {
  const message = error && error.message ? error.message : 'Не удалось загрузить товары.';
  const errorBox = container.querySelector('[data-products-error]');
  if (errorBox) errorBox.textContent = message;
}

// ===== Получает список товаров и названия их групп из базы =====
async function getProducts() {
  const { data, error } = await supabaseClient
    .from('products')
    .select('id, group_id, name, size, description, price, quantity, is_published, product_groups(name), product_images(id, url, sort_order)')
    .order('created_at', { ascending: false });

  if (error) throw error;
  (data || []).forEach(function (product) {
    product.product_images = (product.product_images || []).sort(function (first, second) {
      return first.sort_order - second.sort_order;
    });
  });
  return data || [];
}

// ===== Получает группы, чтобы показать их в таблице и форме =====
async function getProductGroups() {
  const { data, error } = await supabaseClient
    .from('product_groups')
    .select('id, name')
    .order('name');

  if (error) throw error;
  return data || [];
}

// ===== Добавляет ячейку в строку таблицы без вставки HTML из базы =====
function addCell(row, value, className) {
  const cell = document.createElement('td');
  cell.textContent = value == null || value === '' ? '—' : String(value);
  if (className) cell.className = className;
  row.appendChild(cell);
  return cell;
}

// ===== Загружает выбранные файлы и возвращает ссылки с порядком показа =====
async function uploadProductPhotos(productId, files, firstOrder) {
  const uploadedImages = [];
  const imageRows = [];

  try {
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const safeName = file.name.toLowerCase().replace(/[^a-z0-9._-]/g, '-');
      const filePath = productId + '/' + Date.now() + '-' + index + '-' + safeName;
      const { error } = await supabaseClient.storage
        .from('product-photos')
        .upload(filePath, file, { upsert: false, contentType: file.type });

      if (error) throw error;
      uploadedImages.push(filePath);
      const { data } = supabaseClient.storage.from('product-photos').getPublicUrl(filePath);
      imageRows.push({
        product_id: productId,
        url: data.publicUrl,
        sort_order: firstOrder + index
      });
    }
    return { uploadedImages: uploadedImages, imageRows: imageRows };
  } catch (error) {
    if (uploadedImages.length) {
      await supabaseClient.storage.from('product-photos').remove(uploadedImages);
    }
    throw error;
  }
}

// ===== Получает Storage-пути из публичных ссылок фотографий =====
function getPhotoPaths(images) {
  return images.map(function (image) {
    const marker = '/product-photos/';
    const markerIndex = image.url.indexOf(marker);
    return markerIndex === -1 ? null : decodeURIComponent(image.url.slice(markerIndex + marker.length));
  }).filter(Boolean);
}

// ===== Строит строку таблицы с фото, группой, остатком и кнопками действий =====
function createProductRow(product, groups, reload) {
  const row = document.createElement('tr');

  const photoCell = document.createElement('td');
  const coverImage = product.product_images && product.product_images[0];
  if (coverImage) {
    const image = document.createElement('img');
    image.className = 'admin-product-photo';
    image.src = coverImage.url;
    image.alt = 'Фото товара: ' + product.name;
    photoCell.appendChild(image);
  } else {
    const noPhoto = document.createElement('span');
    noPhoto.className = 'admin-product-photo admin-product-photo--empty';
    noPhoto.textContent = '—';
    noPhoto.setAttribute('aria-label', 'Фото не добавлено');
    photoCell.appendChild(noPhoto);
  }
  row.appendChild(photoCell);

  const nameCell = document.createElement('td');
  const name = document.createElement('strong');
  name.className = 'admin-product-name';
  name.textContent = product.name;
  nameCell.appendChild(name);
  if (product.size) {
    const size = document.createElement('small');
    size.className = 'admin-product-size';
    size.textContent = 'Размер: ' + product.size;
    nameCell.appendChild(size);
  }
  row.appendChild(nameCell);
  addCell(row, product.product_groups ? product.product_groups.name : '—');
  addCell(row, Number(product.price).toLocaleString('ru-RU') + ' MDL');
  addCell(row, product.quantity);

  const statusCell = document.createElement('td');
  const status = document.createElement('span');
  status.className = product.is_published ? 'admin-status' : 'admin-status admin-status--hidden';
  status.textContent = product.is_published ? 'Опубликован' : 'Скрыт';
  statusCell.appendChild(status);
  row.appendChild(statusCell);

  const actionsCell = document.createElement('td');
  actionsCell.className = 'admin-table__actions';
  const editButton = document.createElement('button');
  editButton.className = 'admin-button admin-button--small';
  editButton.type = 'button';
  editButton.textContent = 'Изменить';
  editButton.addEventListener('click', function () {
    openProductForm(groups, product, reload);
  });

  const deleteButton = document.createElement('button');
  deleteButton.className = 'admin-button admin-button--small admin-button--danger';
  deleteButton.type = 'button';
  deleteButton.textContent = 'Удалить';
  deleteButton.addEventListener('click', function () {
    deleteProduct(product, reload);
  });

  actionsCell.append(editButton, deleteButton);
  row.appendChild(actionsCell);
  return row;
}

// ===== Показывает общую форму для добавления или изменения товара =====
function openProductForm(groups, product, reload) {
  const fields = [
    { type: 'text', name: 'name', label: 'Название', value: product ? product.name : '', required: true },
    { type: 'text', name: 'size', label: 'Размер (например, L или One size)', value: product ? product.size || '' : '' },
    {
      type: 'select', name: 'group_id', label: 'Группа', value: product ? product.group_id : '', required: true,
      options: [{ value: '', label: 'Выбери группу' }].concat(groups.map(function (group) {
        return { value: String(group.id), label: group.name };
      }))
    },
    { type: 'textarea', name: 'description', label: 'Описание', value: product ? product.description || '' : '' },
    { type: 'number', name: 'price', label: 'Цена (MDL)', value: product ? product.price : '', required: true },
    {
      type: 'image-manager', name: 'image_changes', label: 'Загруженные фотографии',
      images: product ? product.product_images || [] : [],
      help: 'Отметь нужную обложку и фотографии, которые нужно удалить.'
    },
    {
      type: 'file', name: 'photos', label: 'Фотографии товара', accept: 'image/*', multiple: true,
      help: 'Можно выбрать сразу несколько новых фотографий. Они добавятся в галерею.'
    },
    { type: 'checkbox', name: 'is_published', label: 'Показывать в каталоге', value: product ? product.is_published : true }
  ];

  openModal(product ? 'Изменить товар' : 'Новый товар', fields, async function (values, errorBox) {
    if (!supabaseClient) throw new Error('Клиент Supabase не запущен. Проверь подключение в admin.html.');
    if (values.price === '' || Number(values.price) < 0) {
      errorBox.textContent = 'Укажи цену не меньше нуля.';
      return;
    }

    let productId = product ? product.id : null;
    let createdProduct = false;
    let uploadedImages = [];
    try {
      const productData = {
        name: values.name,
        size: values.size || null,
        group_id: Number(values.group_id),
        description: values.description || null,
        price: Number(values.price),
        is_published: values.is_published
      };

      if (product) {
        const { error } = await supabaseClient.from('products').update(productData).eq('id', product.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabaseClient.from('products').insert(productData).select('id').single();
        if (error) throw error;
        productId = data.id;
        createdProduct = true;
      }

      // Удаляет отмеченные фото из таблицы и Storage, затем оставшимся назначает порядок.
      let keptImages = product ? (product.product_images || []).slice() : [];
      if (product) {
        const removeIds = values.image_changes.removeIds;
        const removedImages = keptImages.filter(function (image) { return removeIds.includes(String(image.id)); });
        if (removeIds.length) {
          const { error } = await supabaseClient.from('product_images').delete().in('id', removeIds);
          if (error) throw error;
          keptImages = keptImages.filter(function (image) { return !removeIds.includes(String(image.id)); });

          const removedPaths = getPhotoPaths(removedImages);
          if (removedPaths.length) {
            const { error: storageError } = await supabaseClient.storage.from('product-photos').remove(removedPaths);
            if (storageError) window.alert('Фото удалено из галереи, но файл не удалось убрать из Storage: ' + storageError.message);
          }
        }

        const chosenCover = keptImages.find(function (image) { return String(image.id) === values.image_changes.coverId; });
        if (chosenCover) {
          keptImages = [chosenCover].concat(keptImages.filter(function (image) { return image.id !== chosenCover.id; }));
        }
        for (let index = 0; index < keptImages.length; index += 1) {
          const { error } = await supabaseClient.from('product_images')
            .update({ sort_order: index }).eq('id', keptImages[index].id);
          if (error) throw error;
        }
      }

      if (values.photos.length) {
        const firstOrder = keptImages.length;
        const uploadResult = await uploadProductPhotos(productId, values.photos, firstOrder);
        uploadedImages = uploadResult.uploadedImages;
        const { error } = await supabaseClient.from('product_images').insert(uploadResult.imageRows);
        if (error) throw error;
      }

      // Если при редактировании все старые фото удалили, первая новая фотография станет обложкой.
      if (product && keptImages.length === 0 && values.photos.length) {
        const { error } = await supabaseClient.from('product_images')
          .update({ sort_order: 0 }).eq('product_id', productId).eq('sort_order', 0);
        if (error) throw error;
      }

      if (window.closeAdminModal) window.closeAdminModal();
      await reload();
    } catch (error) {
      // При ошибке убирает новые файлы и товар, который не удалось завершить.
      if (uploadedImages.length) {
        await supabaseClient.storage.from('product-photos').remove(uploadedImages);
      }
      if (createdProduct && productId) {
        await supabaseClient.from('products').delete().eq('id', productId);
      }
      throw error;
    }
  });
}

// ===== Удаляет товар после подтверждения пользователем =====
async function deleteProduct(product, reload) {
  if (!window.confirm('Удалить товар «' + product.name + '»?')) return;

  const { error } = await supabaseClient.from('products').delete().eq('id', product.id);
  if (error) {
    window.alert('Не удалось удалить товар. Возможно, он используется в заявках или документах. ' + error.message);
    return;
  }

  const photoPaths = getPhotoPaths(product.product_images || []);
  if (photoPaths.length) {
    const { error: storageError } = await supabaseClient.storage.from('product-photos').remove(photoPaths);
    if (storageError) {
      window.alert('Товар удалён, но часть фотографий не удалось удалить из Storage: ' + storageError.message);
    }
  }
  await reload();
}

// ===== Загружает товары и отображает таблицу раздела =====
export async function loadProducts(container) {
  if (!container) return;

  container.innerHTML =
    '<div class="admin-section__heading"><div><h1>Товары</h1><p>Список товаров магазина</p></div>' +
    '<button class="admin-button admin-button--primary" type="button" data-add-product>+ Добавить</button></div>' +
    '<p class="admin-products-error" data-products-error role="status" aria-live="polite"></p>' +
    '<div class="admin-table-wrap"><table class="admin-table"><thead><tr>' +
    '<th>Фото</th><th>Название</th><th>Группа</th><th>Цена</th><th>Остаток</th><th>Каталог</th><th>Действия</th>' +
    '</tr></thead><tbody data-products-body></tbody></table></div>';

  const errorBox = container.querySelector('[data-products-error]');
  const body = container.querySelector('[data-products-body]');
  const reload = async function () {
    try {
      const [products, groups] = await Promise.all([getProducts(), getProductGroups()]);
      body.replaceChildren();
      if (!products.length) {
        const row = document.createElement('tr');
        const emptyCell = document.createElement('td');
        emptyCell.className = 'admin-empty';
        emptyCell.colSpan = 7;
        emptyCell.textContent = 'Товаров пока нет. Нажми «Добавить», чтобы создать первый.';
        row.appendChild(emptyCell);
        body.appendChild(row);
      } else {
        products.forEach(function (product) {
          body.appendChild(createProductRow(product, groups, reload));
        });
      }
    } catch (error) {
      showProductsError(container, error);
    }
  };

  container.querySelector('[data-add-product]').addEventListener('click', async function () {
    try {
      const groups = await getProductGroups();
      if (!groups.length) {
        errorBox.textContent = 'Сначала добавь хотя бы одну группу в таблицу product_groups.';
        return;
      }
      openProductForm(groups, null, reload);
    } catch (error) {
      showProductsError(container, error);
    }
  });

  await reload();
}

// ===== Оставляет точку входа для будущих функций раздела товаров =====
export function initProducts() {
  // Раздел и его события создаются при переходе в «Товары».
}
