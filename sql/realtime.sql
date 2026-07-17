-- F-BANK / Forklandia
-- Включение Realtime для нужных таблиц
-- Выполнить в Supabase SQL Editor

alter publication supabase_realtime add table users;
alter publication supabase_realtime add table transactions;
alter publication supabase_realtime add table tasks;
alter publication supabase_realtime add table task_takers;
