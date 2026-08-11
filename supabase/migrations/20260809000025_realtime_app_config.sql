-- Painel do membro passa a ler comissão/peças do drop ao vivo — se o admin
-- mudar em app_config, atualiza sem precisar dar refresh.
alter publication supabase_realtime add table app_config;
