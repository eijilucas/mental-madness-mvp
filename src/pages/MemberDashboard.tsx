import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";
import { currentCycleMonth } from "../lib/date";
import { Header } from "../components/Header";
import { StatCard } from "../components/StatCard";
import { CycleProgress } from "../components/CycleProgress";
import { LifetimeProgress } from "../components/LifetimeProgress";
import { MonthSelector } from "../components/MonthSelector";
import type { AppConfig, Cycle } from "../types";

const currencyFormatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const DEFAULT_APP_CONFIG: Pick<AppConfig, "drop_piece_count" | "commission_rate"> = {
  drop_piece_count: 0,
  commission_rate: 0,
};

export function MemberDashboard() {
  const { member, signOut } = useAuth();
  const [cycle, setCycle] = useState<Cycle | null>(null);
  const [totalSales, setTotalSales] = useState(0);
  const [availableMonths, setAvailableMonths] = useState<string[]>([currentCycleMonth()]);
  const [selectedMonth, setSelectedMonth] = useState(currentCycleMonth());
  const [appConfig, setAppConfig] = useState(DEFAULT_APP_CONFIG);

  useEffect(() => {
    if (!member) return;

    supabase
      .from("cycles")
      .select("cycle_month")
      .eq("member_id", member.id)
      .order("cycle_month", { ascending: false })
      .then(({ data }) => {
        const months = (data ?? []).map((r) => r.cycle_month as string);
        setAvailableMonths(months.includes(currentCycleMonth()) ? months : [currentCycleMonth(), ...months]);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [member?.id]);

  useEffect(() => {
    function loadConfig() {
      supabase
        .from("app_config")
        .select("drop_piece_count, commission_rate")
        .eq("id", 1)
        .maybeSingle()
        .then(({ data }) => {
          if (data) setAppConfig(data);
        });
    }

    loadConfig();

    const channel = supabase
      .channel("app-config-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "app_config" }, () => loadConfig())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (!member) return;

    async function load() {
      const [{ data: cycleData }, { count: totalCount }] = await Promise.all([
        supabase.from("cycles").select("*").eq("member_id", member!.id).eq("cycle_month", selectedMonth).maybeSingle(),
        supabase.from("sales").select("id", { count: "exact", head: true }).eq("member_id", member!.id),
      ]);
      setCycle(cycleData ?? null);
      setTotalSales(totalCount ?? 0);
    }

    load();

    const channel = supabase
      .channel(`member-${member.id}-realtime`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sales", filter: `member_id=eq.${member.id}` },
        () => load(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "cycles", filter: `member_id=eq.${member.id}` },
        () => load(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [member?.id, selectedMonth]);

  if (!member) return null;

  const salesCount = cycle?.sales_count ?? 0;
  const piecesEarned = cycle?.pieces_earned ?? 0;
  const commission = cycle?.commission_amount ?? 0;
  const isCurrentMonth = selectedMonth === currentCycleMonth();

  return (
    <div className="mm-app-frame">
      <Header
        memberName={member.name}
        couponCode={member.coupon_code}
        onSignOut={signOut}
        rightSlot={
          member.is_admin ? (
            <Link to="/admin" className="mm-link-btn">
              Painel Admin
            </Link>
          ) : undefined
        }
      />

      <div className="mm-section-header">
        <div className="mm-label">{isCurrentMonth ? "Ciclo atual" : "Ciclo encerrado"}</div>
        <MonthSelector months={availableMonths} selected={selectedMonth} onChange={setSelectedMonth} />
      </div>

      <div className="mm-stat-grid">
        <StatCard label="Vendas no Mês" value={String(salesCount)} />
        <StatCard label="Peças Conquistadas" value={String(piecesEarned)} accent />
        <StatCard label="Comissão Acumulada" value={currencyFormatter.format(commission)} accent />
        <StatCard label="Vendas na Carreira" value={String(totalSales)} accent />
      </div>

      {piecesEarned > 0 && (
        <div className={`mm-delivery-status${(cycle?.pieces_delivered_count ?? 0) >= piecesEarned ? " mm-delivery-status-done" : ""}`}>
          {(cycle?.pieces_delivered_count ?? 0) >= piecesEarned
            ? "Todas as peças já foram entregues"
            : `${cycle?.pieces_delivered_count ?? 0} de ${piecesEarned} peças entregues`}
        </div>
      )}

      <CycleProgress
        salesCount={salesCount}
        dropPieceCount={appConfig.drop_piece_count}
        commissionRate={appConfig.commission_rate}
      />

      <LifetimeProgress totalSales={totalSales} />
    </div>
  );
}
