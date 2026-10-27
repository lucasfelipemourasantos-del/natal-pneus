-- Metas de mão de obra dos mecânicos (faixas bronze, prata e ouro, cada uma com um bônus) e equipes de comissão unificada.

CREATE TABLE public.technician_goals (
  seller_code integer NOT NULL REFERENCES public.decision_sellers(code) ON DELETE CASCADE,
  tier text NOT NULL CHECK(tier IN ('bronze','prata','ouro')),
  target_cents bigint NOT NULL CHECK(target_cents > 0),
  bonus_cents bigint NOT NULL CHECK(bonus_cents >= 0),
  PRIMARY KEY (seller_code, tier)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.technician_goals TO authenticated;
GRANT ALL ON public.technician_goals TO service_role;
ALTER TABLE public.technician_goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Technician goals read scope" ON public.technician_goals FOR SELECT TO authenticated
  USING (public.can_read_all() OR EXISTS (SELECT 1 FROM public.decision_sellers s WHERE s.code = seller_code AND s.profile_id = auth.uid()));
CREATE POLICY "Admin writes technician goals" ON public.technician_goals FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER technician_goals_audit AFTER INSERT OR UPDATE OR DELETE ON public.technician_goals FOR EACH ROW EXECUTE FUNCTION public.audit_admin_change();

-- Metas informadas pelo RH (valores em centavos). 163 Jorgivan, 164 Alexandre Neto, 176 Jean Cleber (NP1),
-- 157 Cláudio, 130 Edivan, 203 Jailton (NP3), 48 Luciano, 213 Derek Lucas (NP4).
INSERT INTO public.technician_goals(seller_code, tier, target_cents, bonus_cents) VALUES
  (163,'bronze', 877459, 17800), (163,'prata', 957228, 29500), (163,'ouro', 997112, 50500),
  (164,'bronze', 774100, 15800), (164,'prata', 844473, 25800), (164,'ouro', 879660, 44800),
  (176,'bronze', 697246, 14000), (176,'prata', 760632, 24000), (176,'ouro', 792325, 40000),
  (157,'bronze', 842500, 17000), (157,'prata', 919091, 28000), (157,'ouro', 957387, 48000),
  (48,'bronze',  550000, 11000), (48,'prata',  600000, 18000), (48,'ouro',  625000, 31500),
  (130,'bronze', 808573, 16500), (130,'prata', 882080, 26500), (130,'ouro', 918833, 46500),
  (213,'bronze', 440000,  9000), (213,'prata', 480000, 14500), (213,'ouro', 500000, 25000),
  (203,'bronze', 932848, 19000), (203,'prata',1017652, 31000), (203,'ouro',1060054, 53500)
ON CONFLICT (seller_code, tier) DO UPDATE SET target_cents = EXCLUDED.target_cents, bonus_cents = EXCLUDED.bonus_cents;

-- Equipes cuja comissão é somada e dividida igualmente entre os membros. A meta continua individual.
CREATE TABLE public.commission_teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK(length(name) BETWEEN 1 AND 80),
  unit_code text NOT NULL REFERENCES public.units(code),
  members integer[] NOT NULL CHECK(cardinality(members) >= 2)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.commission_teams TO authenticated;
GRANT ALL ON public.commission_teams TO service_role;
ALTER TABLE public.commission_teams ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Leadership reads teams" ON public.commission_teams FOR SELECT TO authenticated USING (public.can_read_all());
CREATE POLICY "Admin writes teams" ON public.commission_teams FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER commission_teams_audit AFTER INSERT OR UPDATE OR DELETE ON public.commission_teams FOR EACH ROW EXECUTE FUNCTION public.audit_admin_change();

INSERT INTO public.commission_teams(name, unit_code, members) VALUES ('Mecânicos NP1', 'NP1', ARRAY[163, 164, 176]);

-- Totais da equipe no mês, só para a liderança ou para quem é membro. Devolve somas, nunca as vendas dos colegas.
CREATE OR REPLACE FUNCTION public.team_commission(_competence date)
RETURNS TABLE(team_id uuid, team_name text, unit_code text, member_codes integer[], sold_cents bigint, commission_cents bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT t.id, t.name, t.unit_code, t.members,
         coalesce(sum(r.total_sold_cents), 0)::bigint, coalesce(sum(r.total_commission_cents), 0)::bigint
  FROM public.commission_teams t
  LEFT JOIN public.commission_reports r
    ON r.kind = 'tecnico' AND r.unit_code = t.unit_code AND r.competence = _competence AND r.seller_code = ANY (t.members)
  WHERE public.is_approved() AND (
    public.can_read_all() OR EXISTS (SELECT 1 FROM public.decision_sellers s WHERE s.code = ANY (t.members) AND s.profile_id = auth.uid()))
  GROUP BY t.id, t.name, t.unit_code, t.members
$$;
REVOKE ALL ON FUNCTION public.team_commission(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.team_commission(date) TO authenticated;
