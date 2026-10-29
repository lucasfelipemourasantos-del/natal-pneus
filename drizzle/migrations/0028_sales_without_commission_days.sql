-- Vendas por dia de quem não recebe comissão (Humberto), para o filtro por dias de Comissões e do total das lojas.
CREATE TABLE IF NOT EXISTS public.sales_without_commission_days (
  unit_code text NOT NULL REFERENCES public.units(code),
  day date NOT NULL,
  seller_code integer NOT NULL,
  seller_name text NOT NULL CHECK (length(seller_name) <= 120),
  sales_count integer NOT NULL CHECK (sales_count >= 0),
  sold_cents bigint NOT NULL CHECK (sold_cents BETWEEN -9000000000000 AND 9000000000000),
  PRIMARY KEY (unit_code, day, seller_code)
);
ALTER TABLE public.sales_without_commission_days ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Sales without commission days read" ON public.sales_without_commission_days;
CREATE POLICY "Sales without commission days read" ON public.sales_without_commission_days FOR SELECT TO authenticated USING (public.can_read_all());
GRANT SELECT ON public.sales_without_commission_days TO authenticated;
GRANT ALL ON public.sales_without_commission_days TO service_role;

-- Troca os dias de um mês (a rotina de atualização manda o mês inteiro).
CREATE OR REPLACE FUNCTION public.replace_sales_without_commission_days(_competence date, _rows jsonb) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _n integer;
BEGIN
IF coalesce(auth.role(),'')<>'service_role' AND NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
IF extract(day FROM _competence)<>1 THEN RAISE EXCEPTION 'Invalid month'; END IF;
DELETE FROM public.sales_without_commission_days WHERE day >= _competence AND day < (_competence + interval '1 month')::date;
INSERT INTO public.sales_without_commission_days(unit_code,day,seller_code,seller_name,sales_count,sold_cents)
SELECT x->>'unit_code',(x->>'day')::date,(x->>'seller_code')::integer,left(x->>'seller_name',120),(x->>'sales_count')::integer,(x->>'sold_cents')::bigint
FROM jsonb_array_elements(_rows) x
WHERE EXISTS(SELECT 1 FROM public.units u WHERE u.code=x->>'unit_code')
  AND (x->>'day')::date >= _competence AND (x->>'day')::date < (_competence + interval '1 month')::date;
GET DIAGNOSTICS _n = ROW_COUNT;
RETURN _n; END $$;
REVOKE ALL ON FUNCTION public.replace_sales_without_commission_days(date,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.replace_sales_without_commission_days(date,jsonb) TO authenticated, service_role;
