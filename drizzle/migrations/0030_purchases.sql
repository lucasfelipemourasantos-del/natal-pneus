-- Controle de estoque, etapa 1: notas de compra (entrada) e fornecedores vindos da API do Decision. Só o ADM lê.
CREATE TABLE IF NOT EXISTS public.suppliers (
  code integer PRIMARY KEY,
  name text NOT NULL,
  fantasy text,
  cnpj text,
  city text,
  uf text,
  active boolean NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS public.purchase_notes (
  nota bigint PRIMARY KEY,
  unit_code text NOT NULL REFERENCES public.units(code),
  warehouse integer NOT NULL,
  number text,
  series text,
  access_key text,
  supplier_code integer,
  kind smallint NOT NULL CHECK (kind BETWEEN 0 AND 4),
  kind_name text NOT NULL,
  issued_on date,
  received_on date NOT NULL,
  total_cents bigint NOT NULL,
  discount_cents bigint NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS purchase_notes_received_idx ON public.purchase_notes (received_on, unit_code);
CREATE TABLE IF NOT EXISTS public.purchase_note_items (
  nota bigint NOT NULL REFERENCES public.purchase_notes(nota) ON DELETE CASCADE,
  position integer NOT NULL,
  product_code integer NOT NULL,
  description text NOT NULL,
  is_service boolean NOT NULL DEFAULT false,
  cfop text,
  quantity numeric NOT NULL,
  unit_cents bigint NOT NULL,
  item_total_cents bigint NOT NULL,
  advance_note bigint,
  PRIMARY KEY (nota, position)
);
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_note_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Suppliers admin read" ON public.suppliers;
DROP POLICY IF EXISTS "Purchase notes admin read" ON public.purchase_notes;
DROP POLICY IF EXISTS "Purchase items admin read" ON public.purchase_note_items;
CREATE POLICY "Suppliers admin read" ON public.suppliers FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Purchase notes admin read" ON public.purchase_notes FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Purchase items admin read" ON public.purchase_note_items FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
GRANT SELECT ON public.suppliers, public.purchase_notes, public.purchase_note_items TO authenticated;
GRANT ALL ON public.suppliers, public.purchase_notes, public.purchase_note_items TO service_role;

CREATE OR REPLACE FUNCTION public.replace_purchase_notes(_from date, _to date, _notes jsonb) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _n integer;
BEGIN
IF coalesce(auth.role(),'')<>'service_role' AND NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
DELETE FROM public.purchase_notes WHERE received_on BETWEEN _from AND _to;
INSERT INTO public.purchase_notes(nota,unit_code,warehouse,number,series,access_key,supplier_code,kind,kind_name,issued_on,received_on,total_cents,discount_cents)
SELECT (x->>'nota')::bigint,x->>'unit_code',(x->>'warehouse')::integer,x->>'number',x->>'series',x->>'access_key',(x->>'supplier_code')::integer,(x->>'kind')::smallint,x->>'kind_name',
  nullif(x->>'issued_on','')::date,(x->>'received_on')::date,(x->>'total_cents')::bigint,(x->>'discount_cents')::bigint
FROM jsonb_array_elements(_notes) x WHERE EXISTS(SELECT 1 FROM public.units u WHERE u.code=x->>'unit_code') AND (x->>'received_on')::date BETWEEN _from AND _to
ON CONFLICT (nota) DO NOTHING;
GET DIAGNOSTICS _n = ROW_COUNT;
INSERT INTO public.purchase_note_items(nota,position,product_code,description,is_service,cfop,quantity,unit_cents,item_total_cents,advance_note)
SELECT (n->>'nota')::bigint,ord::integer,(i->>'product_code')::integer,left(i->>'description',200),(i->>'is_service')::boolean,i->>'cfop',(i->>'quantity')::numeric,(i->>'unit_cents')::bigint,(i->>'item_total_cents')::bigint,nullif(i->>'advance_note','')::bigint
FROM jsonb_array_elements(_notes) n, jsonb_array_elements(n->'items') WITH ORDINALITY AS t(i,ord)
WHERE EXISTS(SELECT 1 FROM public.purchase_notes p WHERE p.nota=(n->>'nota')::bigint)
ON CONFLICT (nota,position) DO NOTHING;
RETURN _n; END $$;
REVOKE ALL ON FUNCTION public.replace_purchase_notes(date,date,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.replace_purchase_notes(date,date,jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.upsert_suppliers(_rows jsonb) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _n integer;
BEGIN
IF coalesce(auth.role(),'')<>'service_role' AND NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
INSERT INTO public.suppliers(code,name,fantasy,cnpj,city,uf,active)
SELECT (x->>'code')::integer,left(x->>'name',200),left(x->>'fantasy',200),x->>'cnpj',x->>'city',x->>'uf',(x->>'active')::boolean FROM jsonb_array_elements(_rows) x
ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name,fantasy=EXCLUDED.fantasy,cnpj=EXCLUDED.cnpj,city=EXCLUDED.city,uf=EXCLUDED.uf,active=EXCLUDED.active;
GET DIAGNOSTICS _n = ROW_COUNT;
RETURN _n; END $$;
REVOKE ALL ON FUNCTION public.upsert_suppliers(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.upsert_suppliers(jsonb) TO authenticated, service_role;
