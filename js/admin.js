// F-BANK / Forklandia
// Админ-панель. Доступна только username === 'admin' && role === 'admin'

import { CONFIG } from './config.js';
import { getSupabaseClient } from './supabase.js';
import { generateCardNumber, generateCitizenId } from './utils.js';

const TABLES = CONFIG.TABLES;

/* ==================== СОЗДАНИЕ ГРАЖДАНИНА ==================== */

/**
 * Создаёт нового гражданина.
 * Автоматически генерирует card_number и user_id (Citizen ID).
 */
export async function createCitizen({ username, password, balance, city }) {
  const client = getSupabaseClient();

  if (!username || !password) {
    throw new Error('Логин и пароль обязательны');
  }

  const { data: existing, error: existingError } = await client
    .from(TABLES.USERS)
    .select('id')
    .eq('username', username)
    .maybeSingle();

  if (existingError) {
    throw new Error('Ошибка проверки логина');
  }

  if (existing) {
    throw new Error('Пользователь с таким логином уже существует');
  }

  const { data, error } = await client
    .from(TABLES.USERS)
    .insert({
      username,
      password,
      role: CONFIG.ROLES.CITIZEN,
      balance: Number(balance) || 0,
      card_number: generateCardNumber(),
      city: city || '',
      joined: new Date().toISOString(),
      user_id: generateCitizenId(),
      frozen: false
    })
    .select()
    .maybeSingle();

  if (error) {
    throw new Error('Не удалось создать гражданина');
  }

  return data;
}

/* ==================== КОРРЕКТИРОВКА БАЛАНСА ==================== */

/**
 * Корректирует баланс гражданина.
 * amount > 0 — пополнение, amount < 0 — списание.
 */
export async function adjustBalance(username, amount, description) {
  const client = getSupabaseClient();
  const delta = Number(amount);

  if (!delta) {
    throw new Error('Введите сумму корректировки');
  }

  const { data: user, error: userError } = await client
    .from(TABLES.USERS)
    .select('*')
    .eq('username', username)
    .maybeSingle();

  if (userError || !user) {
    throw new Error('Гражданин не найден');
  }

  const newBalance = Number(user.balance) + delta;

  const { error: updateError } = await client
    .from(TABLES.USERS)
    .update({ balance: newBalance })
    .eq('username', username);

  if (updateError) {
    throw new Error('Не удалось изменить баланс');
  }

  await client.from(TABLES.TRANSACTIONS).insert({
    username,
    type: delta > 0 ? 'deposit' : 'withdrawal',
    description: description || (delta > 0 ? 'Пополнение администратором' : 'Списание администратором'),
    amount: delta,
    date: new Date().toISOString()
  });

  return newBalance;
}

/* ==================== ЗАДАНИЯ ==================== */

/**
 * Создаёт новое задание. max_takers = 0 означает "без ограничений".
 */
export async function createTask({ title, description, reward, max_takers }) {
  const client = getSupabaseClient();

  if (!title) {
    throw new Error('Введите название задания');
  }

  const { data, error } = await client
    .from(TABLES.TASKS)
    .insert({
      title,
      description: description || '',
      reward: Number(reward) || 0,
      max_takers: Number(max_takers) || 0,
      active: true,
      created_at: new Date().toISOString()
    })
    .select()
    .maybeSingle();

  if (error) {
    throw new Error('Не удалось создать задание');
  }

  return data;
}

/**
 * Список всех заданий вместе с их участниками (для админ-панели)
 */
export async function listTasksWithTakers() {
  const client = getSupabaseClient();

  const [{ data: tasks, error: tasksError }, { data: takers, error: takersError }] = await Promise.all([
    client.from(TABLES.TASKS).select('*').order('created_at', { ascending: false }),
    client.from(TABLES.TASK_TAKERS).select('*')
  ]);

  if (tasksError) {
    throw new Error('Не удалось загрузить задания');
  }

  if (takersError) {
    throw new Error('Не удалось загрузить участников');
  }

  return (tasks || []).map((task) => ({
    ...task,
    takers: (takers || []).filter((t) => t.task_id === task.id)
  }));
}

export async function setTaskActive(taskId, active) {
  const client = getSupabaseClient();
  const { error } = await client.from(TABLES.TASKS).update({ active }).eq('id', taskId);
  if (error) throw new Error('Не удалось изменить статус задания');
}

/**
 * Полностью удаляет задание вместе со всеми записями об участниках
 */
export async function deleteTask(taskId) {
  const client = getSupabaseClient();

  await client.from(TABLES.TASK_TAKERS).delete().eq('task_id', taskId);

  const { error } = await client.from(TABLES.TASKS).delete().eq('id', taskId);

  if (error) {
    throw new Error('Не удалось удалить задание');
  }
}

/* ==================== ПРОМОКОДЫ ==================== */

function generatePromoCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = 'FK-';
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

/**
 * Создаёт новый промокод.
 * Если customCode указан — используется он (проверяется на уникальность и приводится к верхнему регистру).
 * Если не указан — код генерируется автоматически, как раньше.
 */
export async function createPromoCode({ amount, max_uses, customCode }) {
  const client = getSupabaseClient();

  let code = customCode ? String(customCode).trim().toUpperCase() : '';

  if (code) {
    const { data: existing, error: existingError } = await client
      .from(TABLES.PROMOCODES)
      .select('id')
      .eq('code', code)
      .maybeSingle();

    if (existingError) {
      throw new Error('Ошибка проверки промокода');
    }

    if (existing) {
      throw new Error('Промокод с таким названием уже существует');
    }
  } else {
    code = generatePromoCode();
  }

  const { data, error } = await client
    .from(TABLES.PROMOCODES)
    .insert({
      code,
      amount: Number(amount) || 0,
      max_uses: Number(max_uses) || 0,
      used_count: 0,
      active: true,
      created_at: new Date().toISOString()
    })
    .select()
    .maybeSingle();

  if (error) {
    throw new Error('Не удалось создать промокод');
  }

  return data;
}

export async function listPromoCodes() {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from(TABLES.PROMOCODES)
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error('Не удалось загрузить промокоды');
  }

  return data || [];
}

export async function setPromoCodeActive(promoId, active) {
  const client = getSupabaseClient();
  const { error } = await client
    .from(TABLES.PROMOCODES)
    .update({ active })
    .eq('id', promoId);

  if (error) {
    throw new Error('Не удалось изменить статус промокода');
  }
}

export async function deletePromoCode(promoId) {
  const client = getSupabaseClient();

  const { data: promo } = await client
    .from(TABLES.PROMOCODES)
    .select('code')
    .eq('id', promoId)
    .maybeSingle();

  if (promo) {
    await client.from(TABLES.PROMO_USES).delete().eq('code', promo.code);
  }

  const { error } = await client.from(TABLES.PROMOCODES).delete().eq('id', promoId);

  if (error) {
    throw new Error('Не удалось удалить промокод');
  }
}

/* ==================== ГРАЖДАНЕ ==================== */

export async function listCitizens() {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from(TABLES.USERS)
    .select('*')
    .neq('username', 'admin')
    .order('joined', { ascending: false });

  if (error) {
    throw new Error('Не удалось загрузить список граждан');
  }

  return data || [];
}

export async function freezeCitizen(username) {
  const client = getSupabaseClient();
  const { error } = await client
    .from(TABLES.USERS)
    .update({ frozen: true })
    .eq('username', username);

  if (error) {
    throw new Error('Не удалось заморозить аккаунт');
  }
}

export async function unfreezeCitizen(username) {
  const client = getSupabaseClient();
  const { error } = await client
    .from(TABLES.USERS)
    .update({ frozen: false })
    .eq('username', username);

  if (error) {
    throw new Error('Не удалось разморозить аккаунт');
  }
}

/**
 * Полностью удаляет гражданина: транзакции, использования промокодов,
 * участия в заданиях и саму запись пользователя.
 */
export async function deleteCitizenCascade(username) {
  const client = getSupabaseClient();

  await client.from(TABLES.TRANSACTIONS).delete().eq('username', username);
  await client.from(TABLES.PROMO_USES).delete().eq('username', username);
  await client.from(TABLES.TASK_TAKERS).delete().eq('username', username);

  const { error } = await client.from(TABLES.USERS).delete().eq('username', username);

  if (error) {
    throw new Error('Не удалось удалить гражданина');
  }
}
