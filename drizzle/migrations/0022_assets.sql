-- Patrimônio (tombo de equipamentos): cadastro com fotos, documentos, histórico de manutenção e baixa.
-- Quem acessa: ADM RH e liderança (todas as lojas) e, na própria loja, quem tem a função Chefe de pista ou Supervisor.
-- Só o ADM RH exclui ou muda um item de loja. A baixa (equipamento finalizado) guarda o histórico.

CREATE OR REPLACE FUNCTION public.assets_scope(_unit text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.can_read_all() OR (public.is_approved() AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.unit_code = _unit AND p.job_role IN ('Chefe de pista', 'Supervisor')))
$$;
REVOKE ALL ON FUNCTION public.assets_scope(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assets_scope(text) TO authenticated;

-- Contador por loja para o código do item (NP3-0001, NP3-0002...).
CREATE TABLE IF NOT EXISTS public.asset_counters (unit_code text PRIMARY KEY REFERENCES public.units(code), last_number integer NOT NULL DEFAULT 0);
ALTER TABLE public.asset_counters ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE,
  unit_code text NOT NULL REFERENCES public.units(code),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 160),
  category text CHECK (length(category) <= 80),
  serial_number text CHECK (length(serial_number) <= 80),
  notes text CHECK (length(notes) <= 2000),
  purchase_date date,
  purchase_cents bigint CHECK (purchase_cents BETWEEN 0 AND 9000000000000),
  estimated_cents bigint CHECK (estimated_cents BETWEEN 0 AND 9000000000000),
  supplier text CHECK (length(supplier) <= 160),
  -- Nem todo equipamento tem manutenção preventiva; só quando aplicável entram o intervalo e a próxima data.
  preventive_applicable boolean NOT NULL DEFAULT false,
  preventive_interval_months integer CHECK (preventive_interval_months BETWEEN 1 AND 120),
  next_preventive date,
  status text NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'em_manutencao', 'baixado')),
  retired_at date,
  retired_reason text CHECK (length(retired_reason) <= 500),
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'baixado' OR retired_at IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS assets_unit ON public.assets(unit_code, status);

CREATE TABLE IF NOT EXISTS public.asset_maintenance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('preventiva', 'corretiva')),
  status text NOT NULL DEFAULT 'realizada' CHECK (status IN ('agendada', 'realizada')),
  scheduled_for date,
  performed_at date,
  description text CHECK (length(description) <= 2000),
  service_note text CHECK (length(service_note) <= 80),
  provider text CHECK (length(provider) <= 160),
  cost_cents bigint CHECK (cost_cents BETWEEN 0 AND 9000000000000),
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'agendada' AND scheduled_for IS NOT NULL) OR (status = 'realizada' AND performed_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS asset_maintenance_asset ON public.asset_maintenance(asset_id);

CREATE TABLE IF NOT EXISTS public.asset_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  maintenance_id uuid REFERENCES public.asset_maintenance(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('foto', 'video', 'documento')),
  storage_path text NOT NULL,
  file_name text NOT NULL CHECK (length(file_name) <= 200),
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS asset_files_asset ON public.asset_files(asset_id);

-- Quem fez o quê: cada criação e alteração do item fica registrada.
CREATE TABLE IF NOT EXISTS public.asset_log (
  id bigserial PRIMARY KEY,
  asset_id uuid NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  action text NOT NULL,
  changes jsonb,
  actor uuid DEFAULT auth.uid(),
  at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset_maintenance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Assets read" ON public.assets;
CREATE POLICY "Assets read" ON public.assets FOR SELECT TO authenticated USING (public.assets_scope(unit_code));
DROP POLICY IF EXISTS "Assets create" ON public.assets;
CREATE POLICY "Assets create" ON public.assets FOR INSERT TO authenticated WITH CHECK (public.assets_scope(unit_code));
DROP POLICY IF EXISTS "Assets update" ON public.assets;
CREATE POLICY "Assets update" ON public.assets FOR UPDATE TO authenticated
  USING (public.assets_scope(unit_code)) WITH CHECK (public.assets_scope(unit_code));
DROP POLICY IF EXISTS "Assets delete" ON public.assets;
CREATE POLICY "Assets delete" ON public.assets FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Manutenção, arquivos e histórico seguem a loja do item.
DROP POLICY IF EXISTS "Maintenance scope" ON public.asset_maintenance;
CREATE POLICY "Maintenance scope" ON public.asset_maintenance FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.assets a WHERE a.id = asset_id AND public.assets_scope(a.unit_code)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.assets a WHERE a.id = asset_id AND public.assets_scope(a.unit_code)));
DROP POLICY IF EXISTS "Files read insert" ON public.asset_files;
CREATE POLICY "Files read insert" ON public.asset_files FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.assets a WHERE a.id = asset_id AND public.assets_scope(a.unit_code)));
DROP POLICY IF EXISTS "Files insert" ON public.asset_files;
CREATE POLICY "Files insert" ON public.asset_files FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.assets a WHERE a.id = asset_id AND public.assets_scope(a.unit_code)));
DROP POLICY IF EXISTS "Files admin delete" ON public.asset_files;
CREATE POLICY "Files admin delete" ON public.asset_files FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Log read" ON public.asset_log;
CREATE POLICY "Log read" ON public.asset_log FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.assets a WHERE a.id = asset_id AND public.assets_scope(a.unit_code)));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.assets, public.asset_maintenance, public.asset_files TO authenticated;
GRANT SELECT ON public.asset_log TO authenticated;
GRANT ALL ON public.assets, public.asset_maintenance, public.asset_files, public.asset_log, public.asset_counters TO service_role;

-- Código do item e registro do histórico.
CREATE OR REPLACE FUNCTION public.assets_before_insert() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  INSERT INTO public.asset_counters(unit_code, last_number) VALUES (NEW.unit_code, 1)
  ON CONFLICT (unit_code) DO UPDATE SET last_number = public.asset_counters.last_number + 1
  RETURNING last_number INTO n;
  NEW.code := NEW.unit_code || '-' || lpad(n::text, 4, '0');
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS assets_code ON public.assets;
CREATE TRIGGER assets_code BEFORE INSERT ON public.assets FOR EACH ROW EXECUTE FUNCTION public.assets_before_insert();

CREATE OR REPLACE FUNCTION public.assets_after_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.asset_log(asset_id, action, changes) VALUES (NEW.id, 'criado', jsonb_build_object('code', NEW.code, 'name', NEW.name));
  ELSIF to_jsonb(NEW) - 'updated_at' IS DISTINCT FROM to_jsonb(OLD) - 'updated_at' THEN
    INSERT INTO public.asset_log(asset_id, action, changes) VALUES (NEW.id,
      CASE WHEN NEW.status = 'baixado' AND OLD.status <> 'baixado' THEN 'baixado' WHEN NEW.unit_code <> OLD.unit_code THEN 'transferido' ELSE 'editado' END,
      (SELECT jsonb_object_agg(k, jsonb_build_object('de', to_jsonb(OLD) -> k, 'para', to_jsonb(NEW) -> k))
         FROM jsonb_object_keys(to_jsonb(NEW)) k WHERE k <> 'updated_at' AND to_jsonb(NEW) -> k IS DISTINCT FROM to_jsonb(OLD) -> k));
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS assets_log_trigger ON public.assets;
CREATE TRIGGER assets_log_trigger AFTER INSERT OR UPDATE ON public.assets FOR EACH ROW EXECUTE FUNCTION public.assets_after_change();

-- Mudar o item de loja é só do ADM RH.
CREATE OR REPLACE FUNCTION public.assets_guard_unit() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.unit_code <> OLD.unit_code AND NOT public.has_role(auth.uid(), 'admin') AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Só o ADM RH muda o equipamento de loja';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS assets_guard_unit_trigger ON public.assets;
CREATE TRIGGER assets_guard_unit_trigger BEFORE UPDATE ON public.assets FOR EACH ROW EXECUTE FUNCTION public.assets_guard_unit();

CREATE OR REPLACE FUNCTION public.assets_touch() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS assets_touch_trigger ON public.assets;
CREATE TRIGGER assets_touch_trigger BEFORE UPDATE ON public.assets FOR EACH ROW EXECUTE FUNCTION public.assets_touch();

-- Arquivos (fotos, vídeos curtos, documentos): bucket privado; a pasta é a loja, então o acesso segue a loja do item.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('assets', 'assets', false, 26214400, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'video/mp4', 'video/quicktime', 'video/webm', 'application/pdf'])
ON CONFLICT (id) DO UPDATE SET file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Assets files read" ON storage.objects;
CREATE POLICY "Assets files read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'assets' AND public.assets_scope((storage.foldername(name))[1]));
DROP POLICY IF EXISTS "Assets files upload" ON storage.objects;
CREATE POLICY "Assets files upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'assets' AND public.assets_scope((storage.foldername(name))[1]));
DROP POLICY IF EXISTS "Assets files delete" ON storage.objects;
CREATE POLICY "Assets files delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'assets' AND public.has_role(auth.uid(), 'admin'));
