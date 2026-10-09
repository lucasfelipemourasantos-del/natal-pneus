CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$ DECLARE jf public.job_functions; BEGIN
SELECT * INTO jf FROM public.job_functions WHERE name=new.raw_user_meta_data->>'job_role';
INSERT INTO public.profiles(id,email,full_name,phone,requested_job_role,requested_unit_code,requested_all_stores,status) VALUES(new.id,new.email,left(coalesce(new.raw_user_meta_data->>'full_name',''),200),nullif(new.raw_user_meta_data->>'phone',''),jf.name,
CASE WHEN jf.id IS NOT NULL AND NOT jf.all_stores AND EXISTS(SELECT 1 FROM public.units WHERE code=new.raw_user_meta_data->>'unit_code') THEN new.raw_user_meta_data->>'unit_code' END,
coalesce(jf.all_stores,false),'pending');
INSERT INTO public.user_roles(user_id,role) VALUES(new.id,'employee');
RETURN new; END $function$;

CREATE OR REPLACE FUNCTION public.sync_verified_admin()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$ BEGIN
IF new.email IS DISTINCT FROM old.email THEN DELETE FROM public.user_roles WHERE user_id=new.id AND role='admin'; END IF;
RETURN new; END $function$;

CREATE OR REPLACE FUNCTION public.review_employee(_id uuid, _status access_status, _unit text, _job text, _sector uuid, _role app_role, _producer boolean)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$ BEGIN
IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
IF EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_id AND role='admin') THEN RAISE EXCEPTION 'Admin account cannot be reviewed'; END IF;
IF _role NOT IN ('employee','director','general_manager','supervisor') THEN RAISE EXCEPTION 'Invalid access profile'; END IF;
IF _unit IS NULL AND _role NOT IN ('director','general_manager') AND NOT (_status='approved' AND EXISTS(SELECT 1 FROM auth.users WHERE id=_id AND lower(email) IN ('rh@natalpneus.com.br','lucas.felipemoura.santos@gmail.com'))) THEN RAISE EXCEPTION 'All stores requires leadership profile'; END IF;
IF _unit IS NULL AND _sector IS NOT NULL THEN RAISE EXCEPTION 'All stores cannot have a sector'; END IF;
IF _status='approved' AND ((_unit IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.units WHERE code=_unit)) OR NOT EXISTS(SELECT 1 FROM public.job_functions WHERE name=_job) OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=_id AND email_confirmed_at IS NOT NULL)) THEN RAISE EXCEPTION 'Confirm email, unit and function before approval'; END IF;
IF _sector IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.sectors WHERE id=_sector AND unit_code=_unit) THEN RAISE EXCEPTION 'Sector does not belong to store'; END IF;
UPDATE public.profiles SET status=_status,unit_code=_unit,unit=_unit,job_role=_job,sector_id=_sector WHERE id=_id;
DELETE FROM public.user_roles WHERE user_id=_id AND role<>'admin'; INSERT INTO public.user_roles(user_id,role) VALUES(_id,_role); IF _producer THEN INSERT INTO public.user_roles(user_id,role) VALUES(_id,'producer') ON CONFLICT DO NOTHING; END IF;
IF _status='approved' AND EXISTS(SELECT 1 FROM auth.users WHERE id=_id AND lower(email) IN ('rh@natalpneus.com.br','lucas.felipemoura.santos@gmail.com')) THEN
  INSERT INTO public.user_roles(user_id,role) VALUES(_id,'admin') ON CONFLICT DO NOTHING;
  UPDATE public.profiles SET unit_code=NULL, unit=NULL, sector_id=NULL WHERE id=_id;
END IF;
END $function$;

-- Conta existente do responsável (Lucas): confirmar e tornar ADM RH
UPDATE auth.users SET email_confirmed_at=coalesce(email_confirmed_at, now()) WHERE id='64509dd8-8027-4d11-8c62-02f4cfccdd15';
INSERT INTO public.user_roles(user_id,role) VALUES('64509dd8-8027-4d11-8c62-02f4cfccdd15','admin') ON CONFLICT DO NOTHING;
UPDATE public.profiles SET status='approved', unit_code=NULL, unit=NULL, sector_id=NULL WHERE id='64509dd8-8027-4d11-8c62-02f4cfccdd15';