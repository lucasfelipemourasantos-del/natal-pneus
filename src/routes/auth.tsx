import { createFileRoute } from "@tanstack/react-router";
import { LoginScreen } from "@/components/access/login-screen";
export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>): { perfil: "admin" | "funcionario" } => ({
    perfil: s["perfil"] === "admin" ? "admin" : "funcionario",
  }),
  head: () => ({
    meta: [
      { title: "Acesso à plataforma — Natal Pneus" },
      { name: "description", content: "Entre com sua conta Natal Pneus." },
      { property: "og:title", content: "Acesso à plataforma — Natal Pneus" },
      { property: "og:description", content: "Entre com sua conta Natal Pneus." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LoginScreen,
});
