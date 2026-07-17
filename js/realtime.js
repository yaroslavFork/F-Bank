// F-BANK / Forklandia
// Realtime-подписки. При логауте ВСЕ каналы обязаны сниматься через removeChannel().
//
// Важно: все таблицы слушаются через ОДИН канал (несколько .on() на одном .channel()),
// а не через отдельный канал на каждую таблицу — так соединение устанавливается
// быстрее на медленном мобильном интернете.

import { CONFIG } from './config.js';
import { getSupabaseClient } from './supabase.js';

let activeChannel = null;

/**
 * Запускает все realtime-подписки, нужные приложению, через один канал.
 * callbacks — объект с обработчиками:
 * {
 *   onUserChange(payload),
 *   onTransactionChange(payload),
 *   onTaskChange(payload),
 *   onTaskTakerChange(payload)
 * }
 */
export function initRealtime(callbacks = {}) {
  const client = getSupabaseClient();
  let channel = client.channel('realtime-fbank');

  if (CONFIG.REALTIME_TABLES.includes('users')) {
    channel = channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: CONFIG.TABLES.USERS },
      (payload) => {
        if (typeof callbacks.onUserChange === 'function') callbacks.onUserChange(payload);
      }
    );
  }

  if (CONFIG.REALTIME_TABLES.includes('transactions')) {
    channel = channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: CONFIG.TABLES.TRANSACTIONS },
      (payload) => {
        if (typeof callbacks.onTransactionChange === 'function') callbacks.onTransactionChange(payload);
      }
    );
  }

  if (CONFIG.REALTIME_TABLES.includes('tasks')) {
    channel = channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: CONFIG.TABLES.TASKS },
      (payload) => {
        if (typeof callbacks.onTaskChange === 'function') callbacks.onTaskChange(payload);
      }
    );
  }

  if (CONFIG.REALTIME_TABLES.includes('task_takers')) {
    channel = channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: CONFIG.TABLES.TASK_TAKERS },
      (payload) => {
        if (typeof callbacks.onTaskTakerChange === 'function') callbacks.onTaskTakerChange(payload);
      }
    );
  }

  channel.subscribe();
  activeChannel = channel;
}

/**
 * Снимает активную realtime-подписку.
 * Обязательно вызывается при логауте.
 */
export function removeAllChannels() {
  if (!activeChannel) return;
  const client = getSupabaseClient();
  try {
    client.removeChannel(activeChannel);
  } catch (e) {
    // Канал уже мог быть снят — игнорируем
  }
  activeChannel = null;
}

/**
 * Индикатор "онлайн" — простое мигание точки.
 * Вызывается один раз при старте приложения (Card/Profile экраны используют CSS-анимацию rtPulse).
 */
export function markOnlineIndicator(element) {
  if (!element) return;
  element.classList.add('online-indicator', 'rt-pulse');
}
