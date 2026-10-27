-- Vendedores em atividade x apenas para histórico. Quem está só para histórico mantém as vendas passadas nos relatórios,
-- mas não recebe conta vinculada nem acesso à abertura de OS por voz.
ALTER TABLE public.decision_sellers ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

-- Só para histórico (definido pelo RH em 27/10/2026).
INSERT INTO public.decision_sellers(code, name, active) VALUES
  (186, 'GENILSON', false),
  (154, 'IASMIN SOARES WANDERLEI', false),
  (212, 'LUIS HENRIQUE NP4', false),
  (215, 'NILVERTON PAIVA', false),
  (23,  'ALEXANDRE SOARES DANTAS', false),
  (38,  'FRANCISCO SALY DE SOUZA', false),
  (156, 'LUANA', false),
  (187, 'RODNEY GOMES', false)
ON CONFLICT (code) DO UPDATE SET active = false;
