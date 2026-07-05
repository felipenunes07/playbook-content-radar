-- Configuração editável da prospecção (pedido do Felipe em 05/07): o ICP e a
-- mensagem padrão saem dos secrets e viram uma linha única editável pela UI
-- (botão "Ver/editar ICP" na página Leads ICP). Ordem de resolução nas functions:
-- este registro > env (PROSPECT_ICP_RULES / PROSPECT_MESSAGE_TEMPLATE) > default.
create table if not exists public.prospect_settings (
  id boolean primary key default true check (id),
  icp_rules text,
  message_template text,
  updated_at timestamptz not null default now()
);

-- Seed com os valores em uso hoje (escopo formal + ICP do plugin + mensagem do Victor).
insert into public.prospect_settings (id, icp_rules, message_template) values (
  true,
  '1. Cargo alto (aprova): founder, sócio, CEO, C-level, diretor, Head, gerente, liderança comercial/marketing/operações, Growth, RevOps, gerente de inovação. Rejeita: estagiário, estudante, analista júnior, SDR/vendedor baixo na hierarquia, assistente.
2. Área (aprova): marketing, vendas/comercial, operações, growth, receita/RevOps, tecnologia/produto, dono do negócio. Rejeita: financeiro, jurídico, RH. Rejeita também quem parece só querer aprender automação, autônomos/freelancers, negócios B2C locais sem time de vendas.
3. Empresa atual com 200+ colaboradores. Se employee_count vier null mas a empresa parecer claramente grande (banco, multinacional conhecida), pode aprovar citando isso no motivo.
4. IMPORTANTE: se "currently_employed" for false, o lead está sem emprego atual — NUNCA aprove pela empresa antiga; status "rejeitado" com motivo explicando.
5. Use "revisar" para casos limítrofes que merecem decisão humana: cargo alto mas empresa sem headcount conhecido, porte um pouco abaixo do corte com contexto forte, ou dados insuficientes porém promissores.
Score 0-100 (fit geral de cargo + área + porte + contexto do comentário): aprovado costuma ficar 70+, revisar 40-69, rejeitado abaixo de 40.',
  'Fala {nome}, beleza?
Vi que você interagiu com meus conteúdos aqui e acabei passando pelo teu perfil.
Vou ser bem sincero, a {company} tá exatamente dentro do meu ICP e o que eu queria contigo era a possibilidade de fazer meu pitch hahaha
Brincadeiras à parte, queria mesmo explicar brevemente o que fazemos aqui na Playbook Lab e ver se conseguimos resolver alguma dor/ajudar vocês por aí.
Posso te mandar um áudio + um material pra você avaliar?
Forte abraço!'
) on conflict (id) do nothing;

drop trigger if exists prospect_settings_updated_at on public.prospect_settings;
create trigger prospect_settings_updated_at before update on public.prospect_settings
for each row execute function public.set_content_updated_at();

alter table public.prospect_settings enable row level security;
drop policy if exists "prospecting read" on public.prospect_settings;
create policy "prospecting read" on public.prospect_settings for select to anon, authenticated using (true);
revoke all on table public.prospect_settings from anon, authenticated;
grant select on table public.prospect_settings to anon, authenticated;
