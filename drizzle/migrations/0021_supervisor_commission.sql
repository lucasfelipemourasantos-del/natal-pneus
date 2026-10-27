-- Comissão de supervisor: espelho do relatório "Comissões por Supervisor" do Decision (a API não tem esse relatório ainda).
-- O RH lança os valores como vêm no relatório; o portal mostra exatamente isso, sem recalcular.
-- O código segue "ignorado" nos totais e metas (as vendas pessoais do supervisor entram pelo código de vendedor).
ALTER TABLE public.decision_sellers ADD COLUMN IF NOT EXISTS supervisor_unit text REFERENCES public.units(code);
UPDATE public.decision_sellers SET supervisor_unit = 'NP1' WHERE code = 145;

CREATE TABLE IF NOT EXISTS public.supervisor_commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_code integer NOT NULL REFERENCES public.decision_sellers(code) ON DELETE CASCADE,
  unit_code text NOT NULL REFERENCES public.units(code),
  competence date NOT NULL CHECK (extract(day FROM competence) = 1),
  -- Último dia coberto pelo relatório (o mês atual é parcial).
  period_end date NOT NULL,
  group_name text NOT NULL CHECK (length(group_name) BETWEEN 1 AND 120),
  sold_cents bigint NOT NULL CHECK (sold_cents BETWEEN -9000000000000 AND 9000000000000),
  rate_bp integer NOT NULL CHECK (rate_bp BETWEEN 0 AND 10000),
  commission_cents bigint NOT NULL CHECK (commission_cents BETWEEN -9000000000000 AND 9000000000000),
  entered_by uuid DEFAULT auth.uid(),
  entered_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (seller_code, unit_code, competence, group_name)
);
ALTER TABLE public.supervisor_commissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Supervisor commission read scope" ON public.supervisor_commissions;
CREATE POLICY "Supervisor commission read scope" ON public.supervisor_commissions FOR SELECT TO authenticated
  USING (public.can_read_all() OR (public.is_approved() AND EXISTS (SELECT 1 FROM public.decision_sellers s WHERE s.code = seller_code AND s.profile_id = auth.uid())));
DROP POLICY IF EXISTS "Admin manages supervisor commission" ON public.supervisor_commissions;
CREATE POLICY "Admin manages supervisor commission" ON public.supervisor_commissions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.supervisor_commissions TO authenticated;
GRANT ALL ON public.supervisor_commissions TO service_role;

-- O cadastro também aceita o código de supervisor (mesmo estando "ignorado" nos totais).
CREATE OR REPLACE FUNCTION public.claim_decision_codes(_codes integer[]) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  me uuid := auth.uid();
  typed text;
  c integer;
  s public.decision_sellers%ROWTYPE;
  dwords text[];
  result jsonb := '[]'::jsonb;
  outcome text;
  why text;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF COALESCE(array_length(_codes, 1), 0) > 5 THEN RAISE EXCEPTION 'too many codes'; END IF;
  SELECT full_name INTO typed FROM public.profiles WHERE id = me;
  IF typed IS NULL THEN RAISE EXCEPTION 'profile not found'; END IF;
  FOREACH c IN ARRAY COALESCE(_codes, '{}') LOOP
    SELECT * INTO s FROM public.decision_sellers WHERE code = c;
    outcome := NULL;
    IF NOT FOUND OR (s.ignored AND s.supervisor_unit IS NULL) OR NOT s.is_person THEN
      outcome := 'invalid';
    ELSIF s.profile_id = me THEN
      outcome := 'linked';
    ELSIF s.profile_id IS NOT NULL THEN
      outcome := 'pending'; why := 'Código já vinculado a outra conta';
    ELSE
      dwords := public.name_words(s.name);
      IF array_length(dwords, 1) >= 2 AND dwords <@ public.name_words(typed) THEN
        UPDATE public.decision_sellers SET profile_id = me WHERE code = c AND profile_id IS NULL;
        outcome := 'linked';
      ELSE
        outcome := 'pending'; why := 'Nome digitado não confere por completo com o do Decision';
      END IF;
    END IF;
    IF outcome = 'pending' THEN
      INSERT INTO public.decision_code_requests(profile_id, code, typed_name, reason) VALUES (me, c, typed, why)
      ON CONFLICT (profile_id, code) DO UPDATE SET typed_name = EXCLUDED.typed_name, reason = EXCLUDED.reason;
    END IF;
    result := result || jsonb_build_array(jsonb_build_object('code', c, 'result', outcome));
  END LOOP;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.claim_decision_codes(integer[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_decision_codes(integer[]) TO authenticated;
