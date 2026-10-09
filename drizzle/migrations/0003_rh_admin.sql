CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare is_admin boolean;
begin
  is_admin := lower(new.email) = 'rh@natalpneus.com.br';
  insert into public.profiles (id, email, full_name, phone, status)
  values (
    new.id, new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    nullif(new.raw_user_meta_data->>'phone', ''),
    case when is_admin then 'approved'::public.access_status else 'pending'::public.access_status end
  );
  insert into public.user_roles (user_id, role)
  values (new.id, case when is_admin then 'admin'::public.app_role else 'employee'::public.app_role end);
  return new;
end;
$function$;