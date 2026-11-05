-- Controle de estoque com os movimentos reais do Decision: destino de cada item das notas (venda, transferência, devolução, ajuste),
-- saldo atual por almoxarifado e produtos. Só o ADM lê.

-- 1) Destino dos itens das notas: agora por movimento (venda, transferência, devolução...). Recria a tabela da etapa provável.
DROP TABLE IF EXISTS public.purchase_exits;
CREATE TABLE public.purchase_exits (
  nota bigint NOT NULL,
  position integer NOT NULL,
  movement bigint NOT NULL,
  kind text NOT NULL,
  kind_name text NOT NULL,
  dest_warehouse integer,
  sale bigint,
  plate text,
  client text,
  moved_on date NOT NULL,
  quantity numeric NOT NULL,
  PRIMARY KEY (nota, position, movement),
  FOREIGN KEY (nota, position) REFERENCES public.purchase_note_items(nota, position) ON DELETE CASCADE
);
ALTER TABLE public.purchase_exits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Purchase exits admin read" ON public.purchase_exits FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
GRANT SELECT ON public.purchase_exits TO authenticated;
GRANT ALL ON public.purchase_exits TO service_role;

CREATE OR REPLACE FUNCTION public.replace_purchase_exits(_from date, _to date, _rows jsonb) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _n integer;
BEGIN
IF coalesce(auth.role(),'')<>'service_role' AND NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
DELETE FROM public.purchase_exits WHERE nota IN (SELECT nota FROM public.purchase_notes WHERE received_on BETWEEN _from AND _to);
INSERT INTO public.purchase_exits(nota,position,movement,kind,kind_name,dest_warehouse,sale,plate,client,moved_on,quantity)
SELECT (x->>'nota')::bigint,(x->>'position')::integer,(x->>'movement')::bigint,x->>'kind',x->>'kind_name',nullif(x->>'dest_warehouse','')::integer,nullif(x->>'sale','')::bigint,x->>'plate',left(x->>'client',120),(x->>'moved_on')::date,(x->>'quantity')::numeric
FROM jsonb_array_elements(_rows) x
WHERE EXISTS(SELECT 1 FROM public.purchase_note_items i WHERE i.nota=(x->>'nota')::bigint AND i.position=(x->>'position')::integer)
ON CONFLICT (nota,position,movement) DO NOTHING;
GET DIAGNOSTICS _n = ROW_COUNT;
RETURN _n; END $$;
REVOKE ALL ON FUNCTION public.replace_purchase_exits(date,date,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.replace_purchase_exits(date,date,jsonb) TO authenticated, service_role;

-- 2) Produtos (nome para as listas) e saldo atual por almoxarifado.
CREATE TABLE IF NOT EXISTS public.products (
  product integer PRIMARY KEY,
  description text NOT NULL,
  is_service boolean NOT NULL DEFAULT false,
  class_name text
);
CREATE TABLE IF NOT EXISTS public.stock_balances (
  warehouse integer NOT NULL,
  product integer NOT NULL,
  balance numeric NOT NULL,
  cost_cents bigint NOT NULL DEFAULT 0,
  last_sale_on date,
  PRIMARY KEY (warehouse, product)
);
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_balances ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Products admin read" ON public.products;
DROP POLICY IF EXISTS "Stock balances admin read" ON public.stock_balances;
CREATE POLICY "Products admin read" ON public.products FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Stock balances admin read" ON public.stock_balances FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
GRANT SELECT ON public.products, public.stock_balances TO authenticated;
GRANT ALL ON public.products, public.stock_balances TO service_role;

CREATE OR REPLACE FUNCTION public.replace_stock_balances(_rows jsonb) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _n integer;
BEGIN
IF coalesce(auth.role(),'')<>'service_role' AND NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
DELETE FROM public.stock_balances WHERE true;
INSERT INTO public.stock_balances(warehouse,product,balance,cost_cents,last_sale_on)
SELECT (x->>'warehouse')::integer,(x->>'product')::integer,(x->>'balance')::numeric,(x->>'cost_cents')::bigint,nullif(x->>'last_sale_on','')::date FROM jsonb_array_elements(_rows) x
ON CONFLICT (warehouse,product) DO NOTHING;
GET DIAGNOSTICS _n = ROW_COUNT;
RETURN _n; END $$;
REVOKE ALL ON FUNCTION public.replace_stock_balances(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.replace_stock_balances(jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.upsert_products(_rows jsonb) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _n integer;
BEGIN
IF coalesce(auth.role(),'')<>'service_role' AND NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
INSERT INTO public.products(product,description,is_service,class_name)
SELECT (x->>'product')::integer,left(x->>'description',200),(x->>'is_service')::boolean,left(x->>'class_name',80) FROM jsonb_array_elements(_rows) x
ON CONFLICT (product) DO UPDATE SET description=EXCLUDED.description,is_service=EXCLUDED.is_service,class_name=EXCLUDED.class_name;
GET DIAGNOSTICS _n = ROW_COUNT;
RETURN _n; END $$;
REVOKE ALL ON FUNCTION public.upsert_products(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.upsert_products(jsonb) TO authenticated, service_role;
