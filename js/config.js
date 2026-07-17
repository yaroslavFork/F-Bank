// F-BANK / Forklandia
// Глобальная конфигурация приложения

export const CONFIG = {
  SUPABASE_URL: 'https://monyjcyypnqknrzzxjej.supabase.co',
  SUPABASE_ANON_KEY:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1vbnlqY3l5cG5xa25yenp4amVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxNTIyMTQsImV4cCI6MjA5NzcyODIxNH0.OQsb1EunHj8tXj22iGu4AJUc_DwgioAD8TnTNJ8PA9A',

  SDK_URL: 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js',
  SDK_LOAD_TIMEOUT_MS: 8000,

  COUNTRY: 'Forklandia',
  CURRENCY_CODE: 'DUM',
  CURRENCY_NAME: 'Дамблы',

  TOAST_DURATION_MS: 3500,
  NUMBER_POP_DURATION_MS: 600,
  COIN_RAIN_COUNT: 20,

  TABLES: {
    USERS: 'users',
    TRANSACTIONS: 'transactions',
    PROMOCODES: 'promocodes',
    PROMO_USES: 'promo_uses',
    TASKS: 'tasks',
    TASK_TAKERS: 'task_takers'
  },

  REALTIME_TABLES: ['users', 'transactions', 'tasks', 'task_takers'],

  TASK_STATUS: {
    IN_PROGRESS: 'in_progress',
    DONE: 'done'
  },

  ROLES: {
    ADMIN: 'admin',
    CITIZEN: 'citizen'
  }
};
