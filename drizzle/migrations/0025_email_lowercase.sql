-- E-mail sempre em minúsculas no perfil (o login já guarda assim; isto garante a regra no banco).
UPDATE public.profiles SET email = lower(trim(email)) WHERE email <> lower(trim(email));
CREATE OR REPLACE FUNCTION public.profiles_lowercase_email() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.email := lower(trim(NEW.email));
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS profiles_lowercase_email_trigger ON public.profiles;
CREATE TRIGGER profiles_lowercase_email_trigger BEFORE INSERT OR UPDATE OF email ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.profiles_lowercase_email();
