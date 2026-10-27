-- Tipo do documento do equipamento: orçamento, nota de serviço, nota de compra, garantia ou outro.
ALTER TABLE public.asset_files ADD COLUMN IF NOT EXISTS doc_type text;
ALTER TABLE public.asset_files DROP CONSTRAINT IF EXISTS asset_files_doc_type_check;
ALTER TABLE public.asset_files ADD CONSTRAINT asset_files_doc_type_check
  CHECK (doc_type IS NULL OR doc_type IN ('orcamento', 'nota_servico', 'nota_compra', 'garantia', 'outro'));
