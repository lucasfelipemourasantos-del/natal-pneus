import i0 from "@/assets/insignias/insignia-0.png";
import i1 from "@/assets/insignias/insignia-1.png";
import i3 from "@/assets/insignias/insignia-3.png";
import i5 from "@/assets/insignias/insignia-5.png";
import i10 from "@/assets/insignias/insignia-10.png";
import i15 from "@/assets/insignias/insignia-15.png";
import i20 from "@/assets/insignias/insignia-20.png";
import i25 from "@/assets/insignias/insignia-25.png";
import i30 from "@/assets/insignias/insignia-30.png";

export const TENURE_BADGES = [
  { years: 0, name: "Boas-vindas", text: "O início da caminhada: conhecer a empresa, a equipe e o nosso jeito de atender.", img: i0 },
  { years: 1, name: "Compromisso", text: "O primeiro ciclo de contribuição e aprendizado na rotina da empresa.", img: i1 },
  { years: 3, name: "Dedicação", text: "Uma trajetória que ganha consistência no trabalho e na convivência com a equipe.", img: i3 },
  { years: 5, name: "Parceria", text: "Cinco anos somando esforços e participando dos desafios e das conquistas da Natal Pneus.", img: i5 },
  { years: 10, name: "Confiança", text: "Uma década de vínculo, experiência e história compartilhada.", img: i10 },
  { years: 15, name: "Excelência", text: "Uma trajetória duradoura que contribui para fortalecer o cuidado com o serviço e o atendimento.", img: i15 },
  { years: 20, name: "Referência", text: "Experiência que conecta gerações de funcionários e ajuda a preservar o conhecimento da empresa.", img: i20 },
  { years: 25, name: "Legado", text: "Uma contribuição que faz parte da memória e da construção da Natal Pneus.", img: i25 },
  { years: 30, name: "Legado de Honra", text: "Homenagem a três décadas de caminhada e participação na história da empresa.", img: i30 },
];

/** Complete years between admission (YYYY-MM-DD) and today. */
export function completeYears(admission: string, today = new Date()) {
  const [y = 0, m = 1, d = 1] = admission.split("-").map(Number);
  let years = today.getFullYear() - y;
  if (today.getMonth() + 1 < m || (today.getMonth() + 1 === m && today.getDate() < d)) years--;
  return Math.max(0, years);
}

/** Current badge, one star per complete year after it (reset on level change, max 4), and earned history. */
export function tenureStatus(years: number) {
  const earned = TENURE_BADGES.filter((b) => b.years <= years);
  const current = earned[earned.length - 1] ?? TENURE_BADGES[0]!;
  const stars = current.years === 30 ? 0 : Math.min(4, years - current.years);
  const next = TENURE_BADGES.find((b) => b.years > years) ?? null;
  return { current, stars, earned, next };
}
