-- Comissões do Decision: relatórios sintético (grupos) e analítico (itens/OS) por vendedor, loja e mês.
-- Vendedores flutuam entre lojas: o código Decision identifica a pessoa; a loja fica em cada relatório.
CREATE TABLE public.decision_sellers (code integer PRIMARY KEY CHECK(code > 0), name text NOT NULL CHECK(length(name) BETWEEN 1 AND 120), profile_id uuid UNIQUE REFERENCES public.profiles(id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT,UPDATE ON public.decision_sellers TO authenticated; GRANT ALL ON public.decision_sellers TO service_role;
ALTER TABLE public.decision_sellers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Sellers read scope" ON public.decision_sellers FOR SELECT TO authenticated USING(public.can_read_all() OR profile_id=auth.uid());
CREATE POLICY "Admin links sellers" ON public.decision_sellers FOR UPDATE TO authenticated USING(public.has_role(auth.uid(),'admin')) WITH CHECK(public.has_role(auth.uid(),'admin'));
CREATE TRIGGER decision_sellers_audit AFTER INSERT OR UPDATE OR DELETE ON public.decision_sellers FOR EACH ROW EXECUTE FUNCTION public.audit_admin_change();

CREATE TABLE public.commission_reports (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), kind text NOT NULL CHECK(kind IN ('sintetico','analitico')), unit_code text NOT NULL REFERENCES public.units(code), seller_code integer NOT NULL REFERENCES public.decision_sellers(code), competence date NOT NULL CHECK(extract(day FROM competence)=1), period_start date NOT NULL, period_end date NOT NULL, total_sold_cents bigint NOT NULL CHECK(total_sold_cents BETWEEN -9000000000000 AND 9000000000000), total_commission_cents bigint NOT NULL CHECK(total_commission_cents BETWEEN -9000000000000 AND 9000000000000), allowance_cents bigint NOT NULL DEFAULT 0, source text NOT NULL DEFAULT 'pdf' CHECK(source IN ('pdf','api')), file_name text, imported_by uuid DEFAULT auth.uid(), imported_at timestamptz NOT NULL DEFAULT now(), UNIQUE(kind,unit_code,seller_code,competence), CHECK(period_start<=period_end));
CREATE TABLE public.commission_report_groups (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), report_id uuid NOT NULL REFERENCES public.commission_reports(id) ON DELETE CASCADE, position integer NOT NULL, group_name text NOT NULL, rate_bp integer NOT NULL CHECK(rate_bp BETWEEN -10000 AND 10000), sold_cents bigint NOT NULL, commission_cents bigint NOT NULL);
CREATE TABLE public.commission_report_items (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), report_id uuid NOT NULL REFERENCES public.commission_reports(id) ON DELETE CASCADE, position integer NOT NULL, sale_number text NOT NULL, product_code text NOT NULL, description text NOT NULL, quantity numeric(14,3) NOT NULL, total_cents bigint NOT NULL, rate_bp integer NOT NULL CHECK(rate_bp BETWEEN -10000 AND 10000), commission_cents bigint NOT NULL);
CREATE INDEX commission_reports_month ON public.commission_reports(competence, seller_code);
CREATE INDEX commission_groups_report ON public.commission_report_groups(report_id);
CREATE INDEX commission_items_report ON public.commission_report_items(report_id);
GRANT SELECT,DELETE ON public.commission_reports TO authenticated; GRANT SELECT ON public.commission_report_groups, public.commission_report_items TO authenticated;
GRANT ALL ON public.commission_reports, public.commission_report_groups, public.commission_report_items TO service_role;
ALTER TABLE public.commission_reports ENABLE ROW LEVEL SECURITY; ALTER TABLE public.commission_report_groups ENABLE ROW LEVEL SECURITY; ALTER TABLE public.commission_report_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Commission read scope" ON public.commission_reports FOR SELECT TO authenticated USING(public.can_read_all() OR (public.is_approved() AND EXISTS(SELECT 1 FROM public.decision_sellers s WHERE s.code=seller_code AND s.profile_id=auth.uid())));
CREATE POLICY "Admin deletes commission reports" ON public.commission_reports FOR DELETE TO authenticated USING(public.has_role(auth.uid(),'admin'));
CREATE POLICY "Commission groups follow report" ON public.commission_report_groups FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.commission_reports r WHERE r.id=report_id));
CREATE POLICY "Commission items follow report" ON public.commission_report_items FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.commission_reports r WHERE r.id=report_id));
CREATE TRIGGER commission_reports_audit AFTER INSERT OR DELETE ON public.commission_reports FOR EACH ROW EXECUTE FUNCTION public.audit_admin_change();

-- Importação atômica: substitui o relatório do mesmo tipo/loja/vendedor/mês e só aceita se as linhas somarem os totais impressos.
CREATE OR REPLACE FUNCTION public.import_commission_report(_report jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _id uuid; _kind text:=_report->>'kind'; _code integer:=(_report->>'seller_code')::integer; _sold bigint; _comm bigint; _start date:=(_report->>'period_start')::date;
BEGIN
IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
IF _kind NOT IN ('sintetico','analitico') THEN RAISE EXCEPTION 'Invalid report kind'; END IF;
IF _kind='sintetico' THEN SELECT coalesce(sum((g->>'sold_cents')::bigint),0), coalesce(sum((g->>'commission_cents')::bigint),0) INTO _sold,_comm FROM jsonb_array_elements(_report->'lines') g;
ELSE SELECT coalesce(sum((i->>'total_cents')::bigint),0), coalesce(sum((i->>'commission_cents')::bigint),0) INTO _sold,_comm FROM jsonb_array_elements(_report->'lines') i; END IF;
IF _sold<>(_report->>'total_sold_cents')::bigint OR _comm<>(_report->>'total_commission_cents')::bigint THEN RAISE EXCEPTION 'Report lines do not match its totals'; END IF;
INSERT INTO public.decision_sellers(code,name) VALUES(_code,left(_report->>'seller_name',120)) ON CONFLICT(code) DO NOTHING;
DELETE FROM public.commission_reports WHERE kind=_kind AND unit_code=_report->>'unit_code' AND seller_code=_code AND competence=date_trunc('month',_start)::date;
INSERT INTO public.commission_reports(kind,unit_code,seller_code,competence,period_start,period_end,total_sold_cents,total_commission_cents,allowance_cents,file_name)
VALUES(_kind,_report->>'unit_code',_code,date_trunc('month',_start)::date,_start,(_report->>'period_end')::date,(_report->>'total_sold_cents')::bigint,(_report->>'total_commission_cents')::bigint,coalesce((_report->>'allowance_cents')::bigint,0),left(_report->>'file_name',200)) RETURNING id INTO _id;
IF _kind='sintetico' THEN
INSERT INTO public.commission_report_groups(report_id,position,group_name,rate_bp,sold_cents,commission_cents) SELECT _id,ord::integer,g->>'group_name',(g->>'rate_bp')::integer,(g->>'sold_cents')::bigint,(g->>'commission_cents')::bigint FROM jsonb_array_elements(_report->'lines') WITH ORDINALITY AS t(g,ord);
ELSE
INSERT INTO public.commission_report_items(report_id,position,sale_number,product_code,description,quantity,total_cents,rate_bp,commission_cents) SELECT _id,ord::integer,i->>'sale_number',i->>'product_code',i->>'description',(i->>'quantity')::numeric,(i->>'total_cents')::bigint,(i->>'rate_bp')::integer,(i->>'commission_cents')::bigint FROM jsonb_array_elements(_report->'lines') WITH ORDINALITY AS t(i,ord);
END IF;
RETURN _id; END $$;
REVOKE ALL ON FUNCTION public.import_commission_report(jsonb) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.import_commission_report(jsonb) TO authenticated;

-- Resumo de OS por relatório analítico (respeita RLS de quem consulta): OS = números de venda distintos.
CREATE OR REPLACE FUNCTION public.commission_os_summary(_competence date) RETURNS TABLE(report_id uuid, unit_code text, seller_code integer, os_count bigint) LANGUAGE sql STABLE SET search_path=public AS $$
SELECT r.id, r.unit_code, r.seller_code, count(DISTINCT i.sale_number) FROM public.commission_reports r JOIN public.commission_report_items i ON i.report_id=r.id WHERE r.kind='analitico' AND r.competence=_competence GROUP BY r.id, r.unit_code, r.seller_code $$;
REVOKE ALL ON FUNCTION public.commission_os_summary(date) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.commission_os_summary(date) TO authenticated;
