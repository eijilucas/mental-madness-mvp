-- Troca "entregue: sim/não" por uma contagem — as peças são conquistadas aos
-- poucos ao longo do mês (5 vendas = 1 peça, +5 = outra, 15+ = todas as do
-- drop), então a entrega também acontece em remessas separadas, não tudo de
-- uma vez. Nenhum dado real usava a coluna boolean ainda, então é seguro
-- trocar direto.
alter table cycles drop column if exists pieces_delivered;
alter table cycles add column if not exists pieces_delivered_count integer not null default 0 check (pieces_delivered_count >= 0);
