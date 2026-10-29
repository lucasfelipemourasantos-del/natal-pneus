-- Documentos da empresa (alvarás, licenças, certidões...) por loja, com validade e alertas de vencimento.
-- Por enquanto só o ADM RH vê. Para liberar ao gerente geral depois, basta acrescentar o papel em company_docs_scope().

CREATE OR REPLACE FUNCTION public.company_docs_scope() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(), 'admin')
$$;
REVOKE ALL ON FUNCTION public.company_docs_scope() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.company_docs_scope() TO authenticated;

CREATE TABLE IF NOT EXISTS public.company_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Loja do documento; vazio = documento da empresa toda ("Empresa (geral)").
  unit_code text REFERENCES public.units(code),
  doc_type text NOT NULL CHECK (doc_type IN ('alvara','bombeiros','licenca_ambiental','vigilancia','certidao','seguro','contrato_locacao','outro')),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 160),
  number text CHECK (length(number) <= 80),
  issuer text CHECK (length(issuer) <= 160),
  issued_at date,
  -- Sem data de validade = documento permanente.
  expires_at date,
  notes text CHECK (length(notes) <= 2000),
  -- Quando o documento é renovado, o antigo aponta para o novo e fica só no histórico.
  superseded_by uuid REFERENCES public.company_documents(id) ON DELETE SET NULL,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS company_documents_unit ON public.company_documents(unit_code, expires_at);

CREATE TABLE IF NOT EXISTS public.company_document_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.company_documents(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  file_name text NOT NULL CHECK (length(file_name) <= 200),
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS company_document_files_doc ON public.company_document_files(document_id);

-- Avisos de vencimento já enviados por e-mail (um por documento e faixa), para não repetir.
CREATE TABLE IF NOT EXISTS public.company_document_alerts (
  document_id uuid NOT NULL REFERENCES public.company_documents(id) ON DELETE CASCADE,
  stage text NOT NULL CHECK (stage IN ('d45', 'd15', 'vencido')),
  sent_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (document_id, stage)
);

ALTER TABLE public.company_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_document_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_document_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Company docs scope" ON public.company_documents;
CREATE POLICY "Company docs scope" ON public.company_documents FOR ALL TO authenticated
  USING (public.company_docs_scope()) WITH CHECK (public.company_docs_scope());
DROP POLICY IF EXISTS "Company doc files scope" ON public.company_document_files;
CREATE POLICY "Company doc files scope" ON public.company_document_files FOR ALL TO authenticated
  USING (public.company_docs_scope()) WITH CHECK (public.company_docs_scope());
DROP POLICY IF EXISTS "Company doc alerts read" ON public.company_document_alerts;
CREATE POLICY "Company doc alerts read" ON public.company_document_alerts FOR SELECT TO authenticated
  USING (public.company_docs_scope());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_documents, public.company_document_files TO authenticated;
GRANT SELECT ON public.company_document_alerts TO authenticated;
GRANT ALL ON public.company_documents, public.company_document_files, public.company_document_alerts TO service_role;

CREATE OR REPLACE FUNCTION public.company_documents_touch() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS company_documents_touch_trigger ON public.company_documents;
CREATE TRIGGER company_documents_touch_trigger BEFORE UPDATE ON public.company_documents FOR EACH ROW EXECUTE FUNCTION public.company_documents_touch();

-- Mudou a validade: os avisos daquele documento voltam a valer.
CREATE OR REPLACE FUNCTION public.company_documents_reset_alerts() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.expires_at IS DISTINCT FROM OLD.expires_at THEN
    DELETE FROM public.company_document_alerts WHERE document_id = NEW.id;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS company_documents_reset_alerts_trigger ON public.company_documents;
CREATE TRIGGER company_documents_reset_alerts_trigger AFTER UPDATE ON public.company_documents FOR EACH ROW EXECUTE FUNCTION public.company_documents_reset_alerts();

-- Arquivos: bucket privado; a pasta é a loja ("GERAL" para a empresa toda).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('company-docs', 'company-docs', false, 26214400, ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic'])
ON CONFLICT (id) DO UPDATE SET file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Company docs files read" ON storage.objects;
CREATE POLICY "Company docs files read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'company-docs' AND public.company_docs_scope());
DROP POLICY IF EXISTS "Company docs files upload" ON storage.objects;
CREATE POLICY "Company docs files upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'company-docs' AND public.company_docs_scope());
DROP POLICY IF EXISTS "Company docs files delete" ON storage.objects;
CREATE POLICY "Company docs files delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'company-docs' AND public.company_docs_scope());
