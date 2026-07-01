import React from 'react';
import {
  Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, LineChart,
  ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis,
} from 'recharts';

const compact = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });

function EmptyChart({ children = 'Sem dados para o período selecionado.' }) {
  return <div className="cm-empty-chart">{children}</div>;
}

export function ContentTrendChart({ data, metric = 'engagement' }) {
  if (!data.length) return <EmptyChart />;
  return (
    <div className="cm-chart" aria-label="Tendência mensal de conteúdo">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 10, left: -12, bottom: 0 }}>
          <CartesianGrid stroke="#e8edf2" strokeDasharray="3 6" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={24} />
          <YAxis tickFormatter={(value) => compact.format(value)} tick={{ fill: '#94a3b8', fontSize: 11 }} tickLine={false} axisLine={false} />
          <Tooltip formatter={(value) => Number(value).toLocaleString('pt-BR')} contentStyle={{ borderRadius: 10, borderColor: '#dbe3eb', fontSize: 12 }} />
          <Line type="monotone" dataKey={metric} name={metric === 'posts' ? 'Posts' : 'Engagement'} stroke="#0a66c2" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} animationDuration={500} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function WeeklyCadenceChart({ data, onWeekClick, selectedWeek }) {
  if (!data.length) return <EmptyChart />;
  return (
    <div className="cm-chart cm-chart-large" aria-label="Posts por semana por criador" style={{ position: 'relative' }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart 
          data={data} 
          margin={{ top: 12, right: 16, left: -10, bottom: 0 }}
          onClick={(state) => {
            if (state && state.activePayload && state.activePayload[0]) {
              const weekKey = state.activePayload[0].payload.week;
              const weekLabel = state.activePayload[0].payload.label;
              if (onWeekClick) {
                onWeekClick({ week: weekKey, label: weekLabel });
              }
            }
          }}
          style={{ cursor: 'pointer' }}
        >
          <CartesianGrid stroke="#e8edf2" strokeDasharray="3 6" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={20} />
          <YAxis allowDecimals={false} tick={{ fill: '#94a3b8', fontSize: 11 }} tickLine={false} axisLine={false} />
          <Tooltip formatter={(value) => Number(value).toLocaleString('pt-BR')} contentStyle={{ borderRadius: 10, borderColor: '#dbe3eb', fontSize: 12 }} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="Victor" fill="#0a66c2" radius={[4, 4, 0, 0]} />
          <Bar dataKey="Fernando" fill="#f59e0b" radius={[4, 4, 0, 0]} />
          <Line type="monotone" dataKey="Total" stroke="#111827" strokeWidth={2.5} strokeDasharray="4 4" dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CalendarHeatmapChart({ data, onDateClick, selectedDate }) {
  if (!data?.days?.length) return <EmptyChart />;
  const weekdays = ['', 'Seg', '', 'Qua', '', 'Sex', ''];
  return (
    <div className="cm-heatmap" aria-label="Tipo: calendário/heatmap estilo GitHub">
      <div className="cm-heatmap-summary">
        <strong>{data.totalPosts.toLocaleString('pt-BR')}</strong>
        <span>conteúdos em {data.activeDays.toLocaleString('pt-BR')} dias ativos</span>
      </div>
      <div className="cm-heatmap-scroll">
        <div className="cm-heatmap-months" style={{ gridTemplateColumns: `34px repeat(${data.weeks.length}, 13px)` }}>
          <span />
          {data.weeks.map((week, index) => {
            const month = data.months.find((item) => item.weekIndex === index);
            return <span key={week[0].date}>{month?.label || ''}</span>;
          })}
        </div>
        <div className="cm-heatmap-body">
          <div className="cm-heatmap-weekdays">{weekdays.map((label, index) => <span key={`${label}-${index}`}>{label}</span>)}</div>
          <div className="cm-heatmap-grid" style={{ gridTemplateColumns: `repeat(${data.weeks.length}, 13px)` }}>
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
          data={data} 
          margin={{ top: 8, right: 10, left: -12, bottom: 0 }}
          onClick={(state) => {
            if (state && state.activePayload && state.activePayload[0]) {
              const weekKey = state.activePayload[0].payload.week;
              const weekLabel = state.activePayload[0].payload.label;
              if (onWeekClick) {
                onWeekClick({ week: weekKey, label: weekLabel });
              }
            }
          }}
          style={{ cursor: 'pointer' }}
        >
          <CartesianGrid stroke="#e8edf2" strokeDasharray="3 6" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={24} />
          <YAxis tickFormatter={(value) => compact.format(value)} tick={{ fill: '#94a3b8', fontSize: 11 }} tickLine={false} axisLine={false} />
          <Tooltip formatter={(value) => Number(value).toLocaleString('pt-BR')} contentStyle={{ borderRadius: 10, borderColor: '#dbe3eb', fontSize: 12 }} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Line type="monotone" dataKey="engagement" name="Engagement" stroke="#0a66c2" strokeWidth={2.5} dot={false} />
          <Line type="monotone" dataKey="comments" name="Comentários" stroke="#f59e0b" strokeWidth={2.5} dot={false} />
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
          <Tooltip formatter={(value) => Number(value).toLocaleString('pt-BR')} contentStyle={{ borderRadius: 10, borderColor: '#dbe3eb', fontSize: 12 }} />
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

export function AccountGrowthChart({ data }) {
  if (!data.length) return null;
  const rows = [...data].sort((a, b) => String(a.metric_date).localeCompare(String(b.metric_date)));

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
    "Fernando Tedesco": "#f59e0b",
    "Seguidores": "#0a66c2",
    "subscribers": "#0a66c2"
  };

  const getStrokeColor = (key, index) => {
    if (colors[key]) return colors[key];
    const fallbackColors = ["#0a66c2", "#f59e0b", "#10b981", "#8b5cf6", "#ec4899"];
    return fallbackColors[index % fallbackColors.length];
  };

  return (
    <div className="cm-chart cm-chart-small" aria-label="Crescimento de inscritos e seguidores">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 8, right: 10, left: -12, bottom: 0 }}>
          <CartesianGrid stroke="#e8edf2" strokeDasharray="3 6" vertical={false} />
          <XAxis dataKey="metric_date" tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} />
          <YAxis tickFormatter={(value) => compact.format(value)} tick={{ fill: '#94a3b8', fontSize: 11 }} tickLine={false} axisLine={false} />
          <Tooltip formatter={(value) => Number(value).toLocaleString('pt-BR')} contentStyle={{ borderRadius: 10, borderColor: '#dbe3eb', fontSize: 12 }} />
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
              dot={false}
            />
          ))}

          {/* Render YouTube views if present in single-creator mode */}
          {rows.some(r => r.total_views !== undefined && r.total_views !== null) && (
            <Line type="monotone" dataKey="total_views" name="Views totais" stroke="#9cbfe0" strokeWidth={2} connectNulls dot={false} />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

