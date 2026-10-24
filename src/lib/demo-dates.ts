// Dates for illustrative (fictitious) demo data, always relative to today in Brasília.
const TIME_ZONE = "America/Sao_Paulo";

function shifted(daysAgo: number, now = new Date()) {
  return new Date(now.getTime() - daysAgo * 86_400_000);
}

/** "dd/mm" for today (0) or N days ago. */
export function demoDay(daysAgo = 0, now?: Date) {
  return shifted(daysAgo, now).toLocaleDateString("pt-BR", {
    timeZone: TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
  });
}

/** "dd/mm/aaaa" for today (0) or N days ago. */
export function demoDate(daysAgo = 0, now?: Date) {
  return shifted(daysAgo, now).toLocaleDateString("pt-BR", { timeZone: TIME_ZONE });
}

/** "Outubro de 2026" for the current month. */
export function demoMonth(now = new Date()) {
  const label = now.toLocaleDateString("pt-BR", {
    timeZone: TIME_ZONE,
    month: "long",
    year: "numeric",
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** "aaaa-mm" for the current month, for <input type="month">. */
export function demoMonthValue(now = new Date()) {
  return now.toLocaleDateString("sv-SE", { timeZone: TIME_ZONE }).slice(0, 7);
}
