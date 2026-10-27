-- Patrimônio: só o ADM RH (todas as lojas) e, na própria loja, quem tem a função Chefe de pista ou Supervisor.
-- Diretoria e gerência geral deixam de entrar automaticamente.
CREATE OR REPLACE FUNCTION public.assets_scope(_unit text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(), 'admin') OR (public.is_approved() AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.unit_code = _unit AND p.job_role IN ('Chefe de pista', 'Supervisor')))
$$;
