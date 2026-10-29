import { Printer } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * "Gerar PDF" (ADM only). The page marks its parts with data-print-block ("grafico" for the charts, "itens" for the
 * sold items list); each option prints one kind of part, so a report never comes out as one crowded sheet:
 *  - Relatório: summary and tables (no charts, no long item lists)
 *  - Gráficos: only the charts
 *  - Itens vendidos: only the item list
 * An option is offered only when the page has that part. With a single option the button prints right away.
 */
const OPTIONS = [
  { key: "relatorio", label: "Relatório (resumo e tabelas)", block: null },
  { key: "graficos", label: "Gráficos", block: "grafico" },
  { key: "itens", label: "Itens vendidos", block: "itens" },
] as const;

export function PrintMenu() {
  const [open, setOpen] = useState(false);
  const [available, setAvailable] = useState<string[]>(["relatorio"]);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  function choices() {
    return OPTIONS.filter(
      (o) => !o.block || document.querySelector(`main [data-print-block="${o.block}"]`),
    ).map((o) => o.key);
  }

  function print(key: string) {
    setOpen(false);
    const root = document.documentElement;
    root.dataset["printMode"] = key;
    window.addEventListener("afterprint", () => delete root.dataset["printMode"], { once: true });
    // let the menu close before the print dialog freezes the page
    setTimeout(() => window.print(), 50);
  }

  function click() {
    const list = choices();
    setAvailable(list);
    if (list.length <= 1) print("relatorio");
    else setOpen((v) => !v);
  }

  return (
    <div ref={box} className="relative">
      <Button type="button" variant="outline" onClick={click} aria-expanded={open}>
        <Printer size={17} aria-hidden="true" className="mr-2" />
        Gerar PDF
      </Button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-2 w-64 rounded-lg border border-border bg-card p-1 shadow-lg"
        >
          {OPTIONS.filter((o) => available.includes(o.key)).map((o) => (
            <button
              key={o.key}
              type="button"
              role="menuitem"
              onClick={() => print(o.key)}
              className="block w-full rounded-md px-3 py-2 text-left text-sm font-medium hover:bg-accent"
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
