-- Contagem de OS dos operadores (números de venda distintos), no mesmo formato de commission_os_summary.
CREATE OR REPLACE FUNCTION public.technician_os_summary(_competence date) RETURNS TABLE(report_id uuid, unit_code text, seller_code integer, os_count bigint) LANGUAGE sql STABLE SET search_path=public AS $$
SELECT r.id, r.unit_code, r.seller_code, count(DISTINCT i.sale_number) FROM public.commission_reports r JOIN public.commission_report_items i ON i.report_id=r.id WHERE r.kind='tecnico' AND r.competence=_competence GROUP BY r.id, r.unit_code, r.seller_code $$;
REVOKE ALL ON FUNCTION public.technician_os_summary(date) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.technician_os_summary(date) TO authenticated;
