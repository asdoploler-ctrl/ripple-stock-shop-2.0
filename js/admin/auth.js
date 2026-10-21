import { supabaseClient } from '../supabase-client.js';

// ===== Показывает экран входа или админ-панель в зависимости от сессии =====
export function initAuth() {
  const loginScreen = document.querySelector('#login-screen');
  const adminPanel = document.querySelector('#admin-panel');
  const loginForm = document.querySelector('#login-form');
  const loginMessage = document.querySelector('#login-message');
  const logoutButton = document.querySelector('#logout-button');
  const emailLabel = document.querySelector('#admin-email');
  if (!loginScreen || !adminPanel || !loginForm || !loginMessage) return;

  // Переключает экран и при входе показывает адрес администратора.
  function showSession(session) {
    const isLoggedIn = Boolean(session);
    const wasLoggedIn = !adminPanel.hidden;
    loginScreen.hidden = isLoggedIn;
    adminPanel.hidden = !isLoggedIn;
    if (emailLabel && session && session.user) emailLabel.textContent = session.user.email || 'Администратор';
    if (isLoggedIn && !wasLoggedIn) {
      document.dispatchEvent(new CustomEvent('admin:session-ready'));
    }
  }

  // Проверяет текущую сессию при загрузке страницы.
  async function checkSession() {
    if (!supabaseClient) {
      loginMessage.textContent = 'Не загрузился Supabase. Проверь интернет и адрес CDN.';
      return;
    }

    try {
      const { data, error } = await supabaseClient.auth.getSession();
      if (error) {
        loginMessage.textContent = 'Не удалось проверить сессию. Обнови страницу и попробуй ещё раз.';
        return;
      }
      showSession(data.session);
    } catch (error) {
      loginMessage.textContent = 'Нет соединения с Supabase. Проверь интернет и настройки проекта.';
    }
  }

  // Проверяет email и пароль через Supabase Auth.
  loginForm.addEventListener('submit', async function (event) {
    event.preventDefault();
    loginMessage.textContent = '';

    if (!supabaseClient) {
      loginMessage.textContent = 'Supabase не подключён. Укажи URL и anon key в js/supabase-client.js.';
      return;
    }

    const submitButton = loginForm.querySelector('[type="submit"]');
    const email = loginForm.elements.email.value.trim();
    const password = loginForm.elements.password.value;
    if (submitButton) submitButton.disabled = true;

    try {
      const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
      if (error) {
        loginMessage.textContent = 'Не удалось войти. Проверь email и пароль.';
        if (submitButton) submitButton.disabled = false;
        return;
      }

      showSession(data.session);
      loginForm.reset();
    } catch (error) {
      loginMessage.textContent = 'Нет соединения с Supabase. Попробуй ещё раз позже.';
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  });

  // Завершает текущую сессию и возвращает форму входа.
  if (logoutButton) {
    logoutButton.addEventListener('click', async function () {
      if (!supabaseClient) return;
      try {
        const { error } = await supabaseClient.auth.signOut();
        if (error) {
          window.alert('Не удалось выйти. Попробуй ещё раз.');
          return;
        }
        showSession(null);
      } catch (error) {
        window.alert('Не удалось выйти. Попробуй ещё раз.');
      }
    });
  }

  // Если сессию завершили в другой вкладке, также переключает экран.
  if (supabaseClient) {
    supabaseClient.auth.onAuthStateChange(function (_event, session) { showSession(session); });
  }

  checkSession();
}
