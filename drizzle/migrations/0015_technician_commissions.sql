-- Comissões de técnicos (mecânicos, alinhadores, balanceadores etc.) vindas da API do Decision (VENDAS_R21).
-- Ficam nas mesmas tabelas das comissões de vendedores, com kind='tecnico', para não se misturarem com as vendas.
ALTER TABLE public.commission_reports DROP CONSTRAINT commission_reports_kind_check,
  ADD CONSTRAINT commission_reports_kind_check CHECK(kind IN ('sintetico','analitico','api','tecnico'));

-- Função de cada pessoa no Decision (ex.: MECANICO 2, BALANCEADOR 1), atualizada pela sincronização.
ALTER TABLE public.decision_sellers ADD COLUMN IF NOT EXISTS decision_role text;

-- Grava um mês de uma loja para técnicos. Mesma regra de segurança e de conferência de totais das comissões de vendedores.
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
  INSERT INTO public.commission_report_items(report_id,position,sale_number,product_code,description,quantity,total_cents,rate_bp,commission_cents,sold_at,unit_price_cents,unit_discount_cents,unit_surcharge_cents,rule)
  SELECT _id,ord::integer,i->>'sale_number',i->>'product_code',i->>'description',(i->>'quantity')::numeric,(i->>'total_cents')::bigint,(i->>'rate_bp')::integer,(i->>'commission_cents')::bigint,
    (i->>'sold_at')::timestamp,(i->>'unit_price_cents')::bigint,(i->>'unit_discount_cents')::bigint,(i->>'unit_surcharge_cents')::bigint,i->>'rule'
  FROM jsonb_array_elements(_r->'items') WITH ORDINALITY AS t(i,ord);
  _changed:=_changed+1;
END LOOP;
INSERT INTO public.decision_sync_status(scope,synced_at) VALUES('comissoes',now()) ON CONFLICT(scope) DO UPDATE SET synced_at=now();
RETURN _changed; END $$;
REVOKE ALL ON FUNCTION public.replace_technician_commissions(date,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.replace_technician_commissions(date,text,jsonb) TO authenticated, service_role;

-- Atualiza a função (cargo) das pessoas que já estão cadastradas. Não cria ninguém novo.
CREATE OR REPLACE FUNCTION public.set_decision_roles(_roles jsonb) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _n integer;
BEGIN
IF coalesce(auth.role(),'')<>'service_role' AND NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
UPDATE public.decision_sellers s SET decision_role=left(r.value,80)
FROM jsonb_each_text(_roles) r WHERE s.code=r.key::integer AND s.decision_role IS DISTINCT FROM left(r.value,80);
GET DIAGNOSTICS _n = ROW_COUNT; RETURN _n; END $$;
REVOKE ALL ON FUNCTION public.set_decision_roles(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_decision_roles(jsonb) TO authenticated, service_role;

-- Técnicos não entram no cálculo da meta de peças dos vendedores nem na contagem de OS (que já filtram por kind='api').
