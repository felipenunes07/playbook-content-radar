import React from 'react';
import { Edit3, ExternalLink, History, Search, Sparkles } from 'lucide-react';

const integer = new Intl.NumberFormat('pt-BR');
const date = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });

export function MetricStrip({ metrics, youtubeViews = 0 }) {
  const items = [
    ['Posts', metrics.contentCount],
    ['Engagement', metrics.engagementTotal],
    ['Comentários', metrics.comments],
    ['Likes', metrics.likes],
    ['Shares', metrics.shares],
  ];
  if (youtubeViews > 0) {
    items.push(['Views YouTube', youtubeViews]);
  }
  return (
    <div className="cm-metric-strip">
      {items.map(([label, value]) => (
        <div className="cm-metric" key={label}>
          <span>{label}</span>
          <strong>{integer.format(value || 0)}</strong>
        </div>
      ))}
    </div>
  );
}

export function ContentFilters({ filters, onChange, posts, compact = false, advanced = false, hideOwner = false }) {
  const values = (field, fallback = '') => [...new Set(posts.map((post) => post[field] || fallback).filter(Boolean))].sort();
  const set = (field) => (event) => onChange({ ...filters, [field]: event.target.value });
  return (
    <div className={`cm-filters${compact ? ' compact' : ''}${advanced ? ' advanced' : ''}`}>
      {!hideOwner && <label>Pessoa<select aria-label="Pessoa" value={filters.owner || ''} onChange={set('owner')}><option value="">Todas</option>{values('owner_name').map((value) => <option key={value}>{value}</option>)}</select></label>}
      {!compact && <label>De<input aria-label="Data inicial" type="date" value={filters.from || ''} onChange={set('from')} /></label>}
      {!compact && <label>Até<input aria-label="Data final" type="date" value={filters.to || ''} onChange={set('to')} /></label>}
      <label>Formato<select aria-label="Formato" value={filters.format || ''} onChange={set('format')}><option value="">Todos</option>{values('format').map((value) => <option key={value}>{value}</option>)}</select></label>
      <label>Tema<select aria-label="Tema" value={filters.theme || ''} onChange={set('theme')}><option value="">Todos</option>{values('theme', 'Não classificado').map((value) => <option key={value}>{value}</option>)}</select></label>
      <label>CTA<select aria-label="CTA" value={filters.cta || ''} onChange={set('cta')}><option value="">Todos</option>{values('cta_keyword', 'Sem CTA').map((value) => <option key={value}>{value}</option>)}</select></label>
      {advanced && <label>Etapa<select aria-label="Etapa do funil" value={filters.funnelStage || ''} onChange={set('funnelStage')}><option value="">Todas</option>{values('funnel_stage', 'Não classificado').map((value) => <option key={value}>{value}</option>)}</select></label>}
      {advanced && <label>Intenção<select aria-label="Intenção comercial" value={filters.commercialIntent || ''} onChange={set('commercialIntent')}><option value="">Todas</option>{values('commercial_intent', 'Não classificado').map((value) => <option key={value}>{value}</option>)}</select></label>}
      <label className="cm-search"><span>Buscar</span><div><Search size={14} /><input aria-label="Buscar posts" value={filters.search || ''} onChange={set('search')} placeholder="Hook, texto ou tema" /></div></label>
    </div>
  );
}

export function YoutubeFilters({ filters, onChange, videos }) {
  const values = (field, fallback = '') => [...new Set(videos.map((video) => video[field] || fallback).filter(Boolean))].sort();
  const set = (field) => (event) => onChange({ ...filters, [field]: event.target.value });
  return <div className="cm-filters cm-youtube-filters"><label>Canal<select aria-label="Canal" value={filters.owner || ''} onChange={set('owner')}><option value="">Todos</option>{values('owner_name').map((value) => <option key={value}>{value}</option>)}</select></label><label>De<input aria-label="Data inicial YouTube" type="date" value={filters.from || ''} onChange={set('from')} /></label><label>Até<input aria-label="Data final YouTube" type="date" value={filters.to || ''} onChange={set('to')} /></label><label>Tema<select aria-label="Tema do vídeo" value={filters.theme || ''} onChange={set('theme')}><option value="">Todos</option>{values('theme', 'Não classificado').map((value) => <option key={value}>{value}</option>)}</select></label><label className="cm-search"><span>Vídeo</span><div><Search size={14} /><input aria-label="Buscar vídeo" value={filters.search || ''} onChange={set('search')} placeholder="Título ou descrição" /></div></label></div>;
}

export function TopContentTable({ rows, metric = 'engagement_score', title = 'Top conteúdos' }) {
  return (
    <section className="cm-table-section">
      <div className="cm-section-heading"><div><span className="cm-eyebrow">Ranking</span><h2>{title}</h2></div><small>{rows.length} resultados</small></div>
      {!rows.length ? <div className="cm-empty">Nenhum conteúdo encontrado com os filtros atuais.</div> : (
        <div className="cm-table-wrap"><table className="cm-table">
          <thead><tr><th>#</th><th>Conteúdo</th><th>Autor</th><th>Formato</th><th>Likes</th><th>Comentários</th><th>Shares</th><th>{metric === 'comments' ? 'Comentários' : 'Score'}</th><th /></tr></thead>
          <tbody>{rows.map((row, index) => <tr key={row.external_post_id || row.id || index}>
            <td className="cm-rank">{String(index + 1).padStart(2, '0')}</td>
            <td><strong className="cm-hook">{row.hook || row.title || 'Sem título'}</strong><small>{row.published_at ? date.format(new Date(row.published_at)) : 'Data indisponível'}{row.cta_keyword ? ` · CTA ${row.cta_keyword}` : ''}</small></td>
            <td>{row.owner_name}</td>
            <td>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <span 
                  className="cm-tag"
                  style={{
                    background: (row.platform === 'youtube' || row.video_id) ? '#fee2e2' : '#e0e7ff',
                    color: (row.platform === 'youtube' || row.video_id) ? '#b91c1c' : '#4338ca',
                    fontWeight: 600
                  }}
                >
                  {(row.platform === 'youtube' || row.video_id) ? 'YouTube' : 'LinkedIn'}
                </span>
                <span className="cm-tag">{row.format || '—'}</span>
              </div>
            </td>
            <td>{integer.format(row.likes || 0)}</td><td>{integer.format(row.comments || 0)}</td><td>{integer.format(row.shares || 0)}</td>
            <td><strong>{integer.format(metric === 'comments' ? row.comments || 0 : row.engagement_score || 0)}</strong></td>
            <td>{row.post_url && <a className="cm-open" href={row.post_url} target="_blank" rel="noreferrer" aria-label={`Abrir ${row.hook || 'post'}`}><ExternalLink size={15} /></a>}</td>
          </tr>)}</tbody>
        </table></div>
      )}
    </section>
  );
}

export function YoutubeVideosTable({ rows, title = 'Vídeos monitorados' }) {
  return <section className="cm-table-section"><div className="cm-section-heading"><div><span className="cm-eyebrow">YouTube</span><h2>{title}</h2></div><small>{rows.length} vídeos</small></div>{!rows.length ? <div className="cm-empty">Nenhum vídeo coletado.</div> : <div className="cm-table-wrap"><table className="cm-table"><thead><tr><th>#</th><th>Vídeo</th><th>Canal</th><th>Views</th><th>Likes</th><th>Comentários</th><th>Engagement</th><th>Taxa</th><th /></tr></thead><tbody>{rows.map((row, index) => <tr key={row.video_id || row.id}><td className="cm-rank">{String(index + 1).padStart(2, '0')}</td><td><strong className="cm-hook">{row.title || 'Sem título'}</strong><small>{row.published_at ? date.format(new Date(row.published_at)) : 'Data indisponível'}</small></td><td>{row.owner_name}</td><td><strong>{integer.format(row.views || 0)}</strong></td><td>{integer.format(row.likes || 0)}</td><td>{integer.format(row.comments || 0)}</td><td>{integer.format(row.engagement_total || 0)}</td><td>{Number(row.engagement_rate || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%</td><td>{row.video_url && <a className="cm-open" href={row.video_url} target="_blank" rel="noreferrer" aria-label={`Abrir ${row.title || 'vídeo'}`}><ExternalLink size={15} /></a>}</td></tr>)}</tbody></table></div>}</section>;
}

export function OperationalPostsTable({ rows, onAction }) {
  return <section className="cm-table-section"><div className="cm-section-heading"><div><span className="cm-eyebrow">Operação</span><h2>Tabela operacional de posts</h2></div><small>{rows.length} posts</small></div>{!rows.length ? <div className="cm-empty">Nenhum post encontrado.</div> : <div className="cm-table-wrap"><table className="cm-table cm-operational-table"><thead><tr><th>Data</th><th>Autor / hook</th><th>Formato</th><th>Tema</th><th>CTA</th><th>Likes</th><th>Comentários</th><th>Shares</th><th>Score</th><th>Classificação</th><th>Ações</th></tr></thead><tbody>{rows.map((row) => <tr key={row.external_post_id || row.id}><td>{row.published_at ? date.format(new Date(row.published_at)) : '—'}</td><td><strong className="cm-hook">{row.hook || 'Sem hook'}</strong><small>{row.owner_name}</small></td><td><span className="cm-tag">{row.format || 'unknown'}</span></td><td>{row.theme || '—'}</td><td>{row.cta_keyword || '—'}</td><td>{integer.format(row.likes || 0)}</td><td>{integer.format(row.comments || 0)}</td><td>{integer.format(row.shares || 0)}</td><td><strong>{integer.format(row.engagement_score || 0)}</strong></td><td><StatusPill status={row.classification_status || 'pending'} /></td><td><div className="cm-row-actions"><button type="button" aria-label={`Editar classificação de ${row.hook || 'post'}`} title="Editar tema, CTA e formato" onClick={() => onAction?.('edit', row)}><Edit3 size={14} /></button><button type="button" aria-label={`Reclassificar ${row.hook || 'post'}`} title="Reclassificar com IA" onClick={() => onAction?.('classify', row)}><Sparkles size={14} /></button><button type="button" aria-label={`Histórico de métricas de ${row.hook || 'post'}`} title="Ver histórico de métricas" onClick={() => onAction?.('history', row)}><History size={14} /></button>{row.post_url && <a className="cm-open" href={row.post_url} target="_blank" rel="noreferrer" aria-label={`Abrir ${row.hook || 'post'}`}><ExternalLink size={14} /></a>}</div></td></tr>)}</tbody></table></div>}</section>;
}

export function StatusPill({ status }) {
  const normalized = status || 'pending';
  return <span className={`cm-status ${normalized}`}>{normalized === 'active' ? 'Ativa' : normalized === 'success' ? 'Sucesso' : normalized === 'partial' ? 'Parcial' : normalized === 'failed' || normalized === 'error' ? 'Erro' : normalized === 'paused' ? 'Pausada' : 'Pendente'}</span>;
}
