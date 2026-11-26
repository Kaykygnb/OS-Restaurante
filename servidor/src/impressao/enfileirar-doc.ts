import {
  configDocumento,
  deveImprimirAgora,
  resolverDestinoCaixa,
  resolverDestinoPreconta,
  type TipoDocNegocio,
} from "./destino.js";
import { documentoGaveta } from "./documentos.js";
import { enfileirarTrabalho, imprimirAgora } from "./fila.js";

export async function enfileirarDocumentoNegocio(opts: {
  tipo: TipoDocNegocio;
  disparo: "automatico" | "manual";
  payload: Buffer;
  atendimento_id?: number | null;
  pedido_id?: number | null;
  /** Abrir gaveta na 1ª via se config + impressora permitem e pedido explícito */
  abrir_gaveta?: boolean;
  /** Tentar impressão imediata na 1ª via (pré-conta / comprovante) */
  agora?: boolean;
}) {
  const cfg = await configDocumento(opts.tipo);
  if (!deveImprimirAgora(cfg?.modo, opts.disparo)) {
    return {
      status: "NUNCA" as const,
      trabalhos: [] as number[],
      avisos: [`Documento ${opts.tipo} em modo ${cfg?.modo ?? "NUNCA"}`],
    };
  }

  const impressora =
    opts.tipo === "CONTA" ? await resolverDestinoPreconta() : await resolverDestinoCaixa();
  if (!impressora) {
    return {
      status: "SEM_DESTINO" as const,
      trabalhos: [] as number[],
      avisos: ["Nenhuma impressora de destino configurada"],
    };
  }

  const vias = Math.min(3, Math.max(1, cfg?.vias ?? 1));
  const trabalhos: number[] = [];
  const avisos: string[] = [];

  for (let via = 1; via <= vias; via++) {
    if (opts.agora && via === 1) {
      try {
        const tipoAgora =
          opts.tipo === "CONTA"
            ? "CONTA"
            : opts.tipo === "RELATORIO_CAIXA"
              ? "RELATORIO_CAIXA"
              : "COMPROVANTE";
        const r = await imprimirAgora(impressora, tipoAgora, opts.payload);
        // imprimirAgora cria 1 trabalho; atualizar via_numero
        await (await import("../db.js")).prisma.trabalho_impressao.update({
          where: { id: r.trabalho_id },
          data: { via_numero: 1, tipo_documento: opts.tipo as any },
        });
        trabalhos.push(r.trabalho_id);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Falha na impressão imediata — na fila";
        if (msg === "Impressora inativa") {
          const t = await enfileirarTrabalho({
            impressora_id: impressora.id,
            tipo_documento: opts.tipo,
            conteudo: opts.payload,
            atendimento_id: opts.atendimento_id ?? null,
            pedido_id: opts.pedido_id ?? null,
            via_numero: via,
          });
          trabalhos.push(t.id);
        }
        avisos.push(msg);
      }
    } else {
      const t = await enfileirarTrabalho({
        impressora_id: impressora.id,
        tipo_documento: opts.tipo,
        conteudo: opts.payload,
        atendimento_id: opts.atendimento_id ?? null,
        pedido_id: opts.pedido_id ?? null,
        via_numero: via,
      });
      trabalhos.push(t.id);
    }
  }

  if (opts.abrir_gaveta && cfg?.abre_gaveta && impressora.tem_gaveta) {
    try {
      await imprimirAgora(impressora, "COMPROVANTE", documentoGaveta());
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg === "Impressora inativa") {
        await enfileirarTrabalho({
          impressora_id: impressora.id,
          tipo_documento: "COMPROVANTE",
          conteudo: documentoGaveta(),
          atendimento_id: opts.atendimento_id ?? null,
          via_numero: 1,
        });
      }
      avisos.push("Gaveta enfileirada (falha imediata)");
    }
  }

  return {
    status: (avisos.length && !trabalhos.length ? "ERRO" : "OK") as "OK" | "ERRO",
    trabalhos,
    avisos,
    impressora_id: impressora.id,
  };
}
