// F-BANK / Forklandia
// Активация промокодов. Один код — один раз на гражданина.

import { CONFIG } from './config.js';
import { getSupabaseClient } from './supabase.js';

/**
 * Активирует промокод для пользователя.
 * Проверяет: существование, active=true, лимит использований, повторное использование.
 * Возвращает { amount, newBalance } при успехе.
 */
export async function redeemPromoCode(username, rawCode) {
  const client = getSupabaseClient();
  const code = String(rawCode || '').trim().toUpperCase();

  if (!code) {
    throw new Error('Введите промокод');
  }

  // 1. Ищем промокод
  const { data: promo, error: promoError } = await client
    .from(CONFIG.TABLES.PROMOCODES)
    .select('*')
    .eq('code', code)
    .maybeSingle();

  if (promoError) {
    throw new Error('Ошибка проверки промокода');
  }

  if (!promo) {
    throw new Error('Промокод не найден');
  }

  if (!promo.active) {
    throw new Error('Промокод неактивен');
  }

  if (promo.max_uses > 0 && promo.used_count >= promo.max_uses) {
    throw new Error('Лимит активаций промокода исчерпан');
  }

  // 2. Проверяем, использовал ли уже этот пользователь этот код
  const { data: existingUse, error: useCheckError } = await client
    .from(CONFIG.TABLES.PROMO_USES)
    .select('id')
    .eq('code', code)
    .eq('username', username)
    .maybeSingle();

  if (useCheckError) {
    throw new Error('Ошибка проверки использования промокода');
  }

  if (existingUse) {
    throw new Error('Вы уже активировали этот промокод');
  }

  // 3. Получаем текущий баланс пользователя
  const { data: user, error: userError } = await client
    .from(CONFIG.TABLES.USERS)
    .select('*')
    .eq('username', username)
    .maybeSingle();

  if (userError || !user) {
    throw new Error('Не удалось получить данные пользователя');
  }

  if (user.frozen) {
    throw new Error('Аккаунт заморожен');
  }

  const newBalance = Number(user.balance) + Number(promo.amount);

  // 4. Начисляем средства
  const { error: balanceError } = await client
    .from(CONFIG.TABLES.USERS)
    .update({ balance: newBalance })
    .eq('username', username);

  if (balanceError) {
    throw new Error('Ошибка начисления средств');
  }

  // 5. Записываем факт использования
  const { error: insertUseError } = await client.from(CONFIG.TABLES.PROMO_USES).insert({
    code,
    username
  });

  if (insertUseError) {
    // Откатываем начисление, если не удалось зафиксировать использование
    await client
      .from(CONFIG.TABLES.USERS)
      .update({ balance: user.balance })
      .eq('username', username);
    throw new Error('Не удалось зафиксировать использование промокода');
  }

  // 6. Создаём транзакцию
  await client.from(CONFIG.TABLES.TRANSACTIONS).insert({
    username,
    type: 'promo',
    description: `Промокод ${code}`,
    amount: Number(promo.amount),
    date: new Date().toISOString()
  });

  // 7. Обновляем счётчик использований промокода
  const newUsedCount = Number(promo.used_count) + 1;
  const shouldDeactivate = promo.max_uses > 0 && newUsedCount >= promo.max_uses;

  await client
    .from(CONFIG.TABLES.PROMOCODES)
    .update({
      used_count: newUsedCount,
      active: shouldDeactivate ? false : promo.active
    })
    .eq('code', code);

  return {
    amount: Number(promo.amount),
    newBalance
  };
}
