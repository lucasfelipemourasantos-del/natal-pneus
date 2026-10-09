import { createFileRoute } from "@tanstack/react-router";
import { LoginScreen } from "@/components/access/login-screen";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Entrar no portal — Natal Pneus" },
      {
        name: "description",
        content: "Acesso ao portal do colaborador e à área administrativa da Natal Pneus.",
      },
      { property: "og:title", content: "Entrar no portal — Natal Pneus" },
      {
        property: "og:description",
        content: "Acesso ao portal do colaborador e à área administrativa da Natal Pneus.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LoginScreen,
});
