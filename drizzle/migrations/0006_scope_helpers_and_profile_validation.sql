CREATE OR REPLACE FUNCTION public.current_unit() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT unit_code FROM public.profiles WHERE id=auth.uid() $$;
REVOKE ALL ON FUNCTION public.current_unit() FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.current_unit() TO authenticated;
DROP POLICY "Supervisor reads approved unit" ON public.profiles;
CREATE POLICY "Supervisor reads approved unit" ON public.profiles FOR SELECT TO authenticated USING(public.has_role(auth.uid(),'supervisor') AND unit_code=public.current_unit());
CREATE POLICY "Leadership reads access roles" ON public.user_roles FOR SELECT TO authenticated USING(public.can_read_all());
CREATE OR REPLACE FUNCTION public.validate_profile_access() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN IF new.sector_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.sectors WHERE id=new.sector_id AND unit_code=new.unit_code) THEN RAISE EXCEPTION 'Sector does not belong to unit'; END IF; RETURN new; END $$;
CREATE TRIGGER profile_unit_sector BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.validate_profile_access();