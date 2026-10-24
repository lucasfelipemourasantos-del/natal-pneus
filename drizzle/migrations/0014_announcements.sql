-- Comunicados do RH: texto com anexo opcional, para todos, uma loja ou uma função, com período de exibição.
-- Cada funcionário precisa confirmar a leitura ("Li e estou ciente"); o RH vê quem leu.
CREATE TABLE IF NOT EXISTS public.announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 160),
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 8000),
  category text NOT NULL DEFAULT 'aviso' CHECK (category IN ('aviso','ferias','exames','cursos','eventos')),
  audience_unit text REFERENCES public.units(code),
  audience_job text,
  starts_on date NOT NULL DEFAULT current_date,
  ends_on date,
  attachment_path text,
  attachment_name text,
  active boolean NOT NULL DEFAULT true,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_on IS NULL OR ends_on >= starts_on)
);
CREATE TABLE IF NOT EXISTS public.announcement_reads (
  announcement_id uuid NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (announcement_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.announcements TO authenticated; GRANT ALL ON public.announcements TO service_role;
GRANT SELECT, INSERT ON public.announcement_reads TO authenticated; GRANT ALL ON public.announcement_reads TO service_role;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcement_reads ENABLE ROW LEVEL SECURITY;

-- Quem vê: o ADM vê tudo; o funcionário aprovado vê os ativos, dentro do período, do seu público.
-- Quem é de "todas as lojas" (sem loja) vê os comunicados de qualquer loja.
DROP POLICY IF EXISTS "Announcements read scope" ON public.announcements;
CREATE POLICY "Announcements read scope" ON public.announcements FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(),'admin') OR (
    public.is_approved() AND active AND starts_on <= current_date AND (ends_on IS NULL OR ends_on >= current_date)
    AND (audience_unit IS NULL OR public.current_unit() IS NULL OR audience_unit = public.current_unit())
    AND (audience_job IS NULL OR audience_job = (SELECT p.job_role FROM public.profiles p WHERE p.id = auth.uid()))
  ));
DROP POLICY IF EXISTS "Admin manages announcements" ON public.announcements;
CREATE POLICY "Admin manages announcements" ON public.announcements FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "Own reads or admin" ON public.announcement_reads;
CREATE POLICY "Own reads or admin" ON public.announcement_reads FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS "Confirm own reading" ON public.announcement_reads;
CREATE POLICY "Confirm own reading" ON public.announcement_reads FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.announcements a WHERE a.id = announcement_id));

DROP TRIGGER IF EXISTS announcements_audit ON public.announcements;
CREATE TRIGGER announcements_audit AFTER INSERT OR UPDATE OR DELETE ON public.announcements FOR EACH ROW EXECUTE FUNCTION public.audit_admin_change();

-- Anexos: pasta privada; só o ADM envia/apaga; lê quem pode ver o comunicado que usa o arquivo.
INSERT INTO storage.buckets (id, name, public) VALUES ('announcements','announcements',false) ON CONFLICT (id) DO NOTHING;
DROP POLICY IF EXISTS "Admin uploads announcement files" ON storage.objects;
CREATE POLICY "Admin uploads announcement files" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'announcements' AND public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS "Admin deletes announcement files" ON storage.objects;
CREATE POLICY "Admin deletes announcement files" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'announcements' AND public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS "Audience reads announcement files" ON storage.objects;
CREATE POLICY "Audience reads announcement files" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'announcements' AND EXISTS (SELECT 1 FROM public.announcements a WHERE a.attachment_path = name));
