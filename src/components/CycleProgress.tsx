import { useEffect, useRef, useState } from "react";
import { cycleProgressPercent, formatCommissionPct, milestoneProgress } from "../lib/rewards";

interface CycleProgressProps {
  salesCount: number;
  dropPieceCount: number;
  commissionRate: number;
}

export function CycleProgress({ salesCount, dropPieceCount, commissionRate }: CycleProgressProps) {
  const percent = cycleProgressPercent(salesCount);
  const milestones = milestoneProgress(salesCount, dropPieceCount, commissionRate);
  const pct = formatCommissionPct(commissionRate);

  // Começa em 0 e anima até o valor real a cada mudança — tanto no primeiro
  // load quanto quando uma venda nova chega via realtime.
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
      <h2 className="mm-section-title">Progresso do Ciclo</h2>
      <div className="mm-label">{salesCount} vendas neste mês</div>

      <div className="mm-progress-track">
        <div className="mm-progress-fill" style={{ width: `${animatedPercent}%` }} />
      </div>

      <div className="mm-progress-milestones" style={{ gridTemplateColumns: `repeat(${milestones.length}, 1fr)` }}>
        {milestones.map((m) => (
          <div className="mm-milestone" key={m.milestone}>
            <div className={`mm-milestone-number${m.reached ? "" : " mm-milestone-dim"}`}>{m.displayNumber}</div>
            <div className="mm-milestone-label">{m.label}</div>
          </div>
        ))}
      </div>

      <div className="mm-rewards-explainer">
        <div className="mm-label">Condições para receber as peças e comissões</div>
        <ul className="mm-rewards-list">
          <li>
            <strong>5 vendas</strong> = 1 peça.
          </li>
          <li>
            <strong>10 vendas</strong> = 2 peças.
          </li>
          <li>
            <strong>15+ vendas</strong> = todas as peças do drop ({dropPieceCount}) + {pct} de comissão.
          </li>
          <li>
            <strong>30+ vendas</strong> = {pct} de comissão.
          </li>
        </ul>
      </div>
    </section>
  );
}
