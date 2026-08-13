-- ----------------------------------------------------------------------------
-- Reforça members_delete_admin: além de exigir que quem chama seja admin,
-- agora a policy também bloqueia apagar uma linha que É admin — mesma regra
-- que já existia só no lado da Edge Function delete-member. Sem isso, quem
-- chamasse a REST API direto (sem passar pela function) ainda conseguia
-- apagar outro admin.
-- ----------------------------------------------------------------------------
drop policy if exists members_delete_admin on members;
create policy members_delete_admin on members
  for delete using (is_admin_user() and not is_admin);
