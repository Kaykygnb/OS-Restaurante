const FUSO = "America/Sao_Paulo";

export function partesLocais(data: Date) {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: FUSO,
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  });
  const partes = fmt.formatToParts(data);
  const hora = Number(partes.find((p) => p.type === "hour")?.value ?? "0");
  const minuto = Number(partes.find((p) => p.type === "minute")?.value ?? "0");
  const semana = partes.find((p) => p.type === "weekday")?.value ?? "Sun";
  const dias: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { minutoDia: hora * 60 + minuto, diaSemana: dias[semana] ?? data.getDay() };
}

/** Janela [inicio, fim). 420–1440 cobre 07:00 até meia-noite. Se fim < inicio, atravessa a madrugada. */
export function dentroDoHorario(minutoDia: number, inicio: number, fim: number) {
  if (inicio === fim) return true;
  if (inicio < fim) return minutoDia >= inicio && minutoDia < fim;
  return minutoDia >= inicio || minutoDia < fim;
}

export function inicioDoDiaLocal(data = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const [ano, mes, dia] = fmt.format(data).split("-").map(Number);
  // Meia-noite em São Paulo como instante UTC aproximado pelo offset atual.
  const probe = new Date(Date.UTC(ano!, (mes ?? 1) - 1, dia ?? 1, 3, 0, 0));
  const partes = new Intl.DateTimeFormat("en-GB", {
    timeZone: FUSO,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(probe);
  const h = Number(partes.find((p) => p.type === "hour")?.value ?? "0");
  const m = Number(partes.find((p) => p.type === "minute")?.value ?? "0");
  return new Date(probe.getTime() - (h * 60 + m) * 60_000);
}
