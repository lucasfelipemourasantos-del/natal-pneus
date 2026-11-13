-- Escala 5x2: funções de cada pessoa (principal, complementar ou potencial) para o mapa mental editável.
-- Exemplo do conteúdo: {"vendedor":"principal","estoquista":"complementar","caixa":"potencial"}
ALTER TABLE public.workforce_people ADD COLUMN IF NOT EXISTS abilities jsonb NOT NULL DEFAULT '{}'::jsonb;
