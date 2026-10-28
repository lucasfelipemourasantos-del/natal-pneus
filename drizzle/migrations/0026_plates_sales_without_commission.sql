-- 1) Placa do veículo da OS em cada item de comissão (a API do Decision passou a enviar).
ALTER TABLE public.commission_report_items ADD COLUMN IF NOT EXISTS plate text;

-- As duas funções de gravação passam a guardar a placa (o conteúdo muda, então os relatórios são regravados uma vez).
CREATE OR REPLACE FUNCTION public.replace_api_commissions(_competence date, _unit text, _reports jsonb) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _r jsonb; _id uuid; _code integer; _sold bigint; _comm bigint; _changed integer:=0;
BEGIN
IF coalesce(auth.role(),'')<>'service_role' AND NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
IF extract(day FROM _competence)<>1 OR NOT EXISTS(SELECT 1 FROM public.units WHERE code=_unit) THEN RAISE EXCEPTION 'Invalid month or store'; END IF;
DELETE FROM public.commission_reports WHERE kind='api' AND unit_code=_unit AND competence=_competence
  AND seller_code NOT IN (SELECT (x->>'seller_code')::integer FROM jsonb_array_elements(_reports) x);
FOR _r IN SELECT * FROM jsonb_array_elements(_reports) LOOP
  _code:=(_r->>'seller_code')::integer;
  IF EXISTS(SELECT 1 FROM public.commission_reports WHERE kind='api' AND unit_code=_unit AND seller_code=_code AND competence=_competence AND content_hash=_r->>'content_hash') THEN CONTINUE; END IF;
  SELECT coalesce(sum((i->>'total_cents')::bigint),0), coalesce(sum((i->>'commission_cents')::bigint),0) INTO _sold,_comm FROM jsonb_array_elements(_r->'items') i;
  IF _sold<>(_r->>'total_sold_cents')::bigint OR _comm<>(_r->>'total_commission_cents')::bigint THEN RAISE EXCEPTION 'Report lines do not match its totals'; END IF;
  INSERT INTO public.decision_sellers(code,name) VALUES(_code,left(_r->>'seller_name',120)) ON CONFLICT(code) DO NOTHING;
  DELETE FROM public.commission_reports WHERE kind='api' AND unit_code=_unit AND seller_code=_code AND competence=_competence;
  INSERT INTO public.commission_reports(kind,unit_code,seller_code,competence,period_start,period_end,total_sold_cents,total_commission_cents,source,content_hash)
  VALUES('api',_unit,_code,_competence,_competence,(_competence+interval '1 month'-interval '1 day')::date,_sold,_comm,'api',_r->>'content_hash') RETURNING id INTO _id;
  INSERT INTO public.commission_report_groups(report_id,position,group_name,rate_bp,sold_cents,commission_cents)
  SELECT _id,ord::integer,g->>'group_name',(g->>'rate_bp')::integer,(g->>'sold_cents')::bigint,(g->>'commission_cents')::bigint FROM jsonb_array_elements(_r->'groups') WITH ORDINALITY AS t(g,ord);
  INSERT INTO public.commission_report_items(report_id,position,sale_number,product_code,description,quantity,total_cents,rate_bp,commission_cents,sold_at,unit_price_cents,unit_discount_cents,unit_surcharge_cents,rule,plate)
  SELECT _id,ord::integer,i->>'sale_number',i->>'product_code',i->>'description',(i->>'quantity')::numeric,(i->>'total_cents')::bigint,(i->>'rate_bp')::integer,(i->>'commission_cents')::bigint,
    (i->>'sold_at')::timestamp,(i->>'unit_price_cents')::bigint,(i->>'unit_discount_cents')::bigint,(i->>'unit_surcharge_cents')::bigint,i->>'rule',nullif(i->>'plate','')
  FROM jsonb_array_elements(_r->'items') WITH ORDINALITY AS t(i,ord);
  _changed:=_changed+1;
END LOOP;
INSERT INTO public.decision_sync_status(scope,synced_at) VALUES('comissoes',now()) ON CONFLICT(scope) DO UPDATE SET synced_at=now();
RETURN _changed; END $$;
REVOKE ALL ON FUNCTION public.replace_api_commissions(date,text,jsonb) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.replace_api_commissions(date,text,jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.replace_technician_commissions(_competence date, _unit text, _reports jsonb) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _r jsonb; _id uuid; _code integer; _sold bigint; _comm bigint; _changed integer:=0;
BEGIN
IF coalesce(auth.role(),'')<>'service_role' AND NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
IF extract(day FROM _competence)<>1 OR NOT EXISTS(SELECT 1 FROM public.units WHERE code=_unit) THEN RAISE EXCEPTION 'Invalid month or store'; END IF;
DELETE FROM public.commission_reports WHERE kind='tecnico' AND unit_code=_unit AND competence=_competence
  AND seller_code NOT IN (SELECT (x->>'seller_code')::integer FROM jsonb_array_elements(_reports) x);
FOR _r IN SELECT * FROM jsonb_array_elements(_reports) LOOP
  _code:=(_r->>'seller_code')::integer;
  IF EXISTS(SELECT 1 FROM public.commission_reports WHERE kind='tecnico' AND unit_code=_unit AND seller_code=_code AND competence=_competence AND content_hash=_r->>'content_hash') THEN CONTINUE; END IF;
  SELECT coalesce(sum((i->>'total_cents')::bigint),0), coalesce(sum((i->>'commission_cents')::bigint),0) INTO _sold,_comm FROM jsonb_array_elements(_r->'items') i;
  IF _sold<>(_r->>'total_sold_cents')::bigint OR _comm<>(_r->>'total_commission_cents')::bigint THEN RAISE EXCEPTION 'Report lines do not match its totals'; END IF;
  INSERT INTO public.decision_sellers(code,name) VALUES(_code,left(_r->>'seller_name',120)) ON CONFLICT(code) DO NOTHING;
  DELETE FROM public.commission_reports WHERE kind='tecnico' AND unit_code=_unit AND seller_code=_code AND competence=_competence;
  INSERT INTO public.commission_reports(kind,unit_code,seller_code,competence,period_start,period_end,total_sold_cents,total_commission_cents,source,content_hash)
  VALUES('tecnico',_unit,_code,_competence,_competence,(_competence+interval '1 month'-interval '1 day')::date,_sold,_comm,'api',_r->>'content_hash') RETURNING id INTO _id;
  INSERT INTO public.commission_report_groups(report_id,position,group_name,rate_bp,sold_cents,commission_cents)
  SELECT _id,ord::integer,g->>'group_name',(g->>'rate_bp')::integer,(g->>'sold_cents')::bigint,(g->>'commission_cents')::bigint FROM jsonb_array_elements(_r->'groups') WITH ORDINALITY AS t(g,ord);
  INSERT INTO public.commission_report_items(report_id,position,sale_number,product_code,description,quantity,total_cents,rate_bp,commission_cents,sold_at,unit_price_cents,unit_discount_cents,unit_surcharge_cents,rule,plate)
  SELECT _id,ord::integer,i->>'sale_number',i->>'product_code',i->>'description',(i->>'quantity')::numeric,(i->>'total_cents')::bigint,(i->>'rate_bp')::integer,(i->>'commission_cents')::bigint,
    (i->>'sold_at')::timestamp,(i->>'unit_price_cents')::bigint,(i->>'unit_discount_cents')::bigint,(i->>'unit_surcharge_cents')::bigint,i->>'rule',nullif(i->>'plate','')
  FROM jsonb_array_elements(_r->'items') WITH ORDINALITY AS t(i,ord);
  _changed:=_changed+1;
END LOOP;
INSERT INTO public.decision_sync_status(scope,synced_at) VALUES('comissoes',now()) ON CONFLICT(scope) DO UPDATE SET synced_at=now();
RETURN _changed; END $$;
REVOKE ALL ON FUNCTION public.replace_technician_commissions(date,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.replace_technician_commissions(date,text,jsonb) TO authenticated, service_role;

-- 2) Vendas de quem não recebe comissão (ex.: Humberto, NP2): o relatório de comissão do Decision não as traz,
-- então o faturamento da loja ficava menor que o real. Aqui entram só as vendas, sem comissão e sem meta.
CREATE TABLE IF NOT EXISTS public.sales_without_commission (
  unit_code text NOT NULL REFERENCES public.units(code),
  competence date NOT NULL CHECK (extract(day FROM competence) = 1),
  seller_code integer NOT NULL,
  seller_name text NOT NULL CHECK (length(seller_name) <= 120),
  sales_count integer NOT NULL CHECK (sales_count >= 0),
  sold_cents bigint NOT NULL CHECK (sold_cents BETWEEN -9000000000000 AND 9000000000000),
  PRIMARY KEY (unit_code, competence, seller_code)
);
ALTER TABLE public.sales_without_commission ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Sales without commission read" ON public.sales_without_commission;
CREATE POLICY "Sales without commission read" ON public.sales_without_commission FOR SELECT TO authenticated USING (public.can_read_all());
GRANT SELECT ON public.sales_without_commission TO authenticated;
GRANT ALL ON public.sales_without_commission TO service_role;

CREATE OR REPLACE FUNCTION public.replace_sales_without_commission(_competence date, _rows jsonb) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _n integer;
BEGIN
IF coalesce(auth.role(),'')<>'service_role' AND NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
IF extract(day FROM _competence)<>1 THEN RAISE EXCEPTION 'Invalid month'; END IF;
DELETE FROM public.sales_without_commission WHERE competence=_competence;
INSERT INTO public.sales_without_commission(unit_code,competence,seller_code,seller_name,sales_count,sold_cents)
SELECT x->>'unit_code',_competence,(x->>'seller_code')::integer,left(x->>'seller_name',120),(x->>'sales_count')::integer,(x->>'sold_cents')::bigint
FROM jsonb_array_elements(_rows) x WHERE EXISTS(SELECT 1 FROM public.units u WHERE u.code=x->>'unit_code');
GET DIAGNOSTICS _n = ROW_COUNT;
RETURN _n; END $$;
REVOKE ALL ON FUNCTION public.replace_sales_without_commission(date,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.replace_sales_without_commission(date,jsonb) TO authenticated, service_role;
