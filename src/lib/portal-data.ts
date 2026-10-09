import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
export const catalogOptions = queryOptions({
  queryKey: ["portal-catalog"],
  queryFn: async () => {
    const [u, j] = await Promise.all([
      supabase.from("units").select("*").order("code"),
      supabase.from("job_functions").select("*").order("sort_order").order("name"),
    ]);
    if (u.error) throw u.error;
    if (j.error) throw j.error;
    return { units: u.data, jobs: j.data };
  },
});
export const fieldClass =
  "mt-1 block min-h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none focus:border-primary";
