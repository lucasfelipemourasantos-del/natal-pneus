/** Frases da semana do Início: 52 frases aprovadas pelo RH, uma por semana do ano (semana ISO), iguais para todos. */
export const WEEKLY_PHRASES = [
  "Um bom atendimento começa por ouvir com atenção.",
  "Cada carro que sai daqui leva a confiança de uma família.",
  "Fazer certo da primeira vez economiza o tempo de todos.",
  "Segurança não é uma etapa do serviço. É o jeito de trabalhar.",
  "Quem aprende algo novo hoje atende melhor amanhã.",
  "Um cliente bem orientado volta e indica.",
  "Trabalhar em equipe é ajudar sem precisar que alguém peça.",
  "Box organizado é respeito com quem vem depois.",
  "Pequenos cuidados evitam grandes retrabalhos.",
  "Explicar com clareza também faz parte do serviço.",
  "Constância vale mais do que um dia excepcional.",
  "Na dúvida, pergunte. Errar por pressa custa mais caro.",
  "A meta do mês se constrói em cada atendimento do dia.",
  "Pontualidade é cuidado com o cliente e com a equipe.",
  "Ferramenta limpa e no lugar deixa o trabalho mais rápido e seguro.",
  "Diagnóstico honesto é o que sustenta a nossa reputação.",
  "Uma recepção cordial muda o tom de todo o atendimento.",
  "Conferir antes de entregar é o último passo de um bom serviço.",
  "Cada setor depende do outro para o cliente sair satisfeito.",
  "Melhorar um pouco a cada semana já é crescer.",
  "Equipamento de proteção é para ser usado, não guardado.",
  "Ouvir quem tem mais experiência encurta o caminho.",
  "O cliente percebe quando o serviço é feito com atenção.",
  "Começar o dia organizado deixa o dia mais leve.",
  "Resolver o problema do cliente é o nosso principal produto.",
  "Respeito no trato vale para clientes e para colegas.",
  "Um registro bem feito evita mal-entendidos depois.",
  "O cuidado com os detalhes diferencia um bom serviço.",
  "Compartilhar o que você sabe fortalece toda a equipe.",
  "Torque, calibragem e aperto corretos: segurança na estrada.",
  "Prometa o prazo que pode cumprir e cumpra o que prometeu.",
  "Um retorno sobre o seu trabalho é chance de ajuste, não motivo de desânimo.",
  "Cada pneu montado com cuidado é um cliente mais seguro.",
  "Quem cuida do ambiente de trabalho cuida de si e dos outros.",
  "Bons resultados vêm de bons hábitos repetidos.",
  "Transparência no orçamento gera confiança na venda.",
  "Um obrigado sincero fecha bem qualquer atendimento.",
  "Com a loja cheia, calma e método fazem a fila andar.",
  "Conhecer bem o produto é a melhor forma de vender.",
  "Ninguém atinge uma meta sozinho.",
  "Revisar o próprio trabalho é sinal de profissionalismo.",
  "Prestar atenção ao que o cliente não disse também ajuda a atender melhor.",
  "A qualidade do serviço é o melhor cartão de visita da Natal Pneus.",
  "Aprender com o erro é tão importante quanto evitá-lo.",
  "Cuidar da saúde é cuidar de quem conta com você.",
  "Um ambiente de respeito faz todos trabalharem melhor.",
  "Persistir nos dias difíceis faz diferença no fim do mês.",
  "Quem faz com capricho não precisa refazer.",
  "Cada atendimento é uma nova chance de fazer bem feito.",
  "Comunicação clara entre balcão e oficina evita atrasos.",
  "Reconhecer o esforço do colega fortalece o time.",
  "Fechar o ano com o dever cumprido começa em cada semana.",
] as const;

/** ISO week number (1–53) of a date, in the local calendar. */
export function isoWeek(date: Date): number {
  const t = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/** The phrase of the week: changes every Monday; week 53 wraps to the first phrase. */
export function phraseOfWeek(date = new Date()): string {
  return WEEKLY_PHRASES[(isoWeek(date) - 1) % WEEKLY_PHRASES.length]!;
}
