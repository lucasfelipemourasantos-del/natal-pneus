-- Escala 5x2: a formação passa a aceitar também as funções da comissão técnica (gerente, comprador, financeiro, RH, DP...),
-- que ficam fora do campo. Sem lista fixa no banco: novas funções não exigem outro SQL.
ALTER TABLE public.workforce_lineup DROP CONSTRAINT IF EXISTS workforce_lineup_fn_check;
ALTER TABLE public.workforce_lineup ADD CONSTRAINT workforce_lineup_fn_check CHECK (length(fn) BETWEEN 2 AND 40);
