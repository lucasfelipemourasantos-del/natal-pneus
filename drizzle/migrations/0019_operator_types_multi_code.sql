-- Tipo de operador (uma pessoa pode ter mais de um), usuários genéricos e contas ligadas a mais de um código do Decision.

-- Tipos: mecanico, alinhador, balanceador, borracheiro, chefe.
ALTER TABLE public.decision_sellers ADD COLUMN IF NOT EXISTS operator_roles text[] NOT NULL DEFAULT '{}';
-- Usuários genéricos do Decision (ex.: TECNICO PNEUS) entram nos totais, mas não são pessoas: sem conta e fora das listas.
ALTER TABLE public.decision_sellers ADD COLUMN IF NOT EXISTS is_person boolean NOT NULL DEFAULT true;

-- Uma conta pode ter mais de um código (ex.: Wagner, chefe de pista e mecânico).
ALTER TABLE public.decision_sellers DROP CONSTRAINT IF EXISTS decision_sellers_profile_id_key;
CREATE INDEX IF NOT EXISTS decision_sellers_profile ON public.decision_sellers(profile_id);

-- Tipos definidos pelo RH em 27/10/2026.
UPDATE public.decision_sellers SET operator_roles = ARRAY['mecanico'] WHERE code IN (163, 164, 176, 157, 48, 130, 213, 203, 206);
UPDATE public.decision_sellers SET operator_roles = ARRAY['alinhador'] WHERE code IN (182, 184, 216);
UPDATE public.decision_sellers SET operator_roles = ARRAY['alinhador', 'balanceador'] WHERE code IN (70, 196, 61);
UPDATE public.decision_sellers SET operator_roles = ARRAY['borracheiro'] WHERE code IN (159, 220);
UPDATE public.decision_sellers SET operator_roles = ARRAY['borracheiro', 'balanceador'] WHERE code IN (116, 183, 102, 68);
UPDATE public.decision_sellers SET operator_roles = ARRAY['chefe'] WHERE code IN (168, 72, 34);

-- Genérico: só totaliza.
UPDATE public.decision_sellers SET is_person = false WHERE code = 98;
-- Sem comissão nos últimos 6 meses: só histórico.
UPDATE public.decision_sellers SET active = false WHERE code IN (172, 107);
