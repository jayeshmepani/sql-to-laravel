CREATE TABLE public.cat_export AS
SELECT id, email, created_at, updated_at
FROM public.source_users;

CREATE VIEW public.cat_export_view AS
SELECT id, email
FROM public.cat_export;

CREATE TRIGGER cat_export_touch
AFTER INSERT OR UPDATE ON public.cat_export
FOR EACH ROW
EXECUTE FUNCTION public.touch_updated_at();

DROP VIEW public.cat_export_view;
DROP TRIGGER cat_export_touch ON public.cat_export;
