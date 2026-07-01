import React from 'react';
import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';

const compact = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });

export function ContentTrendChart({ data, metric = 'engagement' }) {
  if (!data.length) return <div className="cm-empty-chart">Sem dados para o período selecionado.</div>;
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

export function CreatorComparisonChart({ data }) {
  if (!data.length) return <div className="cm-empty-chart">Sem criadores no período.</div>;
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
  if (!rows.length) return <div className="cm-empty-chart">Sem dados classificados.</div>;
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
  return <div className="cm-chart cm-chart-small" aria-label="Crescimento de inscritos e seguidores"><ResponsiveContainer width="100%" height="100%"><LineChart data={rows} margin={{ top: 8, right: 10, left: -12, bottom: 0 }}><CartesianGrid stroke="#e8edf2" strokeDasharray="3 6" vertical={false} /><XAxis dataKey="metric_date" tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} /><YAxis tickFormatter={(value) => compact.format(value)} tick={{ fill: '#94a3b8', fontSize: 11 }} tickLine={false} axisLine={false} /><Tooltip formatter={(value) => Number(value).toLocaleString('pt-BR')} contentStyle={{ borderRadius: 10, borderColor: '#dbe3eb', fontSize: 12 }} /><Legend wrapperStyle={{ fontSize: 11 }} /><Line type="monotone" dataKey="subscribers" name="Inscritos" stroke="#0a66c2" strokeWidth={2.5} connectNulls /><Line type="monotone" dataKey="followers" name="Seguidores" stroke="#7aa7d7" strokeWidth={2.5} connectNulls /><Line type="monotone" dataKey="total_views" name="Views totais" stroke="#9cbfe0" strokeWidth={2} connectNulls /></LineChart></ResponsiveContainer></div>;
}
