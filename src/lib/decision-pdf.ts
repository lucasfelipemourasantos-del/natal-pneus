import { parseDecisionReport, type PdfText, type ParsedReport } from "@/lib/decision-report";

/** Extracts positioned text from a Decision PDF in the browser and parses it. */
export async function readDecisionPdf(file: File): Promise<ParsedReport> {
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  try {
    const pages: PdfText[][] = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const content = await (await doc.getPage(p)).getTextContent();
      pages.push(
        content.items.flatMap((i) =>
          "str" in i
            ? [{ str: i.str, x: i.transform[4] as number, y: i.transform[5] as number, w: i.width }]
            : [],
        ),
      );
    }
    return parseDecisionReport(pages);
  } finally {
    await doc.destroy();
  }
}
