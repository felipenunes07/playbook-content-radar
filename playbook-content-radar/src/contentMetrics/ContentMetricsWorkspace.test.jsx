/* @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import ContentMetricsWorkspace from './ContentMetricsWorkspace.jsx';

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

describe('ContentMetricsWorkspace', () => {
  it('shows the real historical snapshot, filters and overview rankings', async () => {
    render(<ContentMetricsWorkspace initialData={data} initialSection="overview" />);

    expect(await screen.findByRole('heading', { name: 'Métricas de conteúdo' })).toBeInTheDocument();
    expect(screen.getByText(/Snapshot histórico local/i)).toBeInTheDocument();
    expect(screen.getByText('2 posts no arquivo completo')).toBeInTheDocument();
    expect(screen.getByText('Post campeão de IA')).toBeInTheDocument();
    expect(screen.getByText('187')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Victor/i }));
    await waitFor(() => expect(screen.getByText('112')).toBeInTheDocument());
    expect(screen.queryByText('Post de vendas')).not.toBeInTheDocument();
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
    expect(screen.getByRole('heading', { name: /Posts por semana/i })).toBeInTheDocument();
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


