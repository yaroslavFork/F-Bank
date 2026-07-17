// F-BANK / Forklandia
// Переводы между гражданами. Каждый перевод создаёт ДВЕ записи в transactions.

import { CONFIG } from './config.js';
import { getSupabaseClient } from './supabase.js';

/**
 * Возвращает список получателей для перевода.
 * Только НЕ замороженные аккаунты, исключая самого отправителя.
 */
export async function getAvailableRecipients(currentUsername) {
  const client = getSupabaseClient();

  const { data, error } = await client
    .from(CONFIG.TABLES.USERS)
    .select('username, city, frozen')
    .eq('frozen', false)
    .neq('username', currentUsername)
    .order('username', { ascending: true });

  if (error) {
    throw new Error('Не удалось загрузить список получателей');
  }

  return data || [];
}

/**
 * Выполняет перевод от sender к recipient на сумму amount.
 * Создаёт запись "Перевод → Имя" у отправителя
 * и "Получено от Имя" у получателя.
 * Бросает ошибку, если недостаточно средств, получатель заморожен и т.д.
 */
export async function performTransfer(senderUsername, recipientUsername, amount) {
  const client = getSupabaseClient();
  const numericAmount = Number(amount);

  if (!numericAmount || numericAmount <= 0) {
    throw new Error('Некорректная сумма перевода');
  }

  if (senderUsername === recipientUsername) {
    throw new Error('Нельзя перевести самому себе');
  }

  // Получаем актуальные данные отправителя и получателя параллельно
  const [{ data: sender, error: senderError }, { data: recipient, error: recipientError }] = await Promise.all([
    client.from(CONFIG.TABLES.USERS).select('*').eq('username', senderUsername).maybeSingle(),
    client.from(CONFIG.TABLES.USERS).select('*').eq('username', recipientUsername).maybeSingle()
  ]);

  if (senderError || !sender) {
    throw new Error('Не удалось получить данные отправителя');
  }

  if (sender.frozen) {
    throw new Error('Аккаунт заморожен — перевод недоступен');
  }

  if (Number(sender.balance) < numericAmount) {
    throw new Error('Недостаточно средств');
  }

  if (recipientError || !recipient) {
    throw new Error('Получатель не найден');
  }

  if (recipient.frozen) {
    throw new Error('Аккаунт получателя заморожен');
  }

  const newSenderBalance = Number(sender.balance) - numericAmount;
  const newRecipientBalance = Number(recipient.balance) + numericAmount;

  // Обновляем оба баланса параллельно
  const [{ error: updateSenderError }, { error: updateRecipientError }] = await Promise.all([
    client.from(CONFIG.TABLES.USERS).update({ balance: newSenderBalance }).eq('username', senderUsername),
    client.from(CONFIG.TABLES.USERS).update({ balance: newRecipientBalance }).eq('username', recipientUsername)
  ]);

  if (updateSenderError || updateRecipientError) {
    // Откатываем то, что успело примениться
    await Promise.all([
      client.from(CONFIG.TABLES.USERS).update({ balance: sender.balance }).eq('username', senderUsername),
      client.from(CONFIG.TABLES.USERS).update({ balance: recipient.balance }).eq('username', recipientUsername)
    ]);
    throw new Error('Ошибка выполнения перевода');
  }

  const nowIso = new Date().toISOString();

  // Обе записи транзакций создаются параллельно
  const [{ error: txSenderError }, { error: txRecipientError }] = await Promise.all([
    client.from(CONFIG.TABLES.TRANSACTIONS).insert({
      username: senderUsername,
      type: 'transfer_out',
      description: `Перевод → ${recipientUsername}`,
      amount: -numericAmount,
      date: nowIso
    }),
    client.from(CONFIG.TABLES.TRANSACTIONS).insert({
      username: recipientUsername,
      type: 'transfer_in',
      description: `Получено от ${senderUsername}`,
      amount: numericAmount,
      date: nowIso
    })
  ]);

  if (txSenderError || txRecipientError) {
    throw new Error('Перевод выполнен, но не удалось записать историю операций');
  }

  return {
    senderNewBalance: newSenderBalance,
    recipientNewBalance: newRecipientBalance,
    recipientUsername,
    amount: numericAmount
  };
}

/**
 * Возвращает последние N транзакций пользователя (по умолчанию 5 — для экрана карты)
 */
export async function getUserTransactions(username, limit = 5) {
  const client = getSupabaseClient();

  const { data, error } = await client
    .from(CONFIG.TABLES.TRANSACTIONS)
    .select('*')
    .eq('username', username)
    .order('date', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error('Не удалось загрузить историю операций');
  }

  return data || [];
}
