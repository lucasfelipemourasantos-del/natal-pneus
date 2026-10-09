CREATE POLICY "Signed in read course and badge files" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id IN ('course-files','badges'));
CREATE POLICY "Admins upload course and badge files" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id IN ('course-files','badges') AND public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins update course and badge files" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id IN ('course-files','badges') AND public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins delete course and badge files" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id IN ('course-files','badges') AND public.has_role(auth.uid(),'admin'));