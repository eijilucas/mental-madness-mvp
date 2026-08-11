import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";
import { currentCycleMonth, nextCycleMonth } from "../lib/date";
import { SYNTHETIC_LOGIN_DOMAIN } from "../lib/auth";
import { extractFunctionErrorMessage } from "../lib/functions";
import { Header } from "../components/Header";
import { StatCard } from "../components/StatCard";
import { MonthSelector } from "../components/MonthSelector";
import { PencilIcon } from "../components/PencilIcon";
import type { AppConfig, Cycle, Member, MemberWithCycle, Sale } from "../types";

const currencyFormatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dateFormatter = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

function tierLabel(salesCount: number): string {
  if (salesCount >= 30) return "30+ · 5% comissão";
  if (salesCount >= 15) return "15+ · peças do drop + 5%";
  if (salesCount >= 5) return "5+ · peças";
  return "sem marco";
}

interface ProductTotal {
  productName: string;
  quantity: number;
}

interface SaleWithMember extends Sale {
  members: { name: string; coupon_code: string } | null;
}

type SortKey = "name" | "coupon" | "sales" | "gross" | "pieces" | "commission";
type SortDir = "asc" | "desc";

const SORT_LABEL: Record<SortKey, string> = {
  name: "Membro",
  coupon: "Cupom",
  sales: "Vendas",
  gross: "Bruto Vendido",
  pieces: "Peças",
  commission: "Comissão",
};

function sortValue(row: MemberWithCycle, key: SortKey): string | number {
  switch (key) {
    case "name":
      return row.name.toLowerCase();
    case "coupon":
      return row.coupon_code.toLowerCase();
    case "sales":
      return row.cycle?.sales_count ?? 0;
    case "gross":
      return row.cycle?.gross_total ?? 0;
    case "pieces":
      return row.cycle?.pieces_earned ?? 0;
    case "commission":
      return row.cycle?.commission_amount ?? 0;
  }
}

function productsLabel(sale: Sale): string {
  const items = sale.sale_items ?? [];
  if (items.length === 0) return "—";
  return items.map((item) => (item.quantity > 1 ? `${item.product_name} (x${item.quantity})` : item.product_name)).join(", ");
}

export function AdminDashboard() {
  const { member, signOut } = useAuth();
  const [rows, setRows] = useState<MemberWithCycle[]>([]);
  const [inactiveRows, setInactiveRows] = useState<Member[]>([]);
  const [productTotals, setProductTotals] = useState<ProductTotal[]>([]);
  const [recentSales, setRecentSales] = useState<SaleWithMember[]>([]);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [resetResult, setResetResult] = useState<{ coupon: string; password: string } | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);
  const [togglingCycleId, setTogglingCycleId] = useState<string | null>(null);
  const [availableMonths, setAvailableMonths] = useState<string[]>([currentCycleMonth()]);
  const [selectedMonth, setSelectedMonth] = useState(currentCycleMonth());
  const nextMonth = nextCycleMonth(selectedMonth);

  const [reloadTick, setReloadTick] = useState(0);
  const [newMemberName, setNewMemberName] = useState("");
  const [newMemberCoupon, setNewMemberCoupon] = useState("");
  const [addingMember, setAddingMember] = useState(false);
  const [addMemberError, setAddMemberError] = useState<string | null>(null);

  const [addMemberResult, setAddMemberResult] = useState<{ coupon: string; password: string } | null>(null);

  async function handleAddMember() {
    setAddMemberError(null);
    setAddMemberResult(null);

    const name = newMemberName.trim();
    const coupon = newMemberCoupon.trim().toUpperCase();

    if (!name || !coupon) {
      setAddMemberError("Preenche nome e cupom.");
      return;
    }

    setAddingMember(true);
    const { data: created, error } = await supabase
      .from("members")
      .insert({ name, coupon_code: coupon, email: `${coupon.toLowerCase()}@${SYNTHETIC_LOGIN_DOMAIN}` })
      .select("id")
      .single();

    if (error) {
      setAddingMember(false);
      setAddMemberError(error.code === "23505" ? `Já existe um membro com o cupom "${coupon}".` : "Não deu pra cadastrar. Tenta de novo.");
      return;
    }

    // Já cria o login na hora, sem precisar rodar script pelo terminal.
    const { data: loginData, error: loginError } = await supabase.functions.invoke("create-member-login", {
      body: { member_id: created.id },
    });
    setAddingMember(false);

    setNewMemberName("");
    setNewMemberCoupon("");
    setReloadTick((t) => t + 1);

    if (loginError || loginData?.error) {
      const reason = await extractFunctionErrorMessage(loginError, loginData);
      setAddMemberError(`Membro cadastrado, mas não deu pra criar o login automaticamente${reason ? `: ${reason}` : ""}. Tenta "Criar login" na tabela.`);
      return;
    }

    setAddMemberResult({ coupon: loginData.coupon_code, password: loginData.temp_password });
  }

  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editCoupon, setEditCoupon] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  function handleStartEdit(row: Member) {
    setEditingMemberId(row.id);
    setEditName(row.name);
    setEditCoupon(row.coupon_code);
    setEditError(null);
  }

  function handleCancelEdit() {
    setEditingMemberId(null);
    setEditError(null);
  }

  async function handleSaveEdit(id: string) {
    const name = editName.trim();
    const coupon = editCoupon.trim().toUpperCase();

    if (!name || !coupon) {
      setEditError("Preenche nome e cupom.");
      return;
    }

    setSavingEdit(true);
    const { error } = await supabase.from("members").update({ name, coupon_code: coupon }).eq("id", id);
    setSavingEdit(false);

    if (error) {
      setEditError(error.code === "23505" ? `Já existe um membro com o cupom "${coupon}".` : "Não deu pra salvar. Tenta de novo.");
      return;
    }

    setEditingMemberId(null);
    setReloadTick((t) => t + 1);
  }

  const [appConfig, setAppConfig] = useState<AppConfig | null>(null);
  const [dropPiecesDraft, setDropPiecesDraft] = useState("");
  const [commissionPctDraft, setCommissionPctDraft] = useState("");
  const [savingConfig, setSavingConfig] = useState(false);
  const [configMessage, setConfigMessage] = useState<string | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);

  function loadAppConfig() {
    supabase
      .from("app_config")
      .select("*")
      .eq("id", 1)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        setAppConfig(data);
        setDropPiecesDraft(String(data.drop_piece_count));
        setCommissionPctDraft(String(Math.round(data.commission_rate * 10000) / 100));
      });
  }

  async function handleSaveConfig() {
    setConfigError(null);
    setConfigMessage(null);

    const dropPieces = Number(dropPiecesDraft);
    const commissionPct = Number(commissionPctDraft);

    if (!Number.isInteger(dropPieces) || dropPieces < 0) {
      setConfigError("Peças do drop precisa ser um número inteiro, 0 ou mais.");
      return;
    }
    if (!Number.isFinite(commissionPct) || commissionPct < 0 || commissionPct > 100) {
      setConfigError("Comissão precisa ser um número entre 0 e 100.");
      return;
    }

    setSavingConfig(true);

    const { error: updateError } = await supabase
      .from("app_config")
      .update({ drop_piece_count: dropPieces, commission_rate: commissionPct / 100, updated_at: new Date().toISOString() })
      .eq("id", 1);

    if (updateError) {
      setSavingConfig(false);
      setConfigError("Não deu pra salvar. Tenta de novo.");
      return;
    }

    // Recalcula os ciclos do mês selecionado com a regra nova, senão só
    // valeria a partir da próxima venda de cada membro.
    await supabase.rpc("recalc_all_cycles_for_month", { p_cycle_month: selectedMonth });

    setSavingConfig(false);
    setConfigMessage("Configuração salva e ciclos recalculados.");
    loadAppConfig();
  }

  async function handleResetPassword(memberId: string) {
    setResetError(null);
    setResetResult(null);
    setResettingId(memberId);

    const { data, error } = await supabase.functions.invoke("reset-member-password", {
      body: { member_id: memberId },
    });

    setResettingId(null);

    if (error || data?.error) {
      setResetError((await extractFunctionErrorMessage(error, data)) ?? "Não deu pra resetar a senha. Tenta de novo.");
      return;
    }

    setResetResult({ coupon: data.coupon_code, password: data.temp_password });
  }

  const [creatingLoginId, setCreatingLoginId] = useState<string | null>(null);

  async function handleCreateLogin(memberId: string) {
    setResetError(null);
    setResetResult(null);
    setCreatingLoginId(memberId);

    const { data, error } = await supabase.functions.invoke("create-member-login", {
      body: { member_id: memberId },
    });

    setCreatingLoginId(null);

    if (error || data?.error) {
      setResetError((await extractFunctionErrorMessage(error, data)) ?? "Não deu pra criar o login. Tenta de novo.");
      return;
    }

    setResetResult({ coupon: data.coupon_code, password: data.temp_password });
    setReloadTick((t) => t + 1);
  }

  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleDeleteMember(row: Member) {
    const typed = window.prompt(
      `Isso apaga "${row.name}" (${row.coupon_code}) DE VEZ, junto com todo o histórico de vendas/comissão dele. Não tem como desfazer.\n\nPra confirmar, digite o cupom exatamente: ${row.coupon_code}`,
    );
    if (typed !== row.coupon_code) {
      if (typed !== null) window.alert("Cupom não bateu — nada foi apagado.");
      return;
    }

    setDeletingId(row.id);
    const { data, error } = await supabase.functions.invoke("delete-member", {
      body: { member_id: row.id },
    });
    setDeletingId(null);

    if (error || data?.error) {
      const reason = await extractFunctionErrorMessage(error, data);
      window.alert(`Não deu pra apagar${reason ? `: ${reason}` : ". Tenta de novo."}`);
      return;
    }

    setReloadTick((t) => t + 1);
  }

  const [reactivatingId, setReactivatingId] = useState<string | null>(null);

  async function handleReactivateMember(id: string) {
    setReactivatingId(id);
    await supabase.from("members").update({ active: true }).eq("id", id);
    setReactivatingId(null);
    setReloadTick((t) => t + 1);
  }

  async function handleDeliveryChange(cycle: Cycle, delta: 1 | -1) {
    const nextCount = Math.min(cycle.pieces_earned, Math.max(0, cycle.pieces_delivered_count + delta));
    if (nextCount === cycle.pieces_delivered_count) return;

    setTogglingCycleId(cycle.id);

    await supabase
      .from("cycles")
      .update({ pieces_delivered_count: nextCount, pieces_delivered_at: new Date().toISOString() })
      .eq("id", cycle.id);

    setTogglingCycleId(null);
  }

  useEffect(() => {
    loadAppConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    supabase
      .from("cycles")
      .select("cycle_month")
      .order("cycle_month", { ascending: false })
      .then(({ data }) => {
        const months = Array.from(new Set((data ?? []).map((r) => r.cycle_month as string)));
        setAvailableMonths(months.includes(currentCycleMonth()) ? months : [currentCycleMonth(), ...months]);
      });
  }, []);

  useEffect(() => {
    async function load() {
      const [{ data: members }, { data: inactiveMembers }, { data: cycles }, { data: items }, { data: sales }] = await Promise.all([
        supabase.from("members").select("*").eq("active", true).order("name"),
        supabase.from("members").select("*").eq("active", false).eq("is_admin", false).order("name"),
        supabase.from("cycles").select("*").eq("cycle_month", selectedMonth),
        supabase
          .from("sale_items")
          .select("product_name, quantity, sales!inner(sale_date)")
          .gte("sales.sale_date", selectedMonth)
          .lt("sales.sale_date", nextMonth),
        supabase
          .from("sales")
          .select("*, sale_items(id, product_name, quantity), members(name, coupon_code)")
          .gte("sale_date", selectedMonth)
          .lt("sale_date", nextMonth)
          .order("sale_date", { ascending: false }),
      ]);

      const cyclesByMember = new Map<string, Cycle>((cycles ?? []).map((c) => [c.member_id, c]));
      const merged: MemberWithCycle[] = (members ?? [])
        .filter((m: Member) => !m.is_admin)
        .map((m: Member) => ({ ...m, cycle: cyclesByMember.get(m.id) ?? null }));
      setRows(merged);
      setInactiveRows(inactiveMembers ?? []);

      const totalsByProduct = new Map<string, number>();
      for (const item of items ?? []) {
        totalsByProduct.set(item.product_name, (totalsByProduct.get(item.product_name) ?? 0) + item.quantity);
      }
      const totals = Array.from(totalsByProduct.entries())
        .map(([productName, quantity]) => ({ productName, quantity }))
        .sort((a, b) => b.quantity - a.quantity);
      setProductTotals(totals);

      setRecentSales((sales as unknown as SaleWithMember[]) ?? []);
    }

    load();

    const channel = supabase
      .channel("admin-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "cycles" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "sales" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "sale_items" }, () => load())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMonth, reloadTick]);

  const [sortKey, setSortKey] = useState<SortKey>("sales");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir(key === "name" || key === "coupon" ? "asc" : "desc");
  }

  const [memberSearch, setMemberSearch] = useState("");

  const sortedRows = useMemo(() => {
    const query = memberSearch.trim().toLowerCase();
    const filtered = query
      ? rows.filter((r) => r.name.toLowerCase().includes(query) || r.coupon_code.toLowerCase().includes(query))
      : rows;

    const copy = [...filtered];
    copy.sort((a, b) => {
      const va = sortValue(a, sortKey);
      const vb = sortValue(b, sortKey);
      const cmp = typeof va === "string" ? va.localeCompare(vb as string) : va - (vb as number);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [rows, sortKey, sortDir, memberSearch]);

  const totalSales = rows.reduce((sum, r) => sum + (r.cycle?.sales_count ?? 0), 0);
  const totalGross = rows.reduce((sum, r) => sum + (r.cycle?.gross_total ?? 0), 0);
  const totalPieces = rows.reduce((sum, r) => sum + (r.cycle?.pieces_earned ?? 0), 0);
  const totalCommission = rows.reduce((sum, r) => sum + (r.cycle?.commission_amount ?? 0), 0);

  return (
    <div className="mm-app-frame">
      <Header
        memberName={member?.name}
        onSignOut={signOut}
        rightSlot={
          <Link to="/dashboard" className="mm-link-btn">
            Meu Painel
          </Link>
        }
      />

      <section className="mm-table-section" style={{ marginBottom: 24 }}>
        <h2 className="mm-section-title">Configurações</h2>
        <div className="mm-label" style={{ marginBottom: 16 }}>
          Vale pra todo mundo, a partir de 15 vendas no mês.
        </div>

        {configMessage && (
          <div className="mm-reset-banner">
            {configMessage}
            <button type="button" className="mm-link-btn" onClick={() => setConfigMessage(null)}>
              Fechar
            </button>
          </div>
        )}
        {configError && (
          <div className="mm-reset-banner mm-reset-banner-error">
            {configError}
            <button type="button" className="mm-link-btn" onClick={() => setConfigError(null)}>
              Fechar
            </button>
          </div>
        )}

        <div className="mm-config-grid">
          <div className="mm-field">
            <label className="mm-label" htmlFor="drop-pieces">
              Peças do drop atual
            </label>
            <input
              id="drop-pieces"
              type="number"
              min={0}
              step={1}
              value={dropPiecesDraft}
              onChange={(e) => setDropPiecesDraft(e.target.value)}
            />
          </div>

          <div className="mm-field">
            <label className="mm-label" htmlFor="commission-pct">
              Comissão (%)
            </label>
            <input
              id="commission-pct"
              type="number"
              min={0}
              max={100}
              step={0.1}
              value={commissionPctDraft}
              onChange={(e) => setCommissionPctDraft(e.target.value)}
            />
          </div>

          <button type="button" className="mm-config-save-btn" disabled={savingConfig || !appConfig} onClick={handleSaveConfig}>
            {savingConfig ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </section>

      <div className="mm-section-header">
        <div className="mm-label">{selectedMonth === currentCycleMonth() ? "Ciclo atual" : "Ciclo encerrado"}</div>
        <MonthSelector months={availableMonths} selected={selectedMonth} onChange={setSelectedMonth} />
      </div>

      <div className="mm-admin-summary-grid">
        <StatCard label="Vendas do Mês" value={String(totalSales)} />
        <StatCard label="Valor Bruto Vendido" value={currencyFormatter.format(totalGross)} />
        <StatCard label="Peças a Entregar" value={String(totalPieces)} accent />
        <StatCard label="Comissões do Mês" value={currencyFormatter.format(totalCommission)} accent />
      </div>

      <section className="mm-table-section" style={{ marginBottom: 24 }}>
        <h2 className="mm-section-title">Adicionar Membro</h2>

        {addMemberResult && (
          <div className="mm-reset-banner">
            Membro <strong>{addMemberResult.coupon}</strong> criado com login. Senha temporária:{" "}
            <strong>{addMemberResult.password}</strong> (vai pedir pra trocar no primeiro login).
            <button type="button" className="mm-link-btn" onClick={() => setAddMemberResult(null)}>
              Fechar
            </button>
          </div>
        )}
        {addMemberError && (
          <div className="mm-reset-banner mm-reset-banner-error">
            {addMemberError}
            <button type="button" className="mm-link-btn" onClick={() => setAddMemberError(null)}>
              Fechar
            </button>
          </div>
        )}

        <div className="mm-config-grid">
          <div className="mm-field">
            <label className="mm-label" htmlFor="new-member-name">
              Nome
            </label>
            <input
              id="new-member-name"
              type="text"
              value={newMemberName}
              onChange={(e) => setNewMemberName(e.target.value)}
            />
          </div>

          <div className="mm-field">
            <label className="mm-label" htmlFor="new-member-coupon">
              Cupom
            </label>
            <input
              id="new-member-coupon"
              type="text"
              value={newMemberCoupon}
              onChange={(e) => setNewMemberCoupon(e.target.value)}
            />
          </div>

          <button type="button" className="mm-config-save-btn" disabled={addingMember} onClick={handleAddMember}>
            {addingMember ? "Adicionando..." : "Adicionar"}
          </button>
        </div>
      </section>

      <section className="mm-table-section">
        <div className="mm-section-header" style={{ marginBottom: 16 }}>
          <h2 className="mm-section-title" style={{ marginBottom: 0 }}>
            Membros
          </h2>
          <input
            type="text"
            className="mm-search-input"
            placeholder="Buscar por nome ou cupom..."
            value={memberSearch}
            onChange={(e) => setMemberSearch(e.target.value)}
          />
        </div>

        {resetResult && (
          <div className="mm-reset-banner">
            Senha de <strong>{resetResult.coupon}</strong> resetada. Nova senha temporária:{" "}
            <strong>{resetResult.password}</strong> (vai pedir pra trocar no próximo login).
            <button type="button" className="mm-link-btn" onClick={() => setResetResult(null)}>
              Fechar
            </button>
          </div>
        )}
        {resetError && (
          <div className="mm-reset-banner mm-reset-banner-error">
            {resetError}
            <button type="button" className="mm-link-btn" onClick={() => setResetError(null)}>
              Fechar
            </button>
          </div>
        )}
        {editError && (
          <div className="mm-reset-banner mm-reset-banner-error">
            {editError}
            <button type="button" className="mm-link-btn" onClick={() => setEditError(null)}>
              Fechar
            </button>
          </div>
        )}

        {rows.length === 0 ? (
          <div className="mm-empty-state">Nenhum membro cadastrado.</div>
        ) : sortedRows.length === 0 ? (
          <div className="mm-empty-state">Nenhum membro encontrado pra "{memberSearch}".</div>
        ) : (
          <table className="mm-table">
            <thead>
              <tr>
                {(["name", "coupon", "sales", "gross", "pieces", "commission"] as SortKey[]).map((key) => (
                  <th key={key}>
                    <button type="button" className="mm-sort-th-btn" onClick={() => handleSort(key)}>
                      {SORT_LABEL[key]}
                      {sortKey === key ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
                    </button>
                  </th>
                ))}
                <th>Marco</th>
                <th>Entrega</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row) => {
                const salesCount = row.cycle?.sales_count ?? 0;
                const piecesEarned = row.cycle?.pieces_earned ?? 0;
                return (
                  <tr key={row.id}>
                    {editingMemberId === row.id ? (
                      <>
                        <td>
                          <input
                            className="mm-inline-edit-input"
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                          />
                        </td>
                        <td>
                          <input
                            className="mm-inline-edit-input"
                            type="text"
                            value={editCoupon}
                            onChange={(e) => setEditCoupon(e.target.value)}
                          />
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="mm-member-row-name">
                          {row.name}
                          <button
                            type="button"
                            className="mm-edit-icon-btn"
                            aria-label={`Editar ${row.name}`}
                            onClick={() => handleStartEdit(row)}
                          >
                            <PencilIcon />
                          </button>
                        </td>
                        <td className="mm-member-row-coupon">{row.coupon_code}</td>
                      </>
                    )}
                    <td>{salesCount}</td>
                    <td className="mm-cell-amount">{currencyFormatter.format(row.cycle?.gross_total ?? 0)}</td>
                    <td>{piecesEarned}</td>
                    <td className="mm-cell-amount">{currencyFormatter.format(row.cycle?.commission_amount ?? 0)}</td>
                    <td>
                      <span className={`mm-tier-badge${salesCount >= 5 ? " mm-tier-active" : ""}`}>
                        {tierLabel(salesCount)}
                      </span>
                    </td>
                    <td>
                      {piecesEarned > 0 && row.cycle ? (
                        <div className="mm-delivery-stepper">
                          <button
                            type="button"
                            className="mm-delivery-step-btn"
                            disabled={togglingCycleId === row.cycle.id || row.cycle.pieces_delivered_count <= 0}
                            onClick={() => handleDeliveryChange(row.cycle!, -1)}
                          >
                            −
                          </button>
                          <span
                            className={`mm-delivery-count${row.cycle.pieces_delivered_count >= piecesEarned ? " mm-delivery-count-done" : ""}`}
                          >
                            {row.cycle.pieces_delivered_count} / {piecesEarned}
                          </span>
                          <button
                            type="button"
                            className="mm-delivery-step-btn"
                            disabled={togglingCycleId === row.cycle.id || row.cycle.pieces_delivered_count >= piecesEarned}
                            onClick={() => handleDeliveryChange(row.cycle!, 1)}
                          >
                            +
                          </button>
                        </div>
                      ) : (
                        <span className="mm-label">—</span>
                      )}
                    </td>
                    <td>
                      {editingMemberId === row.id ? (
                        <div className="mm-header-buttons" style={{ borderLeft: "none", paddingLeft: 0 }}>
                          <button type="button" className="mm-link-btn" disabled={savingEdit} onClick={() => handleSaveEdit(row.id)}>
                            {savingEdit ? "Salvando..." : "Salvar"}
                          </button>
                          <button type="button" className="mm-link-btn" disabled={savingEdit} onClick={handleCancelEdit}>
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <div className="mm-header-buttons" style={{ borderLeft: "none", paddingLeft: 0 }}>
                          {row.auth_user_id ? (
                            <button
                              type="button"
                              className="mm-link-btn"
                              disabled={resettingId === row.id}
                              onClick={() => handleResetPassword(row.id)}
                            >
                              {resettingId === row.id ? "Resetando..." : "Resetar senha"}
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="mm-link-btn"
                              disabled={creatingLoginId === row.id}
                              onClick={() => handleCreateLogin(row.id)}
                            >
                              {creatingLoginId === row.id ? "Criando..." : "Criar login"}
                            </button>
                          )}
                          <button
                            type="button"
                            className="mm-link-btn mm-remove-btn"
                            disabled={deletingId === row.id}
                            onClick={() => handleDeleteMember(row)}
                          >
                            {deletingId === row.id ? "Excluindo..." : "Excluir"}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {inactiveRows.length > 0 && (
          <>
            <h2 className="mm-section-title" style={{ marginTop: 32 }}>
              Membros Removidos
            </h2>
            <table className="mm-table">
              <thead>
                <tr>
                  <th>Membro</th>
                  <th>Cupom</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {inactiveRows.map((row) => (
                  <tr key={row.id}>
                    <td className="mm-member-row-name">{row.name}</td>
                    <td className="mm-member-row-coupon">{row.coupon_code}</td>
                    <td>
                      <div className="mm-header-buttons" style={{ borderLeft: "none", paddingLeft: 0 }}>
                        <button
                          type="button"
                          className="mm-link-btn"
                          disabled={reactivatingId === row.id}
                          onClick={() => handleReactivateMember(row.id)}
                        >
                          {reactivatingId === row.id ? "Reativando..." : "Reativar"}
                        </button>
                        <button
                          type="button"
                          className="mm-link-btn mm-remove-btn"
                          disabled={deletingId === row.id}
                          onClick={() => handleDeleteMember(row)}
                        >
                          {deletingId === row.id ? "Excluindo..." : "Excluir"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </section>

      <section className="mm-table-section" style={{ marginTop: 24 }}>
        <h2 className="mm-section-title">Peças Vendidas no Mês</h2>
        {productTotals.length === 0 ? (
          <div className="mm-empty-state">Nenhuma peça vendida neste mês.</div>
        ) : (
          <table className="mm-table">
            <thead>
              <tr>
                <th>Produto</th>
                <th>Quantidade</th>
              </tr>
            </thead>
            <tbody>
              {productTotals.map((p) => (
                <tr key={p.productName}>
                  <td>{p.productName}</td>
                  <td className="mm-cell-amount">{p.quantity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="mm-table-section" style={{ marginTop: 24 }}>
        <h2 className="mm-section-title">Vendas do Mês (Todos os Membros)</h2>
        {recentSales.length === 0 ? (
          <div className="mm-empty-state">Nenhuma venda registrada neste mês.</div>
        ) : (
          <table className="mm-table">
            <thead>
              <tr>
                <th>Membro</th>
                <th>Produtos</th>
                <th>Data</th>
                <th>Valor</th>
              </tr>
            </thead>
            <tbody>
              {recentSales.map((sale) => (
                <tr key={sale.id}>
                  <td>
                    <span className="mm-member-row-name">{sale.members?.name ?? "—"}</span>{" "}
                    <span className="mm-member-row-coupon">{sale.members?.coupon_code}</span>
                  </td>
                  <td>{productsLabel(sale)}</td>
                  <td>{dateFormatter.format(new Date(sale.sale_date))}</td>
                  <td className="mm-cell-amount">{currencyFormatter.format(sale.gross_amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
