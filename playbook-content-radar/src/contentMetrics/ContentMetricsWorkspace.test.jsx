/* @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import ContentMetricsWorkspace, { buildLeadAnalysisPlan, waitForLeadAnalysisRetry, computeRateLimitBackoff, summarizeGrowth, buildGoalsWhatsappMessage, progressBar } from './ContentMetricsWorkspace.jsx';

const data = {
  source: 'local_snapshot',
  freshness: '2026-05-12',
  warning: 'relation does not exist',
  linkedin: [
    { external_post_id: '1', owner_name: 'Victor Baggio', post_url: 'https://linkedin.com/post/1', published_at: '2026-01-10T10:00:00Z', hook: 'Post campeão de IA', content: 'Comente MAPS', format: 'image', theme: 'IA', cta_keyword: 'MAPS', likes: 100, comments: 10, shares: 2, engagement_total: 112, engagement_score: 138 },
    { external_post_id: '2', owner_name: 'Fernando Tedesco', post_url: 'https://linkedin.com/post/2', published_at: '2026-02-10T10:00:00Z', hook: 'Post de vendas', content: 'Sem CTA', format: 'text', theme: 'Vendas', cta_keyword: null, likes: 50, comments: 20, shares: 5, engagement_total: 75, engagement_score: 130 },
  ],
  youtube: [],
  accounts: [],
  imports: [],
  runs: [],
  growth: [],
};

afterEach(cleanup);

// Crescimento do Victor no LinkedIn atravessando a virada de junho -> julho.
const growthRows = [
  { platform: 'linkedin', owner_name: 'Victor Baggio', metric_date: '2026-06-26', followers: 20811 },
  { platform: 'linkedin', owner_name: 'Victor Baggio', metric_date: '2026-07-02', followers: 20846 },
  { platform: 'linkedin', owner_name: 'Victor Baggio', metric_date: '2026-07-08', followers: 20965 },
];

describe('summarizeGrowth — base do início do mês', () => {
  it('usa a última coleta antes do dia 1º como número levado para dentro do mês', () => {
    const [victor] = summarizeGrowth(growthRows, 'linkedin', 'followers', '2026-07').owners;
    expect(victor.monthStart).toBe(20811);
    expect(victor.monthStartDate).toBe('2026-06-26');
    expect(victor.monthStartSource).toBe('before');
    expect(victor.monthGain).toBe(154);
  });

  it('cai na primeira coleta do mês quando não há nada antes do dia 1º', () => {
    const semJunho = growthRows.filter((g) => g.metric_date >= '2026-07-01');
    const [victor] = summarizeGrowth(semJunho, 'linkedin', 'followers', '2026-07').owners;
    expect(victor.monthStart).toBe(20846);
    expect(victor.monthStartSource).toBe('first-in-month');
    expect(victor.monthGain).toBe(119);
  });

  it('mede progresso pelo crescimento do mês, não pelo total absoluto', () => {
    const [victor] = summarizeGrowth(growthRows, 'linkedin', 'followers', '2026-07').owners;
    const goal = 22000;
    const needed = goal - victor.monthStart; // 1189
    const pct = Math.floor((victor.monthGain / needed) * 100);
    expect(needed).toBe(1189);
    expect(pct).toBe(12); // e NÃO 95%, que é o que 20965/22000 daria
    expect(Math.floor((victor.current / goal) * 100)).toBe(95);
  });
});

describe('progressBar', () => {
  it('desenha a barra proporcional ao percentual', () => {
    expect(progressBar(0)).toBe('░░░░░░░░░░');
    expect(progressBar(50)).toBe('█████░░░░░');
    expect(progressBar(100)).toBe('██████████');
  });

  it('mostra ao menos um bloco quando já houve algum crescimento', () => {
    expect(progressBar(1)).toBe('█░░░░░░░░░');
  });

  it('não enche a barra antes de bater a meta', () => {
    expect(progressBar(99)).toBe('█████████░');
  });

  it('trata percentuais fora do intervalo', () => {
    expect(progressBar(-10)).toBe('░░░░░░░░░░');
    expect(progressBar(140)).toBe('██████████');
  });
});

describe('buildGoalsWhatsappMessage', () => {
  it('mostra barra de progresso em vez do número do início do mês', () => {
    const summaries = [{
      platform: { id: 'linkedin', label: 'LinkedIn', unit: 'seguidores', emoji: '🔵' },
      summary: summarizeGrowth(growthRows, 'linkedin', 'followers', '2026-07'),
    }];
    const goals = { 'linkedin:Victor Baggio:2026-07': 22000 };
    const msg = buildGoalsWhatsappMessage(summaries, goals, 'daily', '2026-07', 'jul 2026');
    expect(msg).toContain('█░░░░░░░░░ 12%');
    expect(msg).toContain('+154 de 1.189 · meta 22.000');
    expect(msg).not.toContain('começou o mês com');
  });

  it('marca meta batida com a barra cheia', () => {
    const summaries = [{
      platform: { id: 'linkedin', label: 'LinkedIn', unit: 'seguidores', emoji: '🔵' },
      summary: summarizeGrowth(growthRows, 'linkedin', 'followers', '2026-07'),
    }];
    const goals = { 'linkedin:Victor Baggio:2026-07': 20900 };
    const msg = buildGoalsWhatsappMessage(summaries, goals, 'daily', '2026-07', 'jul 2026');
    expect(msg).toContain('██████████ 100%');
    expect(msg).toContain('🎉 meta de 20.900 batida!');
  });
});

describe('ContentMetricsWorkspace', () => {
  it('estimates a conservative lead analysis plan from Gemini pacing and pending count', () => {
    expect(buildLeadAnalysisPlan({ pending: 151, batchSize: 2, secondsPerLead: 24, retryAfterSeconds: 75 })).toMatchObject({
      batchSize: 2,
      retryAfterSeconds: 75,
      estimatedSeconds: 3624,
      etaLabel: '1h 01min',
    });
  });

  it('lets the stop button interrupt a rate-limit wait instead of sleeping until the timeout ends', async () => {
    const stopRef = { current: true };
    await expect(waitForLeadAnalysisRetry(60, stopRef, () => new Promise((resolve) => setTimeout(resolve, 1)))).resolves.toBe('stopped');
  });

  it('grows the wait on each consecutive Google rate-limit but never aborts, capping at 10min', () => {
    expect(computeRateLimitBackoff(1, 75)).toBe(75);
    expect(computeRateLimitBackoff(2, 75)).toBe(120);
    // Sobe a cada erro consecutivo e satura no teto — a fila continua, só desacelera.
    expect(computeRateLimitBackoff(20, 75)).toBe(600);
    expect(computeRateLimitBackoff(100, 75)).toBe(600);
  });

  it('selects exportable leads individually and never selects a lead already prospected', async () => {
    render(<ContentMetricsWorkspace mode="leads" initialData={{
      ...data,
      source: 'supabase',
      linkedin: [{ id: 'post-1', external_post_id: '1', owner_name: 'Victor Baggio', hook: 'Post de IA' }],
      leads: [
        { id: 'lead-new', full_name: 'Lead Novo', qualification_status: 'qualified', first_seen_post_id: 'post-1', enrichment_status: 'enriched' },
        { id: 'lead-sent', full_name: 'Lead Enviado', qualification_status: 'qualified', first_seen_post_id: 'post-1', enrichment_status: 'enriched' },
      ],
      leadOutreach: [{ lead_id: 'lead-sent', status: 'prospected' }],
      leadComments: [],
      leadQualifications: [],
      icpProfiles: [],
    }} />);

    const newLeadCheckbox = await screen.findByRole('checkbox', { name: 'Desmarcar Lead Novo para exportação' });
    const sentLeadCheckbox = screen.getByRole('checkbox', { name: 'Selecionar Lead Enviado para exportação' });
    expect(newLeadCheckbox).toBeChecked();
    expect(sentLeadCheckbox).not.toBeChecked();
    expect(sentLeadCheckbox).toBeDisabled();
    expect(screen.getByText(/Exportar 1 selecionado/)).toBeInTheDocument();

    fireEvent.click(newLeadCheckbox);
    expect(screen.getByText(/Exportar 0 selecionado/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Exportar leads filtrados para Excel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Exportar leads filtrados para CSV' })).toBeDisabled();
  });

  it('shows the real historical snapshot, filters and overview rankings', async () => {
    render(<ContentMetricsWorkspace initialData={data} initialSection="overview" />);

    expect(await screen.findByRole('heading', { name: 'Métricas de conteúdo' })).toBeInTheDocument();
    expect(screen.getByText(/Snapshot histórico local/i)).toBeInTheDocument();
    expect(screen.getByText('2 posts no arquivo completo')).toBeInTheDocument();
    expect(screen.getByText('Post campeão de IA')).toBeInTheDocument();
    expect(screen.getByText(/Plataforma destaque do mês/i)).toBeInTheDocument();
    expect(screen.getByText(/Média conteúdos\/semana/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Victor/i }));
    await waitFor(() => expect(screen.queryByText('Post de vendas')).not.toBeInTheDocument());
    expect(screen.getByText('Post campeão de IA')).toBeInTheDocument();
  });

  it('defaults content and YouTube filters to the latest 12 months in the loaded data', async () => {
    const { unmount } = render(<ContentMetricsWorkspace initialData={data} initialSection="overview" />);

    expect(await screen.findByLabelText('Data inicial')).toHaveValue('2025-02-10');
    expect(screen.getByLabelText('Data final')).toHaveValue('2026-02-10');

    unmount();

    render(<ContentMetricsWorkspace initialData={{
      ...data,
      source: 'supabase',
      youtube: [{ id: 'video-1', video_id: 'yt1', owner_name: 'Victor Baggio', title: 'Agentes que vendem', video_url: 'https://youtube.com/watch?v=yt1', published_at: '2026-06-01', views: 1200, likes: 80, comments: 12, engagement_total: 92, engagement_rate: 7.67 }],
    }} initialSection="youtube" />);

    expect(await screen.findByLabelText('Data inicial YouTube')).toHaveValue('2025-06-01');
    expect(screen.getByLabelText('Data final YouTube')).toHaveValue('2026-06-01');
  });

  it('exposes every required subsection and honest YouTube empty state', async () => {
    render(<ContentMetricsWorkspace initialData={data} initialSection="youtube" />);
    expect(await screen.findByRole('heading', { name: 'YouTube', level: 1 })).toBeInTheDocument();
    expect(screen.getAllByText(/Apify/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/YOUTUBE_API_KEY/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Configurações' })).toBeInTheDocument();
  });

  it('renders YouTube views and engagement rate when collected data exists', async () => {
    render(<ContentMetricsWorkspace initialData={{
      ...data,
      source: 'supabase',
      youtube: [{ id: 'video-1', video_id: 'yt1', owner_name: 'Victor Baggio', title: 'Agentes que vendem', video_url: 'https://youtube.com/watch?v=yt1', published_at: '2026-06-01', views: 1200, likes: 80, comments: 12, engagement_total: 92, engagement_rate: 7.67 }],
    }} initialSection="youtube" />);

    expect(await screen.findByText('Agentes que vendem')).toBeInTheDocument();
    expect(screen.getAllByText('1.200')).toHaveLength(2);
    expect(screen.getAllByText('7,67%')).toHaveLength(2);
  });

  it('shows account growth and collection run evidence when Supabase has snapshots', async () => {
    const collected = {
      ...data,
      source: 'supabase',
      growth: [{ account_id: 'a1', owner_name: 'Victor Baggio', metric_date: '2026-07-01', subscribers: 1200, total_views: 50000 }],
      runs: [{ id: 'run-1', source: 'apify_youtube', status: 'success', started_at: '2026-07-01T09:00:00Z', accounts_processed: 2, items_processed: 40 }],
    };
    const { rerender } = render(<ContentMetricsWorkspace initialData={collected} initialSection="youtube" />);
    expect(await screen.findByRole('heading', { name: 'Crescimento de contas' })).toBeInTheDocument();

    rerender(<ContentMetricsWorkspace initialData={collected} initialSection="imports" />);
    expect(await screen.findByText('apify_youtube')).toBeInTheDocument();
    expect(screen.getByText('40')).toBeInTheDocument();
  });

  it('shows the operational post columns and protected actions', async () => {
    render(<ContentMetricsWorkspace initialData={data} initialSection="posts" />);
    expect(await screen.findByRole('columnheader', { name: /classificação/i })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Histórico de métricas/i })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: /Editar classificação/i })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: /Reclassificar/i })).toHaveLength(2);
  });


  it('uses an avatar toggle for both creators and filters every executive chart', async () => {
    render(<ContentMetricsWorkspace initialData={data} initialSection="overview" />);

    expect(await screen.findByRole('button', { name: /Ambos/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Victor/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Fernando/i })).toBeInTheDocument();
    expect(screen.getByAltText('Victor Baggio')).toBeInTheDocument();
    expect(screen.getByAltText('Fernando Tedesco')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Conteúdos por semana/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Frequência diária/i })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Média móvel de 4 semanas/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Fernando/i }));
    await waitFor(() => expect(screen.getByText('Post de vendas')).toBeInTheDocument());
    expect(screen.queryByText('Post campeão de IA')).not.toBeInTheDocument();
  });
  it('shows YouTube filters when video data exists', async () => {
    render(<ContentMetricsWorkspace initialData={{ ...data, source: 'supabase', youtube: [{ id: 'v1', video_id: 'v1', owner_name: 'Victor Baggio', title: 'IA aplicada', published_at: '2026-06-01', theme: 'IA', views: 10 }] }} initialSection="youtube" />);
    expect(await screen.findByLabelText('Canal')).toBeInTheDocument();
    expect(screen.getByLabelText('Buscar vídeo')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Vídeos publicados por mês' })).toBeInTheDocument();
  });

  it('defaults content date filter to the latest date from either posts or growth metrics', async () => {
    const testData = {
      ...data,
      growth: [
        { account_id: 'a1', owner_name: 'Victor Baggio', platform: 'linkedin', metric_date: '2026-03-15', followers: 20000 }
      ]
    };
    render(<ContentMetricsWorkspace initialData={testData} initialSection="overview" />);
    expect(await screen.findByLabelText('Data inicial')).toHaveValue('2025-03-15');
    expect(screen.getByLabelText('Data final')).toHaveValue('2026-03-15');
  });
});

// Um post viral não cabe numa invocação da Edge Function (parede de ~150s no plano
// free), então a function ingere o dataset em fatias e devolve done:false enquanto
// sobra coisa. Se a tela parasse na primeira resposta, o post das 36 Skills entraria
// com 200 dos 4.373 comentários e ninguém notaria — o job fica "SUCESSO" na tabela.
describe('Prospecção paginada', () => {
  const icps = [
    { id: 'icp-comercial', name: 'Playbook Lab — comercial 200+', is_default: true, active: true, hard_rules_enabled: true, min_company_size: 200, approved_areas: ['vendas'], blocked_areas: ['rh'], icp_rules: 'Cargo alto…' },
    { id: 'icp-second-brain', name: 'Second Brain', is_default: false, active: true, hard_rules_enabled: false, min_company_size: null, approved_areas: [], blocked_areas: [], icp_rules: 'Quem constrói sistema pessoal…' },
  ];
  const prospectingData = {
    ...data,
    prospecting: [],
    icpProfiles: icps,
    linkedin: [{ ...data.linkedin[0], id: 'post-1' }],
  };

  function fakeClient(prospectResponses) {
    const calls = [];
    const bodies = [];
    let index = 0;
    return {
      calls,
      bodies,
      functions: {
        invoke: async (name, options) => {
          calls.push(name);
          bodies.push({ name, body: options?.body || {} });
          if (name === 'prospect-post') {
            const data = prospectResponses[Math.min(index, prospectResponses.length - 1)];
            index += 1;
            return { data, error: null };
          }
          if (name === 'enrich-leads') {
            return { data: { success: true, processed: 0, prefiltered: 0, qualified: 0, requalified: 0, remaining: 0 }, error: null };
          }
          return { data: null, error: new Error(`function inesperada: ${name}`) };
        },
      },
    };
  }

  // Prospectar tem duas etapas desde os ICPs múltiplos: o botão da tabela abre o
  // diálogo "quais ICPs usar" e a confirmação é que dispara a function. O diálogo
  // abre com TODOS os ativos marcados (o caso comum é querer os dois), então pedir
  // um ICP específico significa desmarcar os outros.
  const clickProspectar = (apenasIcp) => {
    const button = screen.getAllByRole('button').find((node) => node.textContent.trim().startsWith('Prospectar'));
    fireEvent.click(button);
    if (apenasIcp) {
      icps.filter((icp) => icp.name !== apenasIcp).forEach((icp) => {
        const option = screen.getAllByRole('button').find((node) => node.textContent.includes(icp.name));
        fireEvent.click(option);
      });
    }
    const confirm = screen.getByRole('button', { name: /^Prospectar com/ });
    fireEvent.click(confirm);
  };

  it('manda o ICP escolhido no diálogo para a function de prospecção', async () => {
    const client = fakeClient([{ success: true, done: true, status: 'success', icpNames: ['Second Brain'], totalComments: 10, datasetTotal: 10, totalLeads: 10, opportunities: 4, queuedQualifications: 4 }]);
    render(<ContentMetricsWorkspace client={client} initialData={prospectingData} mode="prospecting" />);

    clickProspectar('Second Brain');

    await waitFor(() => expect(client.calls).toContain('prospect-post'));
    const call = client.bodies.find((entry) => entry.name === 'prospect-post');
    expect(call.body.icpIds).toEqual(['icp-second-brain']);
    expect(call.body.rescrape).toBeUndefined();
  });

  // O pedido do Felipe em 27/08: clicar UMA vez e o post ser julgado pelos dois
  // públicos. Antes era um ICP por clique, e testar o segundo exigia rodar de novo.
  it('sem desmarcar nada, prospecta com TODOS os ICPs ativos de uma vez', async () => {
    const client = fakeClient([{ success: true, done: true, status: 'success', icpNames: ['Playbook Lab — comercial 200+', 'Second Brain'], totalComments: 10, datasetTotal: 10, totalLeads: 10, opportunities: 4, queuedQualifications: 8 }]);
    render(<ContentMetricsWorkspace client={client} initialData={prospectingData} mode="prospecting" />);

    clickProspectar();

    await waitFor(() => expect(client.calls).toContain('prospect-post'));
    const call = client.bodies.find((entry) => entry.name === 'prospect-post');
    expect(call.body.icpIds).toEqual(['icp-comercial', 'icp-second-brain']);
  });

  // Rodar outro ICP num post já raspado não pode chamar a Apify de novo: os
  // comentários estão no banco e crédito de Apify é o recurso escasso.
  it('não dispara análise quando o post já tinha veredito de todos no ICP escolhido', async () => {
    const client = fakeClient([{ success: true, done: true, status: 'success', requalifyOnly: true, icpNames: ['Second Brain'], queuedQualifications: 0, leadsInPost: 12, totalComments: 12, totalLeads: 12, opportunities: 0 }]);
    render(<ContentMetricsWorkspace client={client} initialData={prospectingData} mode="prospecting" />);

    clickProspectar('Second Brain');

    await waitFor(() => expect(screen.getByText(/já tinham veredito/)).toBeInTheDocument());
    expect(client.calls).not.toContain('enrich-leads');
  });

  it('continua chamando a function até done e só então dispara a análise ICP', async () => {
    const client = fakeClient([
      { success: true, done: false, status: 'running', totalComments: 200, datasetTotal: 600, totalLeads: 190, opportunities: 190 },
      { success: true, done: false, status: 'running', totalComments: 400, datasetTotal: 600, totalLeads: 380, opportunities: 380 },
      { success: true, done: true, status: 'success', totalComments: 600, datasetTotal: 600, totalLeads: 570, opportunities: 570 },
    ]);
    render(<ContentMetricsWorkspace client={client} initialData={prospectingData} mode="prospecting" />);

    clickProspectar();

    // A mensagem "Prospecção concluída" é transitória: a análise ICP começa em
    // seguida e reescreve o aviso. O que fica é a contagem na linha do post.
    await waitFor(() => expect(client.calls).toContain('enrich-leads'));
    expect(client.calls.filter((name) => name === 'prospect-post')).toHaveLength(3);
    await waitFor(() => expect(screen.getByText('600')).toBeInTheDocument());
  });

  it('não dispara a análise ICP quando a paginação não terminou', async () => {
    const client = fakeClient([
      { success: true, done: false, status: 'running', totalComments: 200, datasetTotal: 600, totalLeads: 190, opportunities: 190 },
    ]);
    render(<ContentMetricsWorkspace client={client} initialData={prospectingData} mode="prospecting" />);

    clickProspectar();

    await waitFor(() => expect(screen.getByText(/não terminou dentro do limite de continuações/)).toBeInTheDocument());
    expect(client.calls).not.toContain('enrich-leads');
  });
});
