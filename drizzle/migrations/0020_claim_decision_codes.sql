-- Cadastro com código do Decision: o funcionário informa o(s) código(s) e o sistema confere o nome.
-- Nome completo e sem dúvida (2+ palavras do Decision contidas no nome digitado) = vincula na hora.
-- Qualquer outro caso (nome parcial, código de outra pessoa, já vinculado) = pedido para o RH decidir.
CREATE TABLE IF NOT EXISTS public.decision_code_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  code integer NOT NULL REFERENCES public.decision_sellers(code) ON DELETE CASCADE,
  typed_name text NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(profile_id, code)
);
ALTER TABLE public.decision_code_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin reads code requests" ON public.decision_code_requests;
CREATE POLICY "Admin reads code requests" ON public.decision_code_requests FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Admin resolves code requests" ON public.decision_code_requests;
CREATE POLICY "Admin resolves code requests" ON public.decision_code_requests FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Palavras do nome sem acento, sem etiquetas do Decision (MEC, NP1, VENDEDOR...) e sem ligações (de, da...).
CREATE OR REPLACE FUNCTION public.name_words(_name text) RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT COALESCE(array_agg(w), '{}') FROM (
    SELECT DISTINCT w FROM unnest(regexp_split_to_array(
      regexp_replace(upper(translate(_name, 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç', 'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc')), '[^A-Z0-9 ]', ' ', 'g'),
      '\s+')) AS w
    WHERE w <> '' AND w !~ '^NP[0-9]$' AND w NOT IN ('MEC','MECANICO','ALINHADOR','BORRACHEIRO','BALANCEADOR','VENDEDOR','VENDAS','CAIXA','ESTOQUE','DE','DA','DO','DOS','DAS','E')
  ) t $$;

-- Chamada pelo próprio funcionário logo após criar a conta (ou depois, se esqueceu).
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
    IF NOT FOUND OR s.ignored OR NOT s.is_person THEN
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
REVOKE ALL ON FUNCTION public.name_words(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.name_words(text) TO authenticated;

-- Função "Chefe de pista" na lista do cadastro.
INSERT INTO public.job_functions(name) VALUES ('Chefe de pista') ON CONFLICT (name) DO NOTHING;
INSERT INTO public.job_functions(name) VALUES ('Mecânico'),('Alinhador'),('Balanceador'),('Borracheiro') ON CONFLICT (name) DO NOTHING;
