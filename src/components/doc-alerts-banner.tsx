import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { TriangleAlert } from "lucide-react";
import { countDocAlerts } from "@/lib/company-docs";

/** Início (ADM only): company documents expiring in 45 days or already expired. Hidden when there are none. */
export function DocAlertsBanner() {
  const { data = 0 } = useQuery({
    queryKey: ["company-docs-alerts"],
    retry: false,
    queryFn: countDocAlerts,
  });
  if (!data) return null;
  return (
    <Link
      to="/documentos-empresa"
      className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-destructive/40 bg-card p-4 text-sm font-semibold text-destructive hover:bg-destructive/5"
    >
      <TriangleAlert size={20} aria-hidden="true" />
      {data} documento(s) da empresa vencendo ou vencidos. Abrir Documentos da empresa →
    </Link>
  );
}
