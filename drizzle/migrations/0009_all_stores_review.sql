CREATE OR REPLACE FUNCTION public.review_employee(_id uuid,_status public.access_status,_unit text,_job text,_sector uuid,_role public.app_role,_producer boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
IF EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_id AND role='admin') THEN RAISE EXCEPTION 'Admin account cannot be reviewed'; END IF;
IF _role NOT IN ('employee','director','general_manager','supervisor') THEN RAISE EXCEPTION 'Invalid access profile'; END IF;
IF _unit IS NULL AND _role NOT IN ('director','general_manager') THEN RAISE EXCEPTION 'All stores requires leadership profile'; END IF;
IF _unit IS NULL AND _sector IS NOT NULL THEN RAISE EXCEPTION 'All stores cannot have a sector'; END IF;
IF _status='approved' AND ((_unit IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.units WHERE code=_unit)) OR NOT EXISTS(SELECT 1 FROM public.job_functions WHERE name=_job) OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=_id AND email_confirmed_at IS NOT NULL)) THEN RAISE EXCEPTION 'Confirm email, unit and function before approval'; END IF;
IF _sector IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.sectors WHERE id=_sector AND unit_code=_unit) THEN RAISE EXCEPTION 'Sector does not belong to store'; END IF;
UPDATE public.profiles SET status=_status,unit_code=_unit,unit=_unit,job_role=_job,sector_id=_sector WHERE id=_id;
DELETE FROM public.user_roles WHERE user_id=_id AND role<>'admin'; INSERT INTO public.user_roles(user_id,role) VALUES(_id,_role); IF _producer THEN INSERT INTO public.user_roles(user_id,role) VALUES(_id,'producer') ON CONFLICT DO NOTHING; END IF; END $$;
REVOKE ALL ON FUNCTION public.review_employee(uuid,public.access_status,text,text,uuid,public.app_role,boolean) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.review_employee(uuid,public.access_status,text,text,uuid,public.app_role,boolean) TO authenticated;