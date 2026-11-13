-- Escala 5x2: quadro funcional das 4 lojas (53 pessoas) e o manual de funcionamento de cada loja. Só o ADM lê e altera.
CREATE TABLE IF NOT EXISTS public.workforce_people (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE CHECK (length(name) BETWEEN 3 AND 160),
  unit_code text NOT NULL REFERENCES public.units(code),
  employer text NOT NULL DEFAULT '',
  cbo text NOT NULL DEFAULT '',
  cbo_title text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT '',
  sector text NOT NULL CHECK (sector IN ('gerencia','vendas','caixa','pista','estoque','administrativo','apoio')),
  skills text[] NOT NULL DEFAULT '{}',
  rotates boolean NOT NULL DEFAULT false,
  rotation_note text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'confirmado' CHECK (status IN ('confirmado','a_confirmar')),
  notes text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS workforce_people_unit_idx ON public.workforce_people (unit_code);

CREATE TABLE IF NOT EXISTS public.workforce_unit_notes (
  unit_code text PRIMARY KEY REFERENCES public.units(code),
  hours text NOT NULL DEFAULT '',
  manual text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.workforce_people ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workforce_unit_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Workforce people admin" ON public.workforce_people;
DROP POLICY IF EXISTS "Workforce notes admin" ON public.workforce_unit_notes;
CREATE POLICY "Workforce people admin" ON public.workforce_people FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Workforce notes admin" ON public.workforce_unit_notes FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workforce_people, public.workforce_unit_notes TO authenticated;
GRANT ALL ON public.workforce_people, public.workforce_unit_notes TO service_role;

INSERT INTO public.workforce_unit_notes(unit_code, hours)
SELECT code, 'Segunda a sexta, 7h30 às 17h30 · sábado, 8h às 12h · domingo fechado' FROM public.units WHERE code IN ('NP1','NP2','NP3','NP4')
ON CONFLICT (unit_code) DO NOTHING;
