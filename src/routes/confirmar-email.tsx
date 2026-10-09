import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { resolveEmailLink } from "@/lib/auth-flow";
import { homeFor, loadAccess } from "@/lib/access";

export const Route = createFileRoute("/confirmar-email")({
  head: () => ({ meta: [
    { title: "Confirmar e-mail — Natal Pneus" },
    { name: "description", content: "Confirmação segura do seu acesso à Natal Pneus." },
    { property: "og:title", content: "Confirmar e-mail — Natal Pneus" },
    { property: "og:description", content: "Confirmação segura do seu acesso à Natal Pneus." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: ConfirmEmail,
});

function ConfirmEmail() {
  const navigate = useNavigate();
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    async function confirm() {
      try {
        await resolveEmailLink(false);
        const access = await loadAccess();
        if (!access) throw new Error("missing_access");
        if (active) await navigate({ to: homeFor(access), replace: true });
      } catch {
        if (active) setError(true);
      }
    }
    void confirm();
    return () => { active = false; };
  }, [navigate]);
  return <main className="grid min-h-screen place-items-center bg-background px-5 text-foreground">
    <div className="w-full max-w-sm">
      <h1 className="text-2xl font-semibold">Confirmar e-mail</h1>
      <p role={error ? "alert" : "status"} className="mt-5 text-muted-foreground">
        {error ? "Este link expirou ou já foi utilizado. Volte para entrar e solicite um novo e-mail de confirmação." : "Confirmando seu acesso…"}
      </p>
      {error && <Button asChild variant="link" className="mt-4 px-0"><Link to="/">Voltar para entrar</Link></Button>}
    </div>
  </main>;
}