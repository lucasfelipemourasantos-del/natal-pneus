-- Alertas de clientes: avisos do Decision (webhook) quando o tipo do cliente muda (varejo→frota, varejo→atacado, frota→atacado).
CREATE TABLE IF NOT EXISTS public.customer_type_changes (
  notice bigint PRIMARY KEY,
  customer_code integer NOT NULL,
  customer_name text,
  old_type smallint,
  new_type smallint,
  old_name text,
  new_name text,
  event_at timestamp,
  received_at timestamptz NOT NULL DEFAULT now(),
  seen_at timestamptz,
  seen_by uuid
);
CREATE INDEX IF NOT EXISTS customer_type_changes_received_idx ON public.customer_type_changes (received_at DESC);
ALTER TABLE public.customer_type_changes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Customer changes admin read" ON public.customer_type_changes;
DROP POLICY IF EXISTS "Customer changes admin update" ON public.customer_type_changes;
CREATE POLICY "Customer changes admin read" ON public.customer_type_changes FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Customer changes admin update" ON public.customer_type_changes FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
GRANT SELECT, UPDATE ON public.customer_type_changes TO authenticated;
GRANT ALL ON public.customer_type_changes TO service_role;

-- Segredo combinado com o Decision: só o resumo (SHA-256) fica no banco; ninguém lê esta tabela pelo portal.
CREATE TABLE IF NOT EXISTS public.webhook_secrets (
  name text PRIMARY KEY,
  secret_hash text NOT NULL
);
ALTER TABLE public.webhook_secrets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.webhook_secrets FROM anon, authenticated;
GRANT ALL ON public.webhook_secrets TO service_role;
INSERT INTO public.webhook_secrets(name, secret_hash) VALUES ('cliente', 'f972a186069def50345d2729ff2bac718e9169ebe352da3de9d6af1ce849c560')
ON CONFLICT (name) DO UPDATE SET secret_hash = EXCLUDED.secret_hash;

-- O portal (já com a assinatura do Decision conferida) grava o aviso por esta função. Repetido (mesmo número) não grava de novo.
CREATE OR REPLACE FUNCTION public.record_customer_type_change(
  _secret text, _notice bigint, _code integer, _name text, _old smallint, _new smallint, _old_name text, _new_name text, _event_at timestamp
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _ok boolean; _n integer;
BEGIN
SELECT encode(sha256(convert_to(coalesce(_secret,''),'UTF8')),'hex') = secret_hash INTO _ok FROM public.webhook_secrets WHERE name='cliente';
IF NOT coalesce(_ok,false) THEN RAISE EXCEPTION 'Forbidden'; END IF;
INSERT INTO public.customer_type_changes(notice,customer_code,customer_name,old_type,new_type,old_name,new_name,event_at)
VALUES(_notice,_code,left(_name,160),_old,_new,left(_old_name,40),left(_new_name,40),_event_at)
ON CONFLICT (notice) DO NOTHING;
GET DIAGNOSTICS _n = ROW_COUNT;
RETURN _n > 0; END $$;
REVOKE ALL ON FUNCTION public.record_customer_type_change(text,bigint,integer,text,smallint,smallint,text,text,timestamp) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_customer_type_change(text,bigint,integer,text,smallint,smallint,text,text,timestamp) TO anon, authenticated, service_role;
