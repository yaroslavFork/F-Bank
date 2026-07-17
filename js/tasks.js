// F-BANK / Forklandia
// Задания: список активных, взятие в работу, статусы, начисление награды

import { CONFIG } from './config.js';
import { getSupabaseClient } from './supabase.js';

const STATUS = CONFIG.TASK_STATUS;

/**
 * Возвращает все активные задания
 */
export async function getActiveTasks() {
  const client = getSupabaseClient();

  const { data, error } = await client
    .from(CONFIG.TABLES.TASKS)
    .select('*')
    .eq('active', true)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error('Не удалось загрузить задания');
  }

  return data || [];
}

/**
 * Возвращает всех участников задания (для админ-панели)
 */
export async function getTaskTakers(taskId) {
  const client = getSupabaseClient();

  const { data, error } = await client
    .from(CONFIG.TABLES.TASK_TAKERS)
    .select('*')
    .eq('task_id', taskId)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error('Не удалось загрузить участников задания');
  }

  return data || [];
}

/**
 * Собирает список заданий вместе со статусом текущего пользователя
 * и количеством занятых мест.
 * Статусы: 'available' | 'in_progress' | 'done' | 'full'
 */
export async function getTasksWithStatusForUser(username) {
  const client = getSupabaseClient();

  const [tasks, { data: allTakers, error }] = await Promise.all([
    getActiveTasks(),
    client.from(CONFIG.TABLES.TASK_TAKERS).select('*')
  ]);

  if (error) {
    throw new Error('Не удалось загрузить участников заданий');
  }

  return tasks.map((task) => {
    const takersForTask = (allTakers || []).filter((t) => t.task_id === task.id);
    const myTaker = takersForTask.find((t) => t.username === username);

    let status = 'available';
    if (myTaker) {
      status = myTaker.status === STATUS.DONE ? 'done' : 'in_progress';
    } else if (task.max_takers > 0 && takersForTask.length >= task.max_takers) {
      status = 'full';
    }

    return {
      ...task,
      participantsCount: takersForTask.length,
      status,
      myTakerId: myTaker ? myTaker.id : null
    };
  });
}

/**
 * Гражданин берётся за задание.
 * Запрещает повторное взятие и взятие при отсутствии мест.
 */
export async function takeTask(taskId, username) {
  const client = getSupabaseClient();

  // Проверяем задание
  const { data: task, error: taskError } = await client
    .from(CONFIG.TABLES.TASKS)
    .select('*')
    .eq('id', taskId)
    .maybeSingle();

  if (taskError || !task) {
    throw new Error('Задание не найдено');
  }

  if (!task.active) {
    throw new Error('Задание больше не активно');
  }

  // Проверяем, не брал ли пользователь это задание ранее
  const { data: existing, error: existingError } = await client
    .from(CONFIG.TABLES.TASK_TAKERS)
    .select('id')
    .eq('task_id', taskId)
    .eq('username', username)
    .maybeSingle();

  if (existingError) {
    throw new Error('Ошибка проверки задания');
  }

  if (existing) {
    throw new Error('Вы уже взяли это задание');
  }

  // Проверяем лимит участников
  if (task.max_takers > 0) {
    const { count, error: countError } = await client
      .from(CONFIG.TABLES.TASK_TAKERS)
      .select('id', { count: 'exact', head: true })
      .eq('task_id', taskId);

    if (countError) {
      throw new Error('Ошибка проверки количества участников');
    }

    if ((count || 0) >= task.max_takers) {
      throw new Error('Свободных мест больше нет');
    }
  }

  const { error: insertError } = await client.from(CONFIG.TABLES.TASK_TAKERS).insert({
    task_id: taskId,
    username,
    status: STATUS.IN_PROGRESS
  });

  if (insertError) {
    throw new Error('Не удалось взять задание');
  }

  return true;
}

/**
 * Админ отмечает задание выполненным для конкретного участника.
 * Начисляет награду и создаёт транзакцию. Нельзя выполнить дважды.
 */
export async function completeTaskForTaker(taskTakerId) {
  const client = getSupabaseClient();

  const { data: taker, error: takerError } = await client
    .from(CONFIG.TABLES.TASK_TAKERS)
    .select('*')
    .eq('id', taskTakerId)
    .maybeSingle();

  if (takerError || !taker) {
    throw new Error('Участник задания не найден');
  }

  if (taker.status === STATUS.DONE) {
    throw new Error('Задание уже отмечено выполненным');
  }

  const { data: task, error: taskError } = await client
    .from(CONFIG.TABLES.TASKS)
    .select('*')
    .eq('id', taker.task_id)
    .maybeSingle();

  if (taskError || !task) {
    throw new Error('Задание не найдено');
  }

  const { data: user, error: userError } = await client
    .from(CONFIG.TABLES.USERS)
    .select('*')
    .eq('username', taker.username)
    .maybeSingle();

  if (userError || !user) {
    throw new Error('Пользователь не найден');
  }

  const newBalance = Number(user.balance) + Number(task.reward);

  const { error: balanceError } = await client
    .from(CONFIG.TABLES.USERS)
    .update({ balance: newBalance })
    .eq('username', taker.username);

  if (balanceError) {
    throw new Error('Не удалось начислить награду');
  }

  const { error: statusError } = await client
    .from(CONFIG.TABLES.TASK_TAKERS)
    .update({ status: STATUS.DONE })
    .eq('id', taskTakerId);

  if (statusError) {
    // Откатываем начисление
    await client
      .from(CONFIG.TABLES.USERS)
      .update({ balance: user.balance })
      .eq('username', taker.username);
    throw new Error('Не удалось обновить статус задания');
  }

  await client.from(CONFIG.TABLES.TRANSACTIONS).insert({
    username: taker.username,
    type: 'task_reward',
    description: `Награда за задание: ${task.title}`,
    amount: Number(task.reward),
    date: new Date().toISOString()
  });

  return { newBalance, reward: Number(task.reward) };
}
