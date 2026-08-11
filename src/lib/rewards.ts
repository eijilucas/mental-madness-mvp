// Cálculo de peças e comissão é feito no banco (schema.sql ->
// calculate_cycle_rewards) e chega pronto na tabela `cycles`. Este arquivo só
// existe para o que é puramente de exibição: progresso percentual até cada
// marco do ciclo (5 / 15 / 30 vendas) usado na barra serrilhada do painel.
//
// Os rótulos de "peças do drop" e "comissão %" são parametrizados a partir
// de app_config (buscado em MemberDashboard) — nunca fixar o valor aqui,
// senão o texto fica desatualizado assim que o admin mudar a configuração.

export const CYCLE_MILESTONES = [5, 10, 15, 30] as const;

export interface MilestoneProgress {
  milestone: number;
  displayNumber: string;
  reached: boolean;
  label: string;
}

// 5 fica só "5" (é um valor exato: a cada 5 vendas fecha uma peça); 15 e 30
// mostram "+" porque o prêmio vale a partir dali pra cima.
const MILESTONE_DISPLAY: Record<number, string> = {
  5: "5",
  10: "10",
  15: "15+",
  30: "30+",
};

// "0.05" -> "5%", "0.035" -> "3.5%"
export function formatCommissionPct(commissionRate: number): string {
  const pct = Math.round(commissionRate * 10000) / 100;
  return `${pct}%`;
}

// A partir de 15 vendas já dá todas as peças do drop atual + comissão — as
// peças não se repetem em 30 (o membro já recebeu todas em 15), então o
// marco de 30 só reforça a comissão continuando.
function milestoneLabels(dropPieceCount: number, commissionRate: number): Record<number, string> {
  const pct = formatCommissionPct(commissionRate);
  return {
    5: "1 peça",
    10: "2 peças",
    15: `${dropPieceCount} peça${dropPieceCount === 1 ? "" : "s"} do drop + ${pct}`,
    30: `${pct} de comissão`,
  };
}

export function milestoneProgress(salesCount: number, dropPieceCount: number, commissionRate: number): MilestoneProgress[] {
  const labels = milestoneLabels(dropPieceCount, commissionRate);
  return CYCLE_MILESTONES.map((milestone) => ({
    milestone,
    displayNumber: MILESTONE_DISPLAY[milestone],
    reached: salesCount >= milestone,
    label: labels[milestone],
  }));
}

// Percentual de preenchimento da barra do ciclo (satura em 100% após o
// último marco, 30 vendas).
export function cycleProgressPercent(salesCount: number): number {
  const cap = CYCLE_MILESTONES[CYCLE_MILESTONES.length - 1];
  return Math.min(100, Math.round((salesCount / cap) * 100));
}
