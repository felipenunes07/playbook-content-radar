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
});

