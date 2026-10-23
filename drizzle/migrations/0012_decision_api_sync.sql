-- Comissões pela API do Decision (Comissão de Vendedores Discriminado): um relatório 'api' por loja, vendedor e mês,
-- com os grupos (regra + percentual) e os itens. Usuários de estoque/gerência ficam marcados como ignorados.
ALTER TABLE public.decision_sellers ADD COLUMN ignored boolean NOT NULL DEFAULT false;
INSERT INTO public.decision_sellers(code,name,ignored) VALUES
  (112,'ITALO DE FARIAS JUSTINO',true),(158,'FELIPE VALERIO',true),(145,'ISRAEL ALCI DA CUNHA',true),
  (174,'MAGNO MORENO',true),(167,'NIVALDO SILVA DE PAIVA',true),(1,'EDUARDO JOSE DE ALBUQUERQUE',true)
ON CONFLICT(code) DO UPDATE SET ignored=true;

ALTER TABLE public.commission_report_items ADD COLUMN sold_at timestamp, ADD COLUMN unit_price_cents bigint, ADD COLUMN unit_discount_cents bigint, ADD COLUMN unit_surcharge_cents bigint, ADD COLUMN rule text;
ALTER TABLE public.commission_reports DROP CONSTRAINT commission_reports_kind_check, ADD CONSTRAINT commission_reports_kind_check CHECK(kind IN ('sintetico','analitico','api'));
ALTER TABLE public.commission_reports ADD COLUMN content_hash text;

-- Quando a rotina buscou o Decision pela última vez (mesmo sem mudanças).
CREATE TABLE public.decision_sync_status (scope text PRIMARY KEY, synced_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.decision_sync_status TO authenticated; GRANT ALL ON public.decision_sync_status TO service_role;
ALTER TABLE public.decision_sync_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Approved read sync status" ON public.decision_sync_status FOR SELECT TO authenticated USING(public.is_approved());

-- Os testes por PDF são substituídos pelos dados da API.
DELETE FROM public.commission_reports WHERE source='pdf';

-- Grava um mês de uma loja vindo da API. Só a rotina de sincronização (chave service_role) ou um ADM pode chamar.
-- Relatórios iguais ao já gravado (mesmo content_hash) são mantidos, para a auditoria registrar só o que mudou.
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
  INSERT INTO public.commission_report_items(report_id,position,sale_number,product_code,description,quantity,total_cents,rate_bp,commission_cents,sold_at,unit_price_cents,unit_discount_cents,unit_surcharge_cents,rule)
  SELECT _id,ord::integer,i->>'sale_number',i->>'product_code',i->>'description',(i->>'quantity')::numeric,(i->>'total_cents')::bigint,(i->>'rate_bp')::integer,(i->>'commission_cents')::bigint,
    (i->>'sold_at')::timestamp,(i->>'unit_price_cents')::bigint,(i->>'unit_discount_cents')::bigint,(i->>'unit_surcharge_cents')::bigint,i->>'rule'
  FROM jsonb_array_elements(_r->'items') WITH ORDINALITY AS t(i,ord);
  _changed:=_changed+1;
END LOOP;
INSERT INTO public.decision_sync_status(scope,synced_at) VALUES('comissoes',now()) ON CONFLICT(scope) DO UPDATE SET synced_at=now();
RETURN _changed; END $$;
REVOKE ALL ON FUNCTION public.replace_api_commissions(date,text,jsonb) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.replace_api_commissions(date,text,jsonb) TO authenticated, service_role;

-- OS contam tanto do analítico em PDF quanto da API.
CREATE OR REPLACE FUNCTION public.commission_os_summary(_competence date) RETURNS TABLE(report_id uuid, unit_code text, seller_code integer, os_count bigint) LANGUAGE sql STABLE SET search_path=public AS $$
SELECT r.id, r.unit_code, r.seller_code, count(DISTINCT i.sale_number) FROM public.commission_reports r JOIN public.commission_report_items i ON i.report_id=r.id WHERE r.kind IN ('analitico','api') AND r.competence=_competence GROUP BY r.id, r.unit_code, r.seller_code $$;
