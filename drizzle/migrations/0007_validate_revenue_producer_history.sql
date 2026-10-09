CREATE OR REPLACE FUNCTION public.validate_sale() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN
IF TG_OP='INSERT' OR new.unit_code IS DISTINCT FROM old.unit_code OR new.sector_id IS DISTINCT FROM old.sector_id OR new.employee_id IS DISTINCT FROM old.employee_id THEN
IF new.sector_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.sectors WHERE id=new.sector_id AND unit_code=new.unit_code) THEN RAISE EXCEPTION 'Invalid store sector'; END IF;
IF new.employee_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.profiles p JOIN public.user_roles r ON r.user_id=p.id WHERE p.id=new.employee_id AND p.unit_code=new.unit_code AND r.role='producer') THEN RAISE EXCEPTION 'Employee must be assigned as a producer in this store'; END IF;
END IF;
IF TG_OP='INSERT' THEN new.created_by:=auth.uid(); ELSE new.created_by:=old.created_by; new.created_at:=old.created_at; END IF; new.updated_by:=auth.uid(); new.updated_at:=now(); RETURN new; END $$;