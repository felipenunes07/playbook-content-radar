import React from 'react';
import {
  Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, LineChart,
  ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis,
} from 'recharts';

const compact = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });

function EmptyChart({ children = 'Sem dados para o período selecionado.' }) {
  return <div className="cm-empty-chart">{children}</div>;
}

export function ContentTrendChart({ data, metric = 'engagement', color = '#0a66c2', onPointClick }) {
  if (!data.length) return <EmptyChart />;
  return (
    <div className="cm-chart" aria-label="Tendência mensal de conteúdo">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 8, right: 10, left: -12, bottom: 0 }}
          onClick={(state) => {
            if (state && state.activeTooltipIndex !== undefined) {
              const payload = data[state.activeTooltipIndex];
              if (onPointClick && payload) {
                onPointClick(payload);
              }
            }
          }}
          style={{ cursor: onPointClick ? 'pointer' : 'default' }}
        >
          <CartesianGrid stroke="#e8edf2" strokeDasharray="3 6" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={24} />
          <YAxis tickFormatter={(value) => compact.format(value)} tick={{ fill: '#94a3b8', fontSize: 11 }} tickLine={false} axisLine={false} />
          <Tooltip formatter={(value) => Number(value).toLocaleString('pt-BR')} contentStyle={{ borderRadius: 10, borderColor: '#dbe3eb', fontSize: 12 }} />
          <Line type="monotone" dataKey={metric} name={metric === 'posts' ? 'Posts' : 'Engagement'} stroke={color} strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} animationDuration={500} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function WeeklyContentTypeChart({ data }) {
  if (!data.length) return <EmptyChart />;
  return (
    <div className="cm-chart cm-chart-large" aria-label="Publicações por semana por tipo de conteúdo">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 12, right: 16, left: -10, bottom: 0 }}>
          <CartesianGrid stroke="#e8edf2" strokeDasharray="3 6" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={56} interval="preserveStartEnd" tickMargin={8} />
          <YAxis allowDecimals={false} tick={{ fill: '#94a3b8', fontSize: 11 }} tickLine={false} axisLine={false} />
          <Tooltip itemSorter={(item) => -item.value} cursor={{ fill: '#f1f5f9', opacity: 0.55 }} formatter={(value) => Number(value).toLocaleString('pt-BR')} contentStyle={{ borderRadius: 10, borderColor: '#dbe3eb', fontSize: 12 }} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="feed" name="Reels + Publicações" stackId="tipo" fill="#0a66c2" />
          <Bar dataKey="stories" name="Stories" stackId="tipo" fill="#e1306c" />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function WeeklyCadenceChart({ data, onWeekClick, selectedWeek, periodLabel = 'semanas' }) {
  if (!data.length) return <EmptyChart />;
  const handleBarClick = (barData) => {
    if (onWeekClick && barData) {
      onWeekClick({ week: barData.week, label: barData.label, date: barData.date });
    }
  };
  const series = data.map((entry, index) => {
    const window = data.slice(Math.max(0, index - 3), index + 1);
    const media = window.reduce((sum, row) => sum + row.Total, 0) / window.length;
    return { ...entry, media: Math.round(media * 10) / 10 };
  });
  return (
    <div className="cm-chart cm-chart-large" aria-label="Posts por semana por criador" style={{ position: 'relative' }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          syncId="weekly-metrics"
          syncMethod="value"
          data={series}
          margin={{ top: 12, right: 16, left: -10, bottom: 0 }}
          barCategoryGap="28%"
          style={{ cursor: onWeekClick ? 'pointer' : 'default' }}
        >
          <CartesianGrid stroke="#e8edf2" strokeDasharray="3 6" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={56} interval="preserveStartEnd" tickMargin={8} />
          <YAxis allowDecimals={false} tick={{ fill: '#94a3b8', fontSize: 11 }} tickLine={false} axisLine={false} />
          <Tooltip itemSorter={(item) => -item.value} cursor={{ fill: '#f1f5f9', opacity: 0.55 }} formatter={(value) => Number(value).toLocaleString('pt-BR')} contentStyle={{ borderRadius: 10, borderColor: '#dbe3eb', fontSize: 12 }} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="Victor" stackId="cadence" fill="#0a66c2" onClick={handleBarClick} isAnimationActive={false}>
            {series.map((entry) => (
              <Cell key={entry.date || entry.week} fillOpacity={!selectedWeek || entry.week === selectedWeek ? 1 : 0.2} />
            ))}
          </Bar>
          <Bar dataKey="Fernando" stackId="cadence" fill="#93c5fd" onClick={handleBarClick} isAnimationActive={false}>
            {series.map((entry) => (
              <Cell key={entry.date || entry.week} fillOpacity={!selectedWeek || entry.week === selectedWeek ? 1 : 0.2} />
            ))}
          </Bar>
          <Line type="monotone" dataKey="media" name={`Média 4 ${periodLabel}`} stroke="#64748b" strokeWidth={2} dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CalendarHeatmapChart({ data, onDateClick, selectedDate, platform = 'all' }) {
  const scrollRef = React.useRef(null);
  const [cellSize, setCellSize] = React.useState(15);
  const weeksCount = data?.weeks?.length || 0;
  React.useEffect(() => {
    if (!scrollRef.current || !weeksCount) return undefined;
    const GAP = 4;
    const LABEL = 36; // coluna dos dias da semana (28) + gap do body (8)
    const fit = () => {
      if (!scrollRef.current) return;
      const size = Math.floor((scrollRef.current.clientWidth - LABEL + GAP) / weeksCount) - GAP;
      setCellSize(Math.max(11, Math.min(18, size)));
    };
    fit();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(fit);
    observer.observe(scrollRef.current);
    return () => observer.disconnect();
  }, [weeksCount]);
  if (!data?.days?.length) return <EmptyChart />;
  const weekdays = ['', 'Seg', '', 'Qua', '', 'Sex', ''];
  return (
    <div className={`cm-heatmap platform-${platform}`} style={{ '--hm-cell': `${cellSize}px` }} aria-label="Tipo: calendário/heatmap estilo GitHub">
      <div className="cm-heatmap-summary">
        <strong>{data.totalPosts.toLocaleString('pt-BR')}</strong>
        <span>conteúdos em {data.activeDays.toLocaleString('pt-BR')} dias ativos</span>
      </div>
      <div className="cm-heatmap-scroll" ref={scrollRef}>
        {/* 32px = largura dos dias (28) + gap do body (8) - gap desta grade (4), pra alinhar meses às semanas */}
        <div className="cm-heatmap-months" style={{ gridTemplateColumns: `32px repeat(${data.weeks.length}, var(--hm-cell))` }}>
          <span />
          {data.weeks.map((week, index) => {
            const month = data.months.find((item) => item.weekIndex === index);
            return <span key={week[0].date}>{month?.label || ''}</span>;
          })}
        </div>
        <div className="cm-heatmap-body">
          <div className="cm-heatmap-weekdays">{weekdays.map((label, index) => <span key={`${label}-${index}`}>{label}</span>)}</div>
          <div className="cm-heatmap-grid" style={{ gridTemplateColumns: `repeat(${data.weeks.length}, var(--hm-cell))` }}>
            {data.weeks.map((week) => (
              <div className="cm-heatmap-week" key={week[0].date}>
                {week.map((day) => {
                  const isSelected = selectedDate === day.date;
                  return (
                    <span 
                      key={day.date} 
                      className={`cm-heatmap-cell level-${day.level}`} 
                      title={day.label} 
                      aria-label={day.label} 
                      onClick={() => onDateClick && onDateClick({ date: day.date, label: day.label.split(' · ')[0] })}
                      style={{ 
                        cursor: 'pointer',
                        boxShadow: isSelected ? '0 0 0 2px #0f172a' : 'none',
                        transform: isSelected ? 'scale(1.2)' : 'none',
                        zIndex: isSelected ? 10 : 1,
                        transition: 'transform 0.15s ease, box-shadow 0.15s ease'
                      }}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="cm-heatmap-legend" aria-hidden="true"><span>Menos</span><i className="level-0" /><i className="level-1" /><i className="level-2" /><i className="level-3" /><i className="level-4" /><span>Mais</span></div>
    </div>
  );
}

export function WeeklyEngagementChart({ data, onWeekClick, selectedWeek }) {
  if (!data.length) return <EmptyChart />;
  return (
    <div className="cm-chart" aria-label="Engagement e comentários por semana">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart 
          syncId="weekly-metrics"
          syncMethod="value"
          data={data} 
          margin={{ top: 8, right: 10, left: -12, bottom: 0 }}
          onClick={(state) => {
            if (state && state.activeTooltipIndex !== undefined) {
              const payload = data[state.activeTooltipIndex];
              if (onWeekClick && payload) {
                onWeekClick({ week: payload.week, label: payload.label, date: payload.date });
              }
            }
          }}
          style={{ cursor: 'pointer' }}
        >
          <CartesianGrid stroke="#e8edf2" strokeDasharray="3 6" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={56} interval="preserveStartEnd" tickMargin={8} />
          <YAxis tickFormatter={(value) => compact.format(value)} tick={{ fill: '#94a3b8', fontSize: 11 }} tickLine={false} axisLine={false} />
          <Tooltip itemSorter={(item) => -item.value} formatter={(value) => Number(value).toLocaleString('pt-BR')} contentStyle={{ borderRadius: 10, borderColor: '#dbe3eb', fontSize: 12 }} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Line type="monotone" dataKey="engagement" name="Engagement" stroke="#0a66c2" strokeWidth={2.5} dot={false} />
          <Line type="monotone" dataKey="comments" name="Comentários" stroke="#93c5fd" strokeWidth={2.5} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function FrequencyResultScatter({ data }) {
  if (!data.length) return <EmptyChart />;
  return <div className="cm-chart" aria-label="Frequência versus resultado"><ResponsiveContainer width="100%" height="100%"><ScatterChart margin={{ top: 12, right: 16, left: -10, bottom: 0 }}><CartesianGrid stroke="#e8edf2" strokeDasharray="3 6" /><XAxis dataKey="Total" name="Posts" type="number" allowDecimals={false} tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} /><YAxis dataKey="averageEngagement" name="Engagement médio" tickFormatter={(value) => compact.format(value)} tick={{ fill: '#94a3b8', fontSize: 11 }} tickLine={false} axisLine={false} /><Tooltip formatter={(value, name) => [Number(value).toLocaleString('pt-BR'), name]} contentStyle={{ borderRadius: 10, borderColor: '#dbe3eb', fontSize: 12 }} /><Scatter name="Semanas" data={data} fill="#0a66c2" /></ScatterChart></ResponsiveContainer></div>;
}

export function CreatorComparisonChart({ data }) {
  if (!data.length) return <EmptyChart>Sem criadores no período.</EmptyChart>;
  return (
    <div className="cm-chart cm-chart-small" aria-label="Comparação entre criadores">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid stroke="#e8edf2" strokeDasharray="3 6" vertical={false} />
          <XAxis dataKey="owner" tickFormatter={(name) => name.split(' ')[0]} tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} />
          <YAxis tickFormatter={(value) => compact.format(value)} tick={{ fill: '#94a3b8', fontSize: 11 }} tickLine={false} axisLine={false} />
          <Tooltip cursor={{ fill: '#f1f5f9', opacity: 0.55 }} formatter={(value) => Number(value).toLocaleString('pt-BR')} contentStyle={{ borderRadius: 10, borderColor: '#dbe3eb', fontSize: 12 }} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="likes" name="Likes" fill="#0a66c2" radius={[4, 4, 0, 0]} />
          <Bar dataKey="comments" name="Comentários" fill="#7aa7d7" radius={[4, 4, 0, 0]} />
          <Bar dataKey="shares" name="Shares" fill="#c2d8ee" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function PerformanceBars({ rows, valueKey = 'engagement', label = 'Engagement' }) {
  const max = Math.max(...rows.map((row) => Number(row[valueKey]) || 0), 1);
  if (!rows.length) return <EmptyChart>Sem dados classificados.</EmptyChart>;
  return (
    <div className="cm-performance-list">
      {rows.slice(0, 8).map((row) => (
        <div className="cm-performance-row" key={row.key}>
          <div><span>{row.key}</span><strong>{Number(row[valueKey]).toLocaleString('pt-BR')}</strong></div>
          <div className="cm-performance-track"><span style={{ width: `${Math.max(3, (Number(row[valueKey]) / max) * 100)}%` }} /></div>
          <small>{row.posts} posts · {label}</small>
        </div>
      ))}
    </div>
  );
}

// Eixo Y colado nos dados (com uma folga), em vez de começar no zero. Com 20.965
// seguidores e uma faixa 0–22 mil, o ganho de 154 do mês vira uma linha reta.
export function paddedDomain(values, { includeZero = false } = {}) {
  const nums = values.filter((v) => v != null && Number.isFinite(Number(v))).map(Number);
  if (!nums.length) return [0, 1];
  let min = Math.min(...nums);
  let max = Math.max(...nums);
  if (includeZero) { min = Math.min(min, 0); max = Math.max(max, 0); }
  // Série constante: abre uma faixa artificial pra linha não colar na borda.
  if (min === max) return [min - 1, max + 1];
  const pad = Math.max(1, Math.round((max - min) * 0.12));
  return [min - pad, max + pad];
}

export function AccountGrowthChart({ data }) {
  // 'variation' = cada linha parte do zero (quanto cresceu no período). É o padrão
  // porque pessoas em patamares diferentes (20.9 mil vs 16.9 mil) num eixo absoluto
  // achatam a variação de cada uma. 'total' mostra o número cheio.
  const [mode, setMode] = React.useState('variation');
  if (!data.length) return null;
  const rows = [...data].sort((a, b) => String(a.metric_date).localeCompare(String(b.metric_date)));
  // Com poucos snapshots (coleta diária recém-ativada), linha sem marcador é invisível.
  const sparseDot = rows.length <= 30 ? { r: 3.5, strokeWidth: 0 } : false;

  // Identify all keys that represent lines (excluding date and views)
  const allKeys = new Set();
  rows.forEach(r => {
    Object.keys(r).forEach(k => {
      if (k !== 'metric_date' && k !== 'total_views' && k !== 'subscribers') {
        allKeys.add(k);
      }
    });
  });

  const lineKeys = Array.from(allKeys);

  // Define a curated list of colors matching our theme
  const colors = {
    "Victor Baggio": "#0a66c2",
    "Fernando Tedesco": "#93c5fd",
    "Seguidores": "#0a66c2",
    "subscribers": "#0a66c2"
  };

  const getStrokeColor = (key, index) => {
    if (colors[key]) return colors[key];
    const fallbackColors = ["#0a66c2", "#93c5fd", "#64748b", "#1e3a8a", "#bfdbfe"];
    return fallbackColors[index % fallbackColors.length];
  };

  const hasViews = rows.some(r => r.total_views !== undefined && r.total_views !== null);
  const seriesKeys = hasViews ? [...lineKeys, 'total_views'] : lineKeys;

  // No modo variação cada série vira "quanto cresceu desde a primeira coleta do
  // período", partindo de zero. Assim Victor e Fernando ficam comparáveis mesmo
  // estando em patamares de seguidores bem diferentes.
  const baseline = {};
  seriesKeys.forEach((key) => {
    const first = rows.find(r => r[key] != null);
    baseline[key] = first ? Number(first[key]) : 0;
  });

  const variationRows = rows.map((r) => {
    const out = { metric_date: r.metric_date };
    seriesKeys.forEach((key) => {
      if (r[key] != null) out[key] = Number(r[key]) - baseline[key];
    });
    return out;
  });

  const isVariation = mode === 'variation';
  const chartRows = isVariation ? variationRows : rows;
  const yDomain = paddedDomain(
    chartRows.flatMap((r) => seriesKeys.map((k) => r[k])),
    { includeZero: isVariation },
  );

  const formatValue = (value) => {
    const n = Number(value);
    const text = Math.abs(n).toLocaleString('pt-BR');
    if (!isVariation) return text;
    return n > 0 ? `+${text}` : n < 0 ? `−${text}` : '0';
  };

  return (
    <>
      <div className="cm-chart-toolbar">
        <span className="cm-chart-hint">
          {isVariation
            ? 'Quanto cada conta cresceu desde a primeira coleta do período.'
            : 'Número total de seguidores de cada conta.'}
        </span>
        <div className="cm-period-toggle" role="tablist" aria-label="Modo do gráfico de crescimento">
          <button type="button" role="tab" aria-selected={isVariation} className={isVariation ? 'active' : ''} onClick={() => setMode('variation')}>Variação</button>
          <button type="button" role="tab" aria-selected={!isVariation} className={!isVariation ? 'active' : ''} onClick={() => setMode('total')}>Total</button>
        </div>
      </div>
      <div className="cm-chart cm-chart-small" aria-label="Crescimento de inscritos e seguidores">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartRows} margin={{ top: 8, right: 10, left: -12, bottom: 0 }}>
            <CartesianGrid stroke="#e8edf2" strokeDasharray="3 6" vertical={false} />
            <XAxis dataKey="metric_date" tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} />
            <YAxis
              domain={yDomain}
              allowDecimals={false}
              tickFormatter={(value) => (isVariation && value > 0 ? `+${compact.format(value)}` : compact.format(value))}
              tick={{ fill: '#94a3b8', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip itemSorter={(item) => -item.value} formatter={formatValue} contentStyle={{ borderRadius: 10, borderColor: '#dbe3eb', fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />

            {/* Render dynamic follower/subscriber lines */}
            {lineKeys.map((key, index) => (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                name={key === 'subscribers' ? 'Inscritos' : key}
                stroke={getStrokeColor(key, index)}
                strokeWidth={2.5}
                connectNulls
                dot={sparseDot}
              />
            ))}

            {/* Render YouTube views if present in single-creator mode */}
            {hasViews && (
              <Line type="monotone" dataKey="total_views" name="Views totais" stroke="#9cbfe0" strokeWidth={2} connectNulls dot={sparseDot} />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}

const NETWORK_COLORS = { LinkedIn: '#0a66c2', YouTube: '#e52d27', Instagram: '#c13584' };

// Barras (não empilhadas, uma ao lado da outra) pra comparar o total de cada
// rede lado a lado — empilhado esconderia o tamanho real de cada uma. `syncId`
// igual ao de WeeklyCadenceChart/WeeklyEngagementChart sincroniza o hover/tooltip
// entre os gráficos quando os rótulos do eixo X (semana) coincidem.
export function NetworkFollowersChart({ data, onWeekClick, selectedWeek, selectedDate, period = 'daily' }) {
  if (!data.length) return null;

  // `data` já vem em deltas (quanto cresceu de uma coleta pra outra, somando
  // Victor + Fernando por rede) — nunca o total acumulado, que misturava as
  // duas pessoas num número só e confundia ("Victor não tem 37 mil no LinkedIn").
  const seriesKeys = Object.keys(NETWORK_COLORS).filter((key) => data.some((row) => row[key] != null));
  const yDomain = paddedDomain(data.flatMap((row) => seriesKeys.map((key) => row[key])), { includeZero: true });

  const formatValue = (value) => {
    const n = Number(value);
    const text = Math.abs(n).toLocaleString('pt-BR');
    return n > 0 ? `+${text}` : n < 0 ? `−${text}` : '0';
  };

  const handleBarClick = (barData) => {
    if (onWeekClick && barData) {
      onWeekClick({ week: barData.week, label: barData.label, date: barData.metric_date });
    }
  };

  return (
    <>
      <div className="cm-chart-toolbar">
        <span className="cm-chart-hint">Quanto cada rede cresceu (Victor + Fernando) de uma coleta pra outra.</span>
      </div>
      <div className="cm-chart cm-chart-small" aria-label="Seguidores por rede">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            syncId="weekly-metrics"
            syncMethod="value"
            data={data}
            margin={{ top: 8, right: 10, left: -12, bottom: 0 }}
            barCategoryGap="28%"
            barGap={4}
            style={{ cursor: onWeekClick ? 'pointer' : 'default' }}
          >
            <CartesianGrid stroke="#e8edf2" strokeDasharray="3 6" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={24} />
            <YAxis
              domain={yDomain}
              allowDecimals={false}
              tickFormatter={(value) => (value > 0 ? `+${compact.format(value)}` : compact.format(value))}
              tick={{ fill: '#94a3b8', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip itemSorter={(item) => -item.value} cursor={{ fill: '#f1f5f9', opacity: 0.55 }} formatter={formatValue} contentStyle={{ borderRadius: 10, borderColor: '#dbe3eb', fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {seriesKeys.map((key) => (
              <Bar key={key} dataKey={key} name={key} fill={NETWORK_COLORS[key]} radius={[4, 4, 0, 0]} isAnimationActive={false} onClick={handleBarClick}>
                {data.map((entry) => {
                  const isSelected = period === 'weekly'
                    ? (!selectedWeek || entry.week === selectedWeek)
                    : (!selectedDate || entry.metric_date === selectedDate);
                  return <Cell key={entry.metric_date || entry.week} fillOpacity={isSelected ? 1 : 0.2} />;
                })}
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}
