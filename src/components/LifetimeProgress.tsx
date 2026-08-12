import { useEffect, useRef, useState } from "react";

interface LifetimeProgressProps {
  totalSales: number;
  dropCompleted: boolean;
}

// Barra "vitalícia": conta de 5 em 5 vendas pra sempre, sem resetar por mês
// (diferente da barra do ciclo, que reseta todo dia 1). É só um indicador
// visual de progresso na carreira do membro — não gera peça nem comissão.
//
// Exceção: quando o membro já garantiu todas as peças do drop atual nesse
// ciclo (dropCompleted), não faz sentido continuar contando de 5 em 5 — não
// tem mais peça pra "buscar" até o próximo mês, então a barra trava cheia
// mostrando esse estado em vez do contador normal.
export function LifetimeProgress({ totalSales, dropCompleted }: LifetimeProgressProps) {
  const remainder = totalSales % 5;
  const lapCount = totalSales === 0 ? 0 : remainder === 0 ? 5 : remainder;
  const percent = dropCompleted ? 100 : (lapCount / 5) * 100;
  const completedLaps = Math.floor(totalSales / 5);

  const [animatedPercent, setAnimatedPercent] = useState(0);
  const frame = useRef<number | undefined>(undefined);

  useEffect(() => {
    setAnimatedPercent(0);
    frame.current = requestAnimationFrame(() => {
      frame.current = requestAnimationFrame(() => setAnimatedPercent(percent));
    });
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, [percent]);

  return (
    <section className="mm-progress-section">
      <h2 className="mm-section-title">Meta até a Próxima Peça</h2>

      {dropCompleted && (
        <div className="mm-congrats-banner">Parabéns! Você já garantiu todas as peças do drop deste mês.</div>
      )}

      <div className="mm-label">
        {dropCompleted
          ? "Peças do drop garantidas neste mês"
          : `${lapCount}/5 vendas${completedLaps > 0 ? ` · ${completedLaps} sequência${completedLaps === 1 ? "" : "s"} completa${completedLaps === 1 ? "" : "s"}` : ""}`}
      </div>

      <div className="mm-progress-track">
        <div className="mm-progress-fill" style={{ width: `${animatedPercent}%` }} />
      </div>
    </section>
  );
}
