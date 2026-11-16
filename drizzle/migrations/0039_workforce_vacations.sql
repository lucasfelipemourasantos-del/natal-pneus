-- Férias: cronograma anual por pessoa. Um registro por pessoa e mês previsto (formato AAAA-MM).
-- Só o ADM lê e altera. Início, fim e dias podem ficar em branco até o RH definir a programação final.
CREATE TABLE IF NOT EXISTS public.workforce_vacations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid NOT NULL REFERENCES public.workforce_people(id) ON DELETE CASCADE,
  planned_month text NOT NULL CHECK (planned_month ~ '^[0-9]{4}-[0-9]{2}$'),
  start_date date,
  end_date date,
  days integer CHECK (days IS NULL OR days BETWEEN 1 AND 60),
  status text NOT NULL DEFAULT 'previsto' CHECK (status IN ('previsto','confirmado','a_validar','dias_a_definir','concedido')),
  note text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (person_id, planned_month)
);
CREATE INDEX IF NOT EXISTS workforce_vacations_month_idx ON public.workforce_vacations (planned_month);

ALTER TABLE public.workforce_vacations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Workforce vacations admin" ON public.workforce_vacations;
CREATE POLICY "Workforce vacations admin" ON public.workforce_vacations FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workforce_vacations TO authenticated;
GRANT ALL ON public.workforce_vacations TO service_role;
