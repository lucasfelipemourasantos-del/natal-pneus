ALTER TABLE public.job_functions ADD COLUMN IF NOT EXISTS all_stores boolean NOT NULL DEFAULT false;
ALTER TABLE public.job_functions ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 100;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS requested_all_stores boolean NOT NULL DEFAULT false;
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$ DECLARE jf public.job_functions; BEGIN
SELECT * INTO jf FROM public.job_functions WHERE name=new.raw_user_meta_data->>'job_role';
INSERT INTO public.profiles(id,email,full_name,phone,requested_job_role,requested_unit_code,requested_all_stores,status) VALUES(new.id,new.email,left(coalesce(new.raw_user_meta_data->>'full_name',''),200),nullif(new.raw_user_meta_data->>'phone',''),jf.name,
CASE WHEN jf.id IS NOT NULL AND NOT jf.all_stores AND EXISTS(SELECT 1 FROM public.units WHERE code=new.raw_user_meta_data->>'unit_code') THEN new.raw_user_meta_data->>'unit_code' END,
coalesce(jf.all_stores,false),'pending');
INSERT INTO public.user_roles(user_id,role) VALUES(new.id,'employee');
IF new.email_confirmed_at IS NOT NULL AND lower(new.email) IN ('rh@natalpneus.com.br','lucas.felipemoura.santos@gmail.com') THEN INSERT INTO public.user_roles(user_id,role) VALUES(new.id,'admin') ON CONFLICT DO NOTHING; UPDATE public.profiles SET status='approved' WHERE id=new.id; END IF; RETURN new; END $function$;