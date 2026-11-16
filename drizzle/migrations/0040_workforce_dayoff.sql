-- Escala semanal 5x2: dia de folga de cada pessoa (1 = segunda ... 6 = sábado; domingo a loja fecha)
-- e formação por dia da semana (0 = padrão do mês, 1 a 6 = segunda a sábado).
ALTER TABLE public.workforce_people ADD COLUMN IF NOT EXISTS day_off smallint CHECK (day_off BETWEEN 1 AND 6);

ALTER TABLE public.workforce_lineup ADD COLUMN IF NOT EXISTS weekday smallint NOT NULL DEFAULT 0 CHECK (weekday BETWEEN 0 AND 6);
ALTER TABLE public.workforce_lineup DROP CONSTRAINT IF EXISTS workforce_lineup_pkey;
ALTER TABLE public.workforce_lineup ADD PRIMARY KEY (unit_code, month, weekday, fn, person_id);
