import { useEffect, useRef, useState } from "react";

interface LifetimeProgressProps {
  totalSales: number;
}

// Barra "vitalícia": conta de 5 em 5 vendas pra sempre, sem resetar por mês
// (diferente da barra do ciclo, que reseta todo dia 1). É só um indicador
// visual de progresso na carreira do membro — não gera peça nem comissão.
export function LifetimeProgress({ totalSales }: LifetimeProgressProps) {
  const remainder = totalSales % 5;
  const lapCount = totalSales === 0 ? 0 : remainder === 0 ? 5 : remainder;
  const percent = (lapCount / 5) * 100;
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
      <div className="mm-label">
        {lapCount}/5 vendas
        {completedLaps > 0 ? ` · ${completedLaps} sequência${completedLaps === 1 ? "" : "s"} completa${completedLaps === 1 ? "" : "s"}` : ""}
      </div>

      <div className="mm-progress-track">
        <div className="mm-progress-fill" style={{ width: `${animatedPercent}%` }} />
      </div>
    </section>
  );
}
