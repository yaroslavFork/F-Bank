// F-BANK / Forklandia
// Аутентификация через таблицу users (Supabase Auth НЕ используется)

import { CONFIG } from './config.js';
import { getSupabaseClient } from './supabase.js';

const SESSION_KEY = 'fbank_session';

/**
 * Логин по username + password.
 * Пароли хранятся в открытом виде в таблице users (по требованиям проекта).
 * Возвращает объект пользователя или бросает ошибку.
 */
export async function login(username, password) {
  const client = getSupabaseClient();

  let data, error;
  try {
    const result = await client
      .from(CONFIG.TABLES.USERS)
      .select('*')
      .eq('username', username)
      .maybeSingle();
    data = result.data;
    error = result.error;
  } catch (networkError) {
    // Запрос вообще не дошёл до ответа (сеть/DPI/таймаут AbortController в supabase.js)
    console.error('[Forklandia] Сетевая ошибка при логине:', networkError.name, networkError.message, networkError);
    throw new Error(networkError.message || 'Сервер не отвечает');
  }

  if (error) {
    console.error('[Forklandia] Ошибка Supabase при логине:', {
      message: error.message,
      status: error.status,
      code: error.code,
      details: error.details,
      hint: error.hint
    });
    throw new Error(error.message || `Ошибка сервера (код ${error.code || error.status || '?'})`);
  }

  if (!data) {
    throw new Error('Неверный логин или пароль');
  }

  if (data.password !== password) {
    throw new Error('Неверный логин или пароль');
  }

  setSession(data);
  return data;
}

/**
 * Сохраняет текущего пользователя в sessionStorage
 */
export function setSession(user) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(user));
}

/**
 * Возвращает текущего пользователя из sessionStorage или null
 */
export function getSession() {
  const raw = sessionStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

/**
 * Обновляет данные пользователя в сессии (например, после изменения баланса)
 */
export function updateSessionUser(partialUser) {
  const current = getSession();
  if (!current) return;
  const updated = { ...current, ...partialUser };
  setSession(updated);
}

/**
 * Проверяет, является ли текущий пользователь администратором
 */
export function isAdmin(user) {
  return !!user && user.username === 'admin' && user.role === CONFIG.ROLES.ADMIN;
}

/**
 * Очищает сессию (логика отписки от realtime — в realtime.js, вызывается отдельно)
 */
export function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

/**
 * Перечитывает актуальные данные пользователя из БД (например, при старте приложения)
 */
export async function refreshCurrentUser() {
  const session = getSession();
  if (!session) return null;

  const client = getSupabaseClient();

  let data, error;
  try {
    const result = await client
      .from(CONFIG.TABLES.USERS)
      .select('*')
      .eq('username', session.username)
      .maybeSingle();
    data = result.data;
    error = result.error;
  } catch (networkError) {
    console.error('[Forklandia] Сетевая ошибка при проверке сессии:', networkError.name, networkError.message, networkError);
    // Пробрасываем ошибку наверх, а не тихо разлогиниваем человека —
    // иначе на медленной/заблокированной сети он просто увидит экран логина
    // без объяснения причины.
    throw new Error(networkError.message || 'Сервер не отвечает');
  }

  if (error) {
    console.error('[Forklandia] Ошибка Supabase при проверке сессии:', {
      message: error.message,
      status: error.status,
      code: error.code,
      details: error.details,
      hint: error.hint
    });
    throw new Error(error.message || `Ошибка сервера (код ${error.code || error.status || '?'})`);
  }

  if (!data) {
    // Пользователь реально не найден в базе (например, удалён администратором) —
    // это не сетевая ошибка, тут можно спокойно разлогинить
    clearSession();
    return null;
  }

  setSession(data);
  return data;
}
