-- Escala 5x2: formação (time de trabalho) de cada loja. Uma pessoa por posição; a mesma pessoa pode ocupar mais de uma posição.
CREATE TABLE IF NOT EXISTS public.workforce_lineup (
  unit_code text NOT NULL REFERENCES public.units(code),
  fn text NOT NULL CHECK (fn IN ('supervisor','vendedor','chefe_pista','mecanico','alinhador','borracheiro','balanceador','estoquista','caixa','asg','motorista')),
  person_id uuid NOT NULL REFERENCES public.workforce_people(id) ON DELETE CASCADE,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (unit_code, fn)
);

ALTER TABLE public.workforce_lineup ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Workforce lineup admin" ON public.workforce_lineup;
CREATE POLICY "Workforce lineup admin" ON public.workforce_lineup FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workforce_lineup TO authenticated;
GRANT ALL ON public.workforce_lineup TO service_role;
