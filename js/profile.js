// F-BANK / Forklandia
// Профиль гражданина

import { CONFIG } from './config.js';
import { getSupabaseClient } from './supabase.js';
import { getInitial, formatDate } from './utils.js';

/**
 * Возвращает актуальные данные профиля пользователя
 */
export async function getProfileData(username) {
  const client = getSupabaseClient();

  const { data, error } = await client
    .from(CONFIG.TABLES.USERS)
    .select('*')
    .eq('username', username)
    .maybeSingle();

  if (error || !data) {
    throw new Error('Не удалось загрузить профиль');
  }

  return data;
}

/**
 * Собирает данные для отображения на экране профиля
 */
export function buildProfileView(user) {
  return {
    initial: getInitial(user.username),
    username: user.username,
    citizenId: user.user_id || '—',
    badge: 'ГРАЖДАНИН ФОРКЛЯНДИИ',
    cardNumber: user.card_number || '—',
    balanceLabel: `${user.balance ?? 0} DUM`,
    joinedLabel: formatDate(user.joined),
    city: user.city || '—',
    frozen: !!user.frozen
  };
}
