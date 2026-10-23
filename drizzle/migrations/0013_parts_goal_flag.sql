-- Meta de peças por vendedor (pode ser executado de novo sem problema).
-- parts_goal: ligada por padrão; desligada para quem não tem meta de peças (Charles e Eliane, da NP2).
-- min_average: o vendedor usa a "média mínima" (a menor base entre os vendedores ativos com 12 meses completos) no lugar da própria (Erivan e Israel).
ALTER TABLE public.decision_sellers ADD COLUMN IF NOT EXISTS parts_goal boolean NOT NULL DEFAULT true;
ALTER TABLE public.decision_sellers ADD COLUMN IF NOT EXISTS min_average boolean NOT NULL DEFAULT false;
ALTER TABLE public.decision_sellers DROP COLUMN IF EXISTS goal_ref_code;
UPDATE public.decision_sellers SET parts_goal=false WHERE code IN (49,36);
UPDATE public.decision_sellers SET min_average=true WHERE code IN (195,221) AND min_average=false;

-- Média mínima: base de cada vendedor = média das peças dos 12 meses anteriores sem o pior mês (mesma regra do portal).
-- Vale como "regular" quem está ativo (vendeu neste mês ou no anterior), tem os 12 meses completos, tem meta de peças e não usa a média mínima.
-- Devolve só o número, nunca as vendas de ninguém: o vendedor recebe a própria linha, a liderança recebe todas.
CREATE OR REPLACE FUNCTION public.parts_goal_reference_base(_competence date)
RETURNS TABLE(seller_code integer, ref_code integer, base_cents bigint, months integer, dropped_month date)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
IF NOT (public.is_approved() OR coalesce(auth.role(),'')='service_role') THEN RETURN; END IF;
RETURN QUERY
WITH mo AS (
  SELECT r.seller_code AS sc, r.competence AS m,
         coalesce(sum(g.sold_cents) FILTER (WHERE translate(upper(g.group_name),'ÇÃÁÂÉÊÍÓÔÕÚ','CAAAEEIOOOU')='PECAS'),0)::bigint AS cents
  FROM public.commission_reports r LEFT JOIN public.commission_report_groups g ON g.report_id=r.id
  WHERE r.kind='api' AND r.competence >= (_competence - interval '12 months')::date AND r.competence < _competence
  GROUP BY r.seller_code, r.competence),
ranked AS (
  SELECT mo.sc, mo.m, mo.cents, row_number() OVER (PARTITION BY mo.sc ORDER BY mo.cents, mo.m) AS rn, count(*) OVER (PARTITION BY mo.sc) AS n FROM mo),
bs AS (
  SELECT ranked.sc, round(avg(ranked.cents))::bigint AS b, count(*)::integer AS k, max(ranked.n) AS n
  FROM ranked WHERE NOT (ranked.n >= 6 AND ranked.rn = 1) GROUP BY ranked.sc),
reg AS (
  SELECT bs.sc, bs.b, bs.k FROM bs JOIN public.decision_sellers d ON d.code = bs.sc
  WHERE bs.n >= 12 AND bs.b > 0 AND NOT d.ignored AND d.parts_goal AND NOT d.min_average
    AND EXISTS (SELECT 1 FROM public.commission_reports a WHERE a.kind='api' AND a.seller_code=bs.sc AND a.competence >= (_competence - interval '1 month')::date AND a.competence <= _competence)),
piso AS (SELECT reg.sc, reg.b, reg.k FROM reg ORDER BY reg.b, reg.sc LIMIT 1)
SELECT d.code, piso.sc, piso.b, piso.k, NULL::date
FROM public.decision_sellers d CROSS JOIN piso
WHERE d.min_average AND (public.can_read_all() OR d.profile_id = auth.uid() OR coalesce(auth.role(),'')='service_role');
END $$;
REVOKE ALL ON FUNCTION public.parts_goal_reference_base(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.parts_goal_reference_base(date) TO authenticated, service_role;
