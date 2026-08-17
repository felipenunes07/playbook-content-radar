-- Critério determinístico do ICP fora do prompt.
--
-- Em 17/08/2026 o modelo de qualificação passou a contradizer a regra escrita: um
-- "Gerente de vendas" (área vendas) de empresa com 220 colaboradores foi rejeitado
-- com o motivo "a área de atuação é de vendas, o que não se alinha com os critérios"
-- — o oposto da regra 2, que aprova vendas. Resistiu a duas rodadas de ajuste no
-- texto das regras. Antes disso já havia rejeitado Sales Director de empresa com 386
-- e Gerente de Canais de empresa com 2.192, sempre inventando um critério extra.
--
-- Porte, cargo barrado e área proibida são checagens objetivas: não são julgamento,
-- são if. Ficam aqui, onde não dependem de sorte no prompt. O LLM continua decidindo
-- o que é genuinamente difuso — porte desconhecido, título ambíguo, contexto do
-- comentário, "só quer aprender automação".

create or replace function public.icp_hard_verdict(
  p_job_title text,
  p_headline text,
  p_area text,
  p_company_size integer,
  p_company_name text default null
) returns text
language plpgsql
immutable
as $$
declare
  titulo text := lower(coalesce(nullif(p_job_title, ''), p_headline, ''));
  empresa text := lower(coalesce(p_company_name, ''));
  porte integer := p_company_size;
  tem_lideranca boolean;
  tem_barrado boolean;
  tem_ambiguo boolean;
begin
  if titulo = '' then return null; end if;

  -- "Self-Employed" é uma página do LinkedIn com mais de um milhão de "colaboradores".
  -- Sem esta guarda a regra dura aprovaria autônomo como multinacional.
  if empresa ~ '(self.?employed|aut[ôo]nom|freelanc|home.?office|^pj$|^pj[^[:alnum:]]|profissional liberal)' then
    porte := null;
  end if;

  -- Acrônimos exigem borda nos DOIS lados. Sem a borda à direita, "coo" casava com o
  -- começo de "Coordenador" e a regra aprovou quatro coordenadores como se fossem
  -- C-level. Mesmo motivo para não usar "owner" solto: casava com "Product Owner".
  -- E "s[óo]ci[oa]" sem borda casaria com "sociologia".
  tem_lideranca :=
       titulo ~ '(^|[^[:alnum:]])(ceo|cto|cfo|coo|cmo|cro|cso|vp)([^[:alnum:]]|$)'
    or titulo ~ '(^|[^[:alnum:]])(founder|co-?founder|fundador|cofundador|chief|presidente|vice-presidente|diretor|director|gerente|superintendente|propriet[áa]ri)'
    or titulo ~ '(^|[^[:alnum:]])(s[óo]ci[oa]|head)([^[:alnum:]]|$)'
    -- "manager" é liderança em título comercial, mas não em Account/Product/Project
    -- Manager — esses são individual contributor, mesma família do Account Executive.
    or (titulo ~ '(^|[^[:alnum:]])manager([^[:alnum:]]|$)'
        and titulo !~ '(account|product|project|community|social media|office|program) manager');

  tem_barrado := titulo ~ '(^|[^[:alnum:]])(estagi[áa]ri|estudante|trainee|aprendiz|assistente|auxiliar|analista|sdr|bdr|sales development|business development representative|pr[ée]-vend|pre-vend|inside sales|closer|social seller|recepcion)';

  -- Coordenação/supervisão/liderança de time é a faixa cinza: não é cargo alto pela
  -- regra do Victor, mas também não é operacional puro. "Coordenador de Vendas e SDR"
  -- não pode ser rejeitado só por conter SDR no título — quem decide é o modelo.
  tem_ambiguo := titulo ~ '(^|[^[:alnum:]])(coordenador|coordenadora|supervisor|supervisora|l[íi]der|lead)([^[:alnum:]]|$)';
  if tem_ambiguo and not tem_lideranca then
    return null;
  end if;

  -- Cargo operacional SEM nenhum marcador de liderança no título: rejeita.
  if tem_barrado and not tem_lideranca then
    return 'disqualified';
  end if;

  -- REGRA DURA: liderança + área comercial/produto + 200 ou mais colaboradores é
  -- aprovado. Sem exceção, sem "não parece ter poder de compra".
  -- 'outro' e 'desconhecido' ficam fora de propósito: aí a área não foi determinada.
  if tem_lideranca
     and p_area in ('vendas', 'marketing', 'operacoes', 'growth', 'tecnologia')
     and coalesce(porte, 0) >= 200
  then
    return 'qualified';
  end if;

  if p_area in ('financeiro', 'rh', 'juridico') then
    return 'disqualified';
  end if;

  return null; -- caso difuso: quem decide é o LLM
end $$;

comment on function public.icp_hard_verdict is 'Veredito determinístico do ICP a partir de cargo, área e porte. NULL = caso difuso, decide o LLM.';

-- Corretor re-executável: alinha o veredito gravado com a regra dura. Idempotente —
-- só toca linha em que o modelo contradiz a regra.
create or replace function public.apply_icp_hard_rules(p_post_id uuid default null)
returns table (aprovados_corrigidos integer, rejeitados_corrigidos integer)
language plpgsql
as $$
declare
  v_aprovados integer;
  v_rejeitados integer;
begin
  with alvo as (
    select l.id, public.icp_hard_verdict(l.job_title, l.headline, l.area, l.company_size, l.company_name) as veredito,
           l.qualification_status, l.score, l.qualification_reason
    from public.leads l
    where l.enrichment_status = 'enriched'
      and (p_post_id is null or l.first_seen_post_id = p_post_id)
  ), divergente as (
    select * from alvo
    where veredito is not null and veredito <> qualification_status
  ), corrigido as (
    update public.leads l
    set qualification_status = d.veredito,
        score = case when d.veredito = 'qualified'
                     then greatest(coalesce(d.score, 0), 70)
                     else least(coalesce(d.score, 100), 40) end,
        qualification_reason = case when d.veredito = 'qualified'
          then 'Aprovado pela regra dura (liderança + área comercial + porte 200+); veredito do modelo foi sobrescrito. Motivo original: ' || coalesce(d.qualification_reason, '(sem motivo)')
          else 'Rejeitado pela regra dura (cargo operacional ou área proibida); veredito do modelo foi sobrescrito. Motivo original: ' || coalesce(d.qualification_reason, '(sem motivo)') end
    from divergente d
    where l.id = d.id
    returning d.veredito
  )
  select count(*) filter (where veredito = 'qualified')::integer,
         count(*) filter (where veredito = 'disqualified')::integer
    into v_aprovados, v_rejeitados
  from corrigido;

  return query select coalesce(v_aprovados, 0), coalesce(v_rejeitados, 0);
end $$;

comment on function public.apply_icp_hard_rules is 'Sobrescreve vereditos que contradizem a regra dura do ICP. Idempotente; aceita post_id para escopo.';

-- Roda 5 minutos depois do prospect-enrich-drain (*/10), para corrigir o que acabou
-- de ser analisado sem depender de ninguém lembrar de chamar.
select cron.schedule('icp-hard-rules', '5-59/10 * * * *', $$select public.apply_icp_hard_rules()$$);
