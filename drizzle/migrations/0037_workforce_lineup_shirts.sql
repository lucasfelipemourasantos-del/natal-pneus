-- Escala 5x2: formação por mês, com várias pessoas por camisa e autorização para quem só tem potencial.
-- Recria a tabela da formação (a formação de teste anterior é apagada).
DROP TABLE IF EXISTS public.workforce_lineup;
CREATE TABLE public.workforce_lineup (
  unit_code text NOT NULL REFERENCES public.units(code),
  month text NOT NULL CHECK (month ~ '^[0-9]{4}-[0-9]{2}$'),
  fn text NOT NULL CHECK (fn IN ('supervisor','vendedor','chefe_pista','mecanico','alinhador','borracheiro','balanceador','estoquista','caixa','asg','motorista')),
  person_id uuid NOT NULL REFERENCES public.workforce_people(id) ON DELETE CASCADE,
  authorized boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (unit_code, month, fn, person_id)
);

ALTER TABLE public.workforce_lineup ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Workforce lineup admin" ON public.workforce_lineup;
CREATE POLICY "Workforce lineup admin" ON public.workforce_lineup FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workforce_lineup TO authenticated;
GRANT ALL ON public.workforce_lineup TO service_role;
