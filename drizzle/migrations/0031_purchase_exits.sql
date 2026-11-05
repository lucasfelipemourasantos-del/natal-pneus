-- Controle de estoque: destino provável de cada item das notas de compra (vendas do mesmo produto, na mesma loja, depois da entrada).
CREATE TABLE IF NOT EXISTS public.purchase_exits (
  nota bigint NOT NULL,
  position integer NOT NULL,
  sale bigint NOT NULL,
  plate text,
  client text,
  sold_on date NOT NULL,
  quantity numeric NOT NULL,
  PRIMARY KEY (nota, position, sale),
  FOREIGN KEY (nota, position) REFERENCES public.purchase_note_items(nota, position) ON DELETE CASCADE
);
ALTER TABLE public.purchase_exits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Purchase exits admin read" ON public.purchase_exits;
CREATE POLICY "Purchase exits admin read" ON public.purchase_exits FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
GRANT SELECT ON public.purchase_exits TO authenticated;
GRANT ALL ON public.purchase_exits TO service_role;

-- Troca os destinos das notas recebidas no período (a rotina de atualização manda o período inteiro).
CREATE OR REPLACE FUNCTION public.replace_purchase_exits(_from date, _to date, _rows jsonb) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _n integer;
BEGIN
IF coalesce(auth.role(),'')<>'service_role' AND NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
DELETE FROM public.purchase_exits WHERE nota IN (SELECT nota FROM public.purchase_notes WHERE received_on BETWEEN _from AND _to);
INSERT INTO public.purchase_exits(nota,position,sale,plate,client,sold_on,quantity)
SELECT (x->>'nota')::bigint,(x->>'position')::integer,(x->>'sale')::bigint,x->>'plate',left(x->>'client',120),(x->>'sold_on')::date,(x->>'quantity')::numeric
FROM jsonb_array_elements(_rows) x
WHERE EXISTS(SELECT 1 FROM public.purchase_note_items i WHERE i.nota=(x->>'nota')::bigint AND i.position=(x->>'position')::integer)
ON CONFLICT (nota,position,sale) DO NOTHING;
GET DIAGNOSTICS _n = ROW_COUNT;
RETURN _n; END $$;
REVOKE ALL ON FUNCTION public.replace_purchase_exits(date,date,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.replace_purchase_exits(date,date,jsonb) TO authenticated, service_role;
