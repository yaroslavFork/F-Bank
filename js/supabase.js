// F-BANK / Forklandia
// Динамическая загрузка Supabase SDK (без <script src="..."> в HTML)
// и создание единого клиента для всего приложения.
//
// Используется несколько резервных CDN: у части мобильных провайдеров
// cdn.jsdelivr.net бывает медленным или недоступным — тогда автоматически
// пробуется следующий источник.
//
// ВАЖНО про сетевые запросы к самому Supabase (не к CDN):
// у некоторых мобильных операторов встречается DPI/прозрачный прокси,
// который ломает CORS preflight (OPTIONS) для запросов с заголовками
// apikey/Authorization — при этом обычный GET напрямую в браузере
// (просто открыть https://xxx.supabase.co) работает, а fetch с этими
// заголовками из JS — зависает без ответа. VPN обходит эту прослойку,
// поэтому там всё работает. Починить прокси/DPI провайдера мы не можем,
// но можем: (1) не резать реальный запрос слишком рано и не глотать
// настоящую причину ошибки, (2) реально обрывать fetch через
// AbortController, если ответа так и не пришло, чтобы UI не висел вечно.

import { CONFIG } from './config.js';

let supabaseClient = null;

const SDK_SOURCES = [
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js',
  'https://unpkg.com/@supabase/supabase-js@2/dist/umd/supabase.js'
];

const PER_SOURCE_TIMEOUT_MS = Math.max(8000, Math.floor(CONFIG.SDK_LOAD_TIMEOUT_MS / 2));

// Таймаут на каждый отдельный сетевой запрос к Supabase (не на весь логин целиком)
const FETCH_TIMEOUT_MS = 30000;

function loadScript(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = url;
    script.async = true;

    const timeoutId = setTimeout(() => {
      script.onload = null;
      script.onerror = null;
      reject(new Error(`Timeout loading ${url}`));
    }, timeoutMs);

    script.onload = () => {
      clearTimeout(timeoutId);
      if (window.supabase && typeof window.supabase.createClient === 'function') {
        resolve();
      } else {
        reject(new Error(`Loaded but createClient missing from ${url}`));
      }
    };

    script.onerror = () => {
      clearTimeout(timeoutId);
      reject(new Error(`Failed to load ${url}`));
    };

    document.head.appendChild(script);
  });
}

/**
 * Динамически загружает Supabase SDK, перебирая резервные CDN по очереди.
 */
export async function loadSupabaseSDK() {
  if (window.supabase && typeof window.supabase.createClient === 'function') {
    return;
  }

  let lastError = null;

  for (const url of SDK_SOURCES) {
    try {
      await loadScript(url, PER_SOURCE_TIMEOUT_MS);
      return;
    } catch (e) {
      console.error('[Forklandia] Не удалось загрузить Supabase SDK с', url, e);
      lastError = e;
      // пробуем следующий источник
    }
  }

  throw lastError || new Error('Supabase SDK load failed from all sources');
}

/**
 * Собственная реализация fetch с реальным сетевым таймаутом через AbortController.
 * Передаётся в createClient как global.fetch, поэтому ЛЮБОЙ запрос
 * supabase-js (auth, rest, realtime handshake) будет реально оборван,
 * если сервер не ответил за FETCH_TIMEOUT_MS — вместо бесконечного "висения".
 * В консоль всегда пишется подробность ошибки (имя, сообщение, статус).
 */
function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  // Если вызывающий код уже передал свой signal — уважаем оба:
  // прерываем и по внешнему abort, и по нашему таймауту.
  if (options.signal) {
    options.signal.addEventListener('abort', () => controller.abort());
  }

  return fetch(url, { ...options, signal: controller.signal })
    .catch((err) => {
      if (err.name === 'AbortError') {
        console.error('[Forklandia] Запрос к Supabase не получил ответ за', FETCH_TIMEOUT_MS, 'мс:', url);
        throw new Error('Сервер не отвечает');
      }
      console.error('[Forklandia] Сетевая ошибка запроса к Supabase:', url, err.name, err.message);
      throw err;
    })
    .finally(() => clearTimeout(timeoutId));
}

/**
 * Возвращает единый экземпляр Supabase-клиента.
 * Должен вызываться только после успешного loadSupabaseSDK().
 */
export function getSupabaseClient() {
  if (!supabaseClient) {
    supabaseClient = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false
      },
      global: {
        fetch: fetchWithTimeout
      }
    });
  }
  return supabaseClient;
}
