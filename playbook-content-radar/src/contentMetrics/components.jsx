import React from 'react';
import { Edit3, ExternalLink, FileText, History, Image as ImageIcon, Info, Play, RefreshCw, Search, Sparkles, Video } from 'lucide-react';

const integer = new Intl.NumberFormat('pt-BR');
const date = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });

const getPlatformLabel = (row) => {
  if (row.platform === 'youtube' || row.video_id) return 'YouTube';
  if (row.platform === 'instagram' || row.shortcode) return 'Instagram';
  return 'LinkedIn';
};

const getPlatformStyle = (row) => {
  const label = getPlatformLabel(row);
  if (label === 'YouTube') return { background: '#fee2e2', color: '#b91c1c' };
  if (label === 'Instagram') return { background: '#fdf2f8', color: '#db2777' };
  return { background: '#e0e7ff', color: '#4338ca' };
};

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

export function ContentFilters({ filters, onChange, posts, compact = false, advanced = false, hideOwner = false, hideCta = false }) {
  const values = (field, fallback = '') => [...new Set(posts.map((post) => post[field] || fallback).filter(Boolean))].sort();
  const set = (field) => (event) => onChange({ ...filters, [field]: event.target.value });
  return (
    <div className={`cm-filters${compact ? ' compact' : ''}${advanced ? ' advanced' : ''}`}>
      {!hideOwner && <label>Pessoa<select aria-label="Pessoa" value={filters.owner || ''} onChange={set('owner')}><option value="">Todas</option>{values('owner_name').map((value) => <option key={value}>{value}</option>)}</select></label>}
      {!compact && <label>De<input aria-label="Data inicial" type="date" value={filters.from || ''} onChange={set('from')} /></label>}
      {!compact && <label>Até<input aria-label="Data final" type="date" value={filters.to || ''} onChange={set('to')} /></label>}
      <label>Formato<select aria-label="Formato" value={filters.format || ''} onChange={set('format')}><option value="">Todos</option>{values('format').map((value) => <option key={value}>{value}</option>)}</select></label>

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
                      ...getPlatformStyle(row),
                      fontWeight: 600
                    }}
                  >
                    {getPlatformLabel(row)}
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

// Célula dos números de prospecção: "—" enquanto o post nunca foi prospectado,
// spinner enquanto roda, e o número depois. dash pra manter a coluna estável.
function ProspectValue({ value, running }) {
  if (running) return <RefreshCw size={13} className="spin" />;
  if (value == null) return <span style={{ color: '#cbd5e1' }}>—</span>;
  return <strong>{integer.format(value)}</strong>;
}

// URL pública do post pra abrir no LinkedIn. Imports históricos não guardaram
// post_url, mas o id da activity basta pra reconstruir — espelho do buildScrapeUrl
// da edge function, pra TODO post ter o link de redirecionamento.
export function linkedinPostUrl(row) {
  if (row.post_url && String(row.post_url).includes('linkedin.com')) return String(row.post_url);
  for (const candidate of [row.external_post_id, row.entity_id, row.share_urn]) {
    const value = String(candidate || '').trim();
    if (!value) continue;
    if (/^\d{8,}$/.test(value)) return `https://www.linkedin.com/feed/update/urn:li:activity:${value}`;
    const urnMatch = value.match(/urn:li:(?:activity|ugcPost|share):\d+/i);
    if (urnMatch) return `https://www.linkedin.com/feed/update/${urnMatch[0]}`;
    const idMatch = value.match(/(?:activity|ugcPost|share)[-:](\d{8,})/i);
    if (idMatch) return `https://www.linkedin.com/feed/update/urn:li:activity:${idMatch[1]}`;
  }
  return null;
}

// Miniatura do post (identificação visual rápida). URLs do CDN do LinkedIn expiram,
// então no erro cai pro placeholder por formato.
function PostThumb({ row }) {
  const [failed, setFailed] = React.useState(false);
  if (!failed && row.media_url && row.media_type === 'image') {
    return <img className="cm-post-thumb" src={row.media_url} alt="" loading="lazy" onError={() => setFailed(true)} />;
  }
  if (!failed && row.media_url && row.media_type === 'video') {
    // preload="metadata" + #t=0.1 fazem o browser renderizar o primeiro frame como
    // prévia, sem baixar o vídeo inteiro nem tocar nada.
    return <video className="cm-post-thumb" src={`${row.media_url}#t=0.1`} muted playsInline preload="metadata" onError={() => setFailed(true)} />;
  }
  const Icon = row.format === 'video' || row.media_type === 'video' ? Video : row.format === 'text' ? FileText : ImageIcon;
  return <span className="cm-post-thumb-fallback"><Icon size={18} /></span>;
}

// Legenda dos números da prospecção (o "i" de informação pedido pelo Felipe).
// Segue o exemplo do Victor: 1000 comentários → 1000 leads → 300 já no banco →
// 700 novos → 50 dentro do ICP.
const prospectLegend = [
  ['Coment.', 'Total de comentários extraídos do post na última prospecção.'],
  ['Leads', 'Pessoas únicas que comentaram (a mesma pessoa comentando 2x conta 1).'],
  ['Já no banco', 'Dessas pessoas, quantas já existiam no banco (comentaram em outro post antes). Não viram lead duplicado — só registramos que comentaram aqui também.'],
  ['Novos', 'Pessoas novas cadastradas no banco NA ÚLTIMA VEZ que rodou este post. Se rodar de novo e ninguém novo comentou, este número vira 0 — é normal, não é bug.'],
  ['Aprovados ICP', 'Diferente de "Novos": este número NÃO é da última rodada, é o total acumulado — todos os leads que já nasceram deste post (em qualquer rodada) e passaram no ICP até agora. Por isso pode mostrar 6 aprovados mesmo com 0 novos. Fica "—" enquanto houver análise pendente desse post.'],
];

export function OperationalPostsTable({ rows, onAction, prospecting = {}, runningIds, onProspect, showProspecting = false }) {
  // Na Prospecção a ordem padrão é cronológica (post mais recente em cima) — o
  // Victor escolhe o post pelo que acabou de publicar, não pelo score.
  const [sortConfig, setSortConfig] = React.useState({ key: showProspecting ? 'published_at' : 'engagement_score', direction: 'desc' });
  const [showLegend, setShowLegend] = React.useState(false);
  const isRunning = (id) => Boolean(runningIds && runningIds.has(id));
  // Todo post do LinkedIn é prospectável: mesmo sem post_url, a função reconstrói a
  // URL a partir do id da activity. Só precisa do id da linha pra chamar a função.
  const canProspect = (row) => getPlatformLabel(row) === 'LinkedIn' && Boolean(row.id) && typeof onProspect === 'function';

  const sortedRows = React.useMemo(() => {
    const sortable = [...rows];
    if (!sortConfig.key) return sortable;
    
    sortable.sort((a, b) => {
      let aVal = a[sortConfig.key];
      let bVal = b[sortConfig.key];
      
      if (aVal == null) return sortConfig.direction === 'asc' ? 1 : -1;
      if (bVal == null) return sortConfig.direction === 'asc' ? -1 : 1;

      if (typeof aVal === 'string') {
        return sortConfig.direction === 'asc' 
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      } else {
        return sortConfig.direction === 'asc' 
          ? aVal - bVal
          : bVal - aVal;
      }
    });
    return sortable;
  }, [rows, sortConfig]);

  const requestSort = (key) => {
    let direction = 'desc';
    if (sortConfig.key === key && sortConfig.direction === 'desc') {
      direction = 'asc';
    }
    setSortConfig({ key, direction });
  };

  const getSortIcon = (key) => {
    if (sortConfig.key !== key) return ' ↕';
    return sortConfig.direction === 'asc' ? ' ▲' : ' ▼';
  };

  return (
    <section className="cm-table-section">
      <div className="cm-section-heading">
        <div>
          <span className="cm-eyebrow">{showProspecting ? 'Prospecção' : 'Operação'}</span>
          <h2 style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            {showProspecting ? 'Posts para prospectar' : 'Tabela operacional de posts'}
            {showProspecting && (
              <button type="button" onClick={() => setShowLegend((v) => !v)} aria-label="O que significa cada número"
                title="O que significa cada número"
                style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: '50%', border: '1px solid #cbd5e1', background: showLegend ? '#eff6ff' : '#fff', color: '#0a66c2', cursor: 'pointer', padding: 0 }}>
                <Info size={13} />
              </button>
            )}
          </h2>
        </div>
        <small>{rows.length} posts</small>
      </div>
      {showProspecting && showLegend && (
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px 16px', marginBottom: 14, fontSize: 12.5, color: '#475569' }}>
          <strong style={{ display: 'block', marginBottom: 6, color: '#0f172a' }}>O que significa cada número (exemplo: post com 1.000 comentários)</strong>
          {prospectLegend.map(([label, text]) => (
            <div key={label} style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
              <strong style={{ minWidth: 105, color: '#0a66c2' }}>{label}</strong>
              <span>{text}</span>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8 }}>
            <strong style={{ minWidth: 105, color: '#0a66c2' }}>Exemplo</strong>
            <span>1.000 comentários → 1.000 leads → 300 já no banco → 700 novos → 50 aprovados no ICP.</span>
          </div>
        </div>
      )}
      {!rows.length ? (
        <div className="cm-empty">Nenhum post encontrado.</div>
      ) : (
        <div className="cm-table-wrap">
          <table className="cm-table cm-operational-table">
            <thead>
              <tr>
                <th style={{ cursor: 'pointer', userSelect: 'none', minWidth: 112 }} onClick={() => requestSort('published_at')}>Data{getSortIcon('published_at')}</th>
                {showProspecting && <th aria-label="Mídia" />}
                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => requestSort('hook')}>Autor / hook{getSortIcon('hook')}</th>
                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => requestSort('format')}>Formato{getSortIcon('format')}</th>
                {!showProspecting && <>
                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => requestSort('theme')}>Tema{getSortIcon('theme')}</th>
                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => requestSort('cta_keyword')}>CTA{getSortIcon('cta_keyword')}</th>
                </>}
                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => requestSort('likes')}>Likes{getSortIcon('likes')}</th>
                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => requestSort('comments')}>Comentários{getSortIcon('comments')}</th>
                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => requestSort('shares')}>Shares{getSortIcon('shares')}</th>
                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => requestSort('engagement_score')}>Score{getSortIcon('engagement_score')}</th>
                {!showProspecting && <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => requestSort('classification_status')}>Classificação{getSortIcon('classification_status')}</th>}
                {showProspecting && <>
                  <th title="Status da última execução da prospecção deste post">Processo</th>
                  <th title={prospectLegend[0][1]}>Coment.</th>
                  <th title={prospectLegend[1][1]}>Leads</th>
                  <th title={prospectLegend[2][1]}>Já no banco</th>
                  <th title={prospectLegend[3][1]}>Novos</th>
                  <th title={prospectLegend[4][1]}>Aprovados ICP</th>
                </>}
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row) => (
                <tr key={row.external_post_id || row.id} className={isRunning(row.id) ? 'cm-prospect-running-row' : undefined}>
                  <td style={{ whiteSpace: 'nowrap' }}>{row.published_at ? date.format(new Date(row.published_at)) : '—'}</td>
                  {showProspecting && <td><PostThumb row={row} /></td>}
                  <td>
                    <strong className="cm-hook">{row.hook || 'Sem hook'}</strong>
                    <small>{row.owner_name}</small>
                  </td>
                  <td>
                    <span className="cm-tag">{row.format || 'unknown'}</span>
                  </td>
                  {!showProspecting && <>
                    <td>{row.theme || '—'}</td>
                    <td>{row.cta_keyword || '—'}</td>
                  </>}
                  <td>{integer.format(row.likes || 0)}</td>
                  <td>{integer.format(row.comments || 0)}</td>
                  <td>{integer.format(row.shares || 0)}</td>
                  <td>
                    <strong>{integer.format(row.engagement_score || 0)}</strong>
                  </td>
                  {!showProspecting && <td>
                    <StatusPill status={row.classification_status || 'pending'} />
                  </td>}
                  {showProspecting && <>
                    <td style={{ textAlign: 'center' }}>
                      {isRunning(row.id)
                        ? <span className="cm-scan-pill"><RefreshCw size={12} className="spin" /> Raspando…</span>
                        : prospecting[row.id]?.status
                          ? <StatusPill status={prospecting[row.id].status} />
                          : <span style={{ color: '#cbd5e1' }}>—</span>}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <ProspectValue value={prospecting[row.id]?.total_comments} running={isRunning(row.id)} />
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <ProspectValue value={prospecting[row.id]?.total_leads} running={isRunning(row.id)} />
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <ProspectValue
                        value={prospecting[row.id]?.total_leads != null && prospecting[row.id]?.opportunities != null
                          ? Math.max(0, prospecting[row.id].total_leads - prospecting[row.id].opportunities)
                          : null}
                        running={isRunning(row.id)}
                      />
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <ProspectValue value={prospecting[row.id]?.opportunities} running={isRunning(row.id)} />
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <ProspectValue value={prospecting[row.id]?.new_qualified} running={isRunning(row.id)} />
                    </td>
                  </>}
                  <td>
                    <div className="cm-row-actions">
                      {showProspecting ? (
                        <>
                          {canProspect(row) && (
                            <button
                              type="button"
                              className="cm-prospect-btn"
                              aria-label={`Prospectar comentaristas de ${row.hook || 'post'}`}
                              title="Raspar comentários e cruzar com o banco de leads"
                              disabled={isRunning(row.id)}
                              onClick={() => onProspect(row)}
                            >
                              {isRunning(row.id) ? <RefreshCw size={13} className="spin" /> : <Play size={13} />}
                              {isRunning(row.id) ? 'Rodando…' : 'Prospectar'}
                            </button>
                          )}
                          {linkedinPostUrl(row) && (
                            <a className="cm-open" href={linkedinPostUrl(row)} target="_blank" rel="noreferrer" aria-label={`Abrir ${row.hook || 'post'}`} title="Abrir post no LinkedIn">
                              <ExternalLink size={14} />
                            </a>
                          )}
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            aria-label={`Editar classificação de ${row.hook || 'post'}`}
                            title="Editar tema, CTA e formato"
                            onClick={() => onAction?.('edit', row)}
                          >
                            <Edit3 size={14} />
                          </button>
                          <button
                            type="button"
                            aria-label={`Reclassificar ${row.hook || 'post'}`}
                            title="Reclassificar com IA"
                            onClick={() => onAction?.('classify', row)}
                          >
                            <Sparkles size={14} />
                          </button>
                          <button
                            type="button"
                            aria-label={`Histórico de métricas de ${row.hook || 'post'}`}
                            title="Ver histórico de métricas"
                            onClick={() => onAction?.('history', row)}
                          >
                            <History size={14} />
                          </button>
                          {row.post_url && (
                            <a
                              className="cm-open"
                              href={row.post_url}
                              target="_blank"
                              rel="noreferrer"
                              aria-label={`Abrir ${row.hook || 'post'}`}
                            >
                              <ExternalLink size={14} />
                            </a>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function StatusPill({ status }) {
  const normalized = status || 'pending';
  return <span className={`cm-status ${normalized}`}>{normalized === 'active' ? 'Ativa' : normalized === 'success' ? 'Sucesso' : normalized === 'partial' ? 'Parcial' : normalized === 'failed' || normalized === 'error' ? 'Erro' : normalized === 'paused' ? 'Pausada' : 'Pendente'}</span>;
}
