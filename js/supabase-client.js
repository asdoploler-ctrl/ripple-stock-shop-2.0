// ===== Здесь хранятся адрес проекта Supabase и публичный ключ =====
// Публичный ключ подходит для браузера; секретный service_role key сюда вставлять нельзя.
const SUPABASE_URL = 'https://jclltnufmknqykynyrxy.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_BfE5fvUiBxd5U-UZxPUfzw_SVSMKKP1';

// Создаёт общий клиент, который используют все файлы админ-панели.
export const supabaseClient = window.supabase
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)
  : null;
