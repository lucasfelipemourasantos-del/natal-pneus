-- Vendas que o Decision não comissiona (todos os serviços do Maurício e o rodízio truck) e que contam só na base do gerente.
CREATE TABLE IF NOT EXISTS public.manager_extra_sales (
  competence date NOT NULL,
  unit_code text NOT NULL REFERENCES public.units(code),
  seller_code integer NOT NULL,
  kind text NOT NULL CHECK (kind IN ('servico','rodizio')),
  sold_cents bigint NOT NULL CHECK (sold_cents BETWEEN -9000000000000 AND 9000000000000),
  PRIMARY KEY (competence, unit_code, seller_code, kind)
);
ALTER TABLE public.manager_extra_sales ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Manager extra sales read" ON public.manager_extra_sales;
CREATE POLICY "Manager extra sales read" ON public.manager_extra_sales FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
GRANT SELECT ON public.manager_extra_sales TO authenticated;
GRANT ALL ON public.manager_extra_sales TO service_role;

CREATE OR REPLACE FUNCTION public.replace_manager_extra_sales(_competence date, _rows jsonb) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _n integer;
BEGIN
IF coalesce(auth.role(),'')<>'service_role' AND NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
IF extract(day FROM _competence)<>1 THEN RAISE EXCEPTION 'Invalid month'; END IF;
DELETE FROM public.manager_extra_sales WHERE competence=_competence;
INSERT INTO public.manager_extra_sales(competence,unit_code,seller_code,kind,sold_cents)
SELECT _competence,x->>'unit_code',(x->>'seller_code')::integer,x->>'kind',(x->>'sold_cents')::bigint
FROM jsonb_array_elements(_rows) x WHERE EXISTS(SELECT 1 FROM public.units u WHERE u.code=x->>'unit_code');
GET DIAGNOSTICS _n = ROW_COUNT;
RETURN _n; END $$;
REVOKE ALL ON FUNCTION public.replace_manager_extra_sales(date,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.replace_manager_extra_sales(date,jsonb) TO authenticated, service_role;
