import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowUpRight, Check, CheckCircle2, ChevronDown, ChevronRight, Copy, Download, ExternalLink,
  Bot, CalendarDays, Eye, File, FileImage, FileText, Image, LayoutDashboard,
  Link2, Maximize2, MessageSquare, Minimize2, Minus, Palette, Paperclip, Plus,
  Save, Send, Sparkles, Target, ThumbsUp, Trash2, Upload, UserRound, Users, X,
  ZoomIn, ZoomOut,
} from 'lucide-react';
import './collaborativeStudio.css';
import { extractSourceMaterial } from './extractSourceMaterial.js';
import victorPhoto from '../assets/victor.png';

const nowIso = () => new Date().toISOString();
const uid = () => (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`);
const blankWorkspace = (idea, user) => ({
  copy_variants: [{ id: uid(), title: 'Versão principal', text: idea.finalPostText || '', status: 'draft', updatedBy: user, updatedAt: nowIso() }],
  selected_copy_id: null,
  attachments: [],
  source_materials: [],
  canvas_blocks: [],
  feedback: [],
  brief: { objective: '', audience: '', coreMessage: '', cta: '', notes: '', delivery: { tallyUrl: 'https://tally.so/', notionMaterialUrl: '', coverUrl: '', coverPath: '', materials: [] } },
  reference_links: [],
  creative_variants: [],
  selected_creative_id: null,
  approvals: [],
});

const humanSize = (bytes = 0) => bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
const shortDate = (value) => value ? new Date(value).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
const fileIcon = (type = '') => type.startsWith('image/') ? FileImage : type.includes('pdf') || type.includes('text') ? FileText : File;

function OriginalPost({ idea }) {
  return (
    <aside className="cs-original">
      <div className="cs-panel-heading">
        <div><span>Referência original</span><strong>Post completo</strong></div>
        {idea.linkedinUrl && <a href={idea.linkedinUrl} target="_blank" rel="noreferrer">Abrir original <ExternalLink size={13} /></a>}
      </div>
      <article className="cs-original-post">
        <header>
          <span className="cs-author-avatar">{idea.authorAvatar ? <img src={idea.authorAvatar} alt="" /> : (idea.sourceAuthor || 'A').slice(0, 1)}</span>
          <div><strong>{idea.sourceAuthor || 'Autor da referência'}</strong><span>{idea.authorHeadline || 'Conteúdo salvo no Radar'}</span><small>Referência editorial</small></div>
        </header>
        <div className="cs-original-text">{idea.summary || idea.title}</div>
        {idea.imageUrl && <img className="cs-original-media" src={idea.imageUrl} alt="Mídia do post original" />}
        <footer><span><ThumbsUp size={14} /> Referência aprovada pelo time</span></footer>
      </article>
      <div className="cs-angle">
        <span>Direção Playbook</span>
        <p>{idea.playbookAngle || 'Defina o ponto de vista próprio, a prova e o CTA no workspace ao lado.'}</p>
      </div>
    </aside>
  );
}

function OverviewPanel({ workspace, coverUploading, materialUploading, sourceUploading, onChangeDelivery, onUploadCover, onUploadMaterial, onRemoveMaterial, onUploadSource, onRemoveSource, onNavigate }) {
  const brief = workspace.brief || {};
  const delivery = { tallyUrl: 'https://tally.so/', notionMaterialUrl: '', coverUrl: '', coverPath: '', materials: [], ...(brief.delivery || {}) };
  const copyVariants = workspace.copy_variants || [];
  const creativeVariants = workspace.creative_variants || [];
  const selectedCopy = copyVariants.find((item) => item.id === workspace.selected_copy_id) || copyVariants[0];
  const approval = (workspace.approvals || []).slice().reverse().find((item) => item.decision === 'approved');
  const approved = Boolean(approval);
  const realTally = Boolean(delivery.tallyUrl && delivery.tallyUrl.replace(/\/$/, '') !== 'https://tally.so');
  const materialReady = Boolean(delivery.notionMaterialUrl || delivery.materials.length || workspace.attachments?.length || workspace.source_materials?.length);
  const stages = [
    { label: 'Referência e material', detail: `${(workspace.attachments?.length || 0) + (workspace.source_materials?.length || 0) + delivery.materials.length} arquivo(s)`, ready: materialReady, action: 'overview' },
    { label: 'Entrega ao aluno', detail: realTally || delivery.notionMaterialUrl ? 'Links configurados' : 'Configurar Tally/Notion', ready: realTally && materialReady, action: 'overview' },
    { label: 'Criativos', detail: `${creativeVariants.length} opção(ões)`, ready: creativeVariants.length > 0, action: 'creatives' },
    { label: 'Copy final', detail: selectedCopy?.text ? selectedCopy.title : 'Gerar depois do material', ready: Boolean(selectedCopy?.text), action: 'copies' },
    { label: 'Aprovação', detail: approved ? `Aprovado por ${approval.approver}` : 'Victor escolhe a combinação', ready: approved, action: 'preview' },
  ];
  const completed = stages.filter((item) => item.ready).length;
  const progress = Math.round((completed / stages.length) * 100);
  const nextAction = stages.find((item) => !item.ready);
  const contextCount = 1 + (workspace.attachments?.length || 0) + (workspace.source_materials?.length || 0) + delivery.materials.length + (delivery.notionMaterialUrl ? 1 : 0) + (realTally ? 1 : 0) + (delivery.coverUrl ? 1 : 0);
  return (
    <section className="cs-tab-panel cs-overview-panel">
      <header className="cs-overview-quiet-head">
        <div><span>Pacote editorial</span><h2>{approved ? 'Pronto para programar' : nextAction ? `Agora: ${nextAction.label}` : 'Revisar combinação final'}</h2><p>A copy fecha o processo depois que material, entrega e criativos estão definidos.</p></div>
        <div className="cs-overview-quiet-progress"><strong>{progress}%</strong><i><b style={{ width: `${progress}%` }} /></i><span>{completed}/{stages.length} etapas</span></div>
        <button type="button" onClick={() => onNavigate(approved ? 'preview' : (nextAction?.action || 'preview'))}>{approved ? 'Ver aprovação' : 'Abrir próxima etapa'} <ArrowUpRight size={14} /></button>
      </header>

      <div className="cs-overview-quiet-grid">
        <section className="cs-overview-context">
          <header><div><span>Base do conteúdo</span><strong>Material que a IA vai estudar</strong></div><em>{contextCount} fontes no contexto</em></header>
          <div className="cs-overview-context-fields">
            <label><span>Tally da entrega</span><div><input type="url" value={delivery.tallyUrl} onChange={(event) => onChangeDelivery('tallyUrl', event.target.value)} placeholder="https://tally.so/r/..." />{realTally && <a href={delivery.tallyUrl} target="_blank" rel="noreferrer"><ExternalLink size={12} /></a>}</div></label>
            <label><span>Material no Notion</span><div><input type="url" value={delivery.notionMaterialUrl} onChange={(event) => onChangeDelivery('notionMaterialUrl', event.target.value)} placeholder="Página pública entregue ao aluno" />{delivery.notionMaterialUrl && <a href={delivery.notionMaterialUrl} target="_blank" rel="noreferrer"><ExternalLink size={12} /></a>}</div></label>
          </div>
          <div className="cs-overview-context-actions">
            <label><input type="file" multiple accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.csv,.txt,.md,.zip" onChange={onUploadMaterial} /><Paperclip size={15} /><div><strong>{materialUploading ? 'Lendo arquivos...' : delivery.materials.length ? `${delivery.materials.length} material(is) do aluno` : 'Subir material do aluno'}</strong><span>PDF, DOCX, texto ou ZIP</span></div><Upload size={13} /></label>
            <label><input type="file" accept="image/*" onChange={onUploadCover} />{delivery.coverUrl ? <img src={delivery.coverUrl} alt="Capa da entrega" /> : <Image size={15} />}<div><strong>{coverUploading ? 'Enviando capa...' : delivery.coverUrl ? 'Capa adicionada' : 'Subir capa'}</strong><span>Usada no Notion e Tally</span></div><Upload size={13} /></label>
          </div>
          <section className="cs-reference-materials">
            <header><div><span>Material da referência</span><strong>Arquivos recebidos do autor do post</strong></div><label><input type="file" multiple accept="image/*,.pdf,.txt,.md,.csv,.json,.docx" onChange={onUploadSource} /><Upload size={13} /> {sourceUploading ? 'Lendo...' : 'Adicionar arquivos'}</label></header>
            <div>{(workspace.source_materials || []).map((material) => { const Icon = fileIcon(material.type); return <article key={material.id}><span>{material.type?.startsWith('image/') ? <img src={material.url} alt="" /> : <Icon size={15} />}</span><div><strong>{material.name}</strong><small>{material.extractionStatus === 'ready' ? 'Texto lido pela IA' : material.extractionStatus === 'visual' ? 'Imagem pronta para análise' : humanSize(material.size)}</small></div><a href={material.url} target="_blank" rel="noreferrer"><ExternalLink size={12} /></a><button type="button" onClick={() => onRemoveSource(material)}><Trash2 size={12} /></button></article>; })}{!(workspace.source_materials || []).length && <p>Suba aqui PDF, DOCX, texto ou imagem que veio junto do conteúdo original.</p>}</div>
          </section>
          {delivery.materials.length > 0 && <div className="cs-overview-context-files">{delivery.materials.map((material) => { const Icon = fileIcon(material.type); return <article key={material.id}><Icon size={14} /><div><strong>{material.name}</strong><span>{material.extractionStatus === 'ready' ? 'Conteúdo lido pela IA' : humanSize(material.size)}</span></div><a href={material.url} target="_blank" rel="noreferrer"><ExternalLink size={12} /></a><button type="button" onClick={() => onRemoveMaterial(material)}><Trash2 size={12} /></button></article>; })}</div>}
          <footer><Bot size={14} /><span>Na etapa de copy, a IA reúne automaticamente o original, estes materiais, Notion/Tally, criativos e anotações do workspace.</span></footer>
        </section>

        <aside className="cs-overview-flow">
          <header><span>Ordem de produção</span><strong>Do material até a aprovação</strong></header>
          <div>{stages.map((stage, index) => <button type="button" key={stage.label} className={stage.ready ? 'ready' : ''} onClick={() => onNavigate(stage.action)}><b>{String(index + 1).padStart(2, '0')}</b><span><strong>{stage.label}</strong><small>{stage.detail}</small></span>{stage.ready ? <Check size={14} /> : <ChevronRight size={14} />}</button>)}</div>
          <button type="button" className="cs-overview-preview-link" onClick={() => onNavigate('preview')}><Eye size={14} /> Abrir preview e decisão</button>
        </aside>
      </div>
    </section>
  );
}

function CopiesPanel({ variants, selectedId, contextCount, generating, onSelect, onChange, onAdd, onDuplicate, onDelete, onGenerate }) {
  const selected = variants.find((item) => item.id === selectedId) || variants[0];
  return (
    <section className="cs-tab-panel cs-copies-panel">
      <header className="cs-writer-command">
        <div className="cs-writer-identity"><span><Bot size={18} /></span><div><small>Última etapa • LinkedIn Writer</small><strong>Copy final baseada no pacote completo</strong><p>{contextCount} fontes reunidas automaticamente: original, material do aluno, links, arquivos, criativos e anotações.</p></div></div>
        <button type="button" onClick={onGenerate} disabled={generating}><Sparkles size={15} /> {generating ? 'Lendo o pacote e escrevendo...' : 'Gerar copy com IA'}</button>
      </header>
      <div className="cs-copy-desk">
          <nav className="cs-variant-rail">
            <header><div><span>Variações</span><strong>{variants.length} versões salvas</strong></div><button type="button" onClick={onAdd}><Plus size={14} /> Nova</button></header>
            <div>
              {variants.map((variant, index) => (
                <button type="button" key={variant.id} className={variant.id === selected?.id ? 'active' : ''} onClick={() => onSelect(variant.id)}>
                  <span>V{index + 1}</span><div><strong>{variant.title || `Variação ${index + 1}`}</strong><small>{variant.ai ? `${variant.ai.framework} • gerada por IA` : variant.text ? `${variant.text.length} caracteres` : 'Em branco'}</small></div><ChevronRight size={13} />
                </button>
              ))}
            </div>
          </nav>
          {selected && (
            <div className={`cs-copy-editor ${selected.ai ? 'has-ai-rationale' : ''}`}>
              <div className="cs-copy-toolbar">
                <input value={selected.title} onChange={(event) => onChange(selected.id, { title: event.target.value })} aria-label="Nome da variação" />
                <div><button type="button" onClick={() => onDuplicate(selected)} title="Duplicar"><Copy size={14} /></button>{variants.length > 1 && <button type="button" onClick={() => onDelete(selected.id)} title="Excluir"><Trash2 size={14} /></button>}</div>
              </div>
              {selected.ai && <div className="cs-ai-rationale"><div><span>Outcome</span><strong>{selected.ai.outcome}</strong></div><div><span>Estrutura</span><strong>{selected.ai.framework}</strong></div><div><span>Hook escolhido</span><strong>{selected.ai.hook}</strong></div></div>}
              <textarea value={selected.text} onChange={(event) => onChange(selected.id, { text: event.target.value })} placeholder="A versão gerada aparecerá aqui. Victor e Fernando podem revisar e editar livremente." />
              <footer><span>Editado por {selected.updatedBy || 'Time'} • {shortDate(selected.updatedAt)}</span><strong>{selected.text.length} caracteres</strong></footer>
            </div>
          )}
      </div>
    </section>
  );
}

function MaterialsPanel({ attachments, uploading, onUpload, onRemove, onCanvas }) {
  return (
    <section className="cs-tab-panel cs-materials-panel">
      <label className="cs-dropzone">
        <input type="file" multiple onChange={onUpload} accept="image/*,.pdf,.txt,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.csv,video/mp4" />
        <Upload size={22} /><strong>{uploading ? 'Enviando materiais...' : 'Adicionar arquivos e imagens'}</strong><span>Imagens, PDF, documentos, planilhas ou vídeo de até 25 MB.</span>
      </label>
      <div className="cs-assets-list">
        {attachments.map((asset) => {
          const Icon = fileIcon(asset.type);
          return (
            <article key={asset.id}>
              <span className="cs-asset-preview">{asset.type?.startsWith('image/') ? <img src={asset.url} alt="" /> : <Icon size={20} />}</span>
              <div><strong>{asset.name}</strong><span>{humanSize(asset.size)} · enviado por {asset.uploadedBy}</span></div>
              <div className="cs-asset-actions">{asset.type?.startsWith('image/') && <button type="button" onClick={() => onCanvas(asset)} title="Levar ao canvas"><LayoutDashboard size={14} /></button>}<a href={asset.url} target="_blank" rel="noreferrer" title="Abrir"><ArrowUpRight size={14} /></a><button type="button" onClick={() => onRemove(asset)} title="Remover"><Trash2 size={14} /></button></div>
            </article>
          );
        })}
        {!attachments.length && <div className="cs-empty-state"><Paperclip size={20} /><strong>Nenhum material anexado</strong><span>Jogue aqui resultados, prints, criativos, documentos e provas.</span></div>}
      </div>
    </section>
  );
}

function CreativesPanel({ creatives, selectedId, uploading, onSelect, onUpload, onChange, onRemove }) {
  return (
    <section className="cs-tab-panel cs-creatives-panel">
      <div className="cs-creatives-head">
          <div><Palette size={17} /><div><strong>Opções de criativo</strong><span>{creatives.length}/5 opções · selecione a melhor para o Victor avaliar no preview.</span></div></div>
          <div><label><input type="file" multiple accept="image/*" onChange={onUpload} /><Upload size={14} /> {uploading ? 'Enviando...' : 'Subir imagens'}</label></div>
        </div>
      <div className="cs-creative-grid">
        {creatives.map((creative, index) => (
          <article key={creative.id} role="button" tabIndex={0} className={creative.id === selectedId ? 'selected' : ''} onClick={() => onSelect(creative.id)} onKeyDown={(event) => { if (event.key === 'Enter') onSelect(creative.id); }}>
            <div className="cs-creative-image"><img src={creative.imageUrl} alt={creative.title || `Criativo ${index + 1}`} /><span>Opção {index + 1}</span>{creative.id === selectedId && <em><Check size={12} /> selecionado</em>}</div>
            <div className="cs-creative-fields"><input value={creative.title || ''} onClick={(event) => event.stopPropagation()} onChange={(event) => onChange(creative.id, { title: event.target.value })} placeholder={`Criativo ${index + 1}`} /><textarea value={creative.description || ''} onClick={(event) => event.stopPropagation()} onChange={(event) => onChange(creative.id, { description: event.target.value })} placeholder="Explique a ideia visual, headline ou orientação para o designer." /><button type="button" className={creative.id === selectedId ? 'cs-choose-creative selected' : 'cs-choose-creative'} onClick={(event) => { event.stopPropagation(); onSelect(creative.id); }}>{creative.id === selectedId ? <><Check size={13} /> Escolhido para o preview</> : <>Selecionar esta opção <ArrowUpRight size={13} /></>}</button></div>
            <footer><span>por {creative.createdBy || 'Time'}</span><button type="button" onClick={(event) => { event.stopPropagation(); onRemove(creative); }}><Trash2 size={13} /></button></footer>
          </article>
        ))}
        {!creatives.length && <div className="cs-empty-state cs-creative-empty"><Palette size={22} /><strong>Nenhum criativo preparado</strong><span>Suba imagens prontas ou cole URLs para montar as opções de escolha.</span></div>}
      </div>
    </section>
  );
}

function LinkedInPreview({ idea, workspace, currentUser, onSelectCopy, onSelectCreative, onApprove, onSchedule }) {
  const variants = workspace.copy_variants || [];
  const creatives = workspace.creative_variants || [];
  const copyId = workspace.selected_copy_id || variants[0]?.id || '';
  const creativeId = workspace.selected_creative_id || creatives[0]?.id || '';
  const copy = variants.find((item) => item.id === copyId);
  const creative = creatives.find((item) => item.id === creativeId);
  const approvals = workspace.approvals || [];
  const approved = approvals.slice().reverse().find((item) => item.decision === 'approved');
  return (
    <section className="cs-tab-panel cs-preview-panel">
      <div className="cs-decision-bar">
        <div><Eye size={16} /><div><strong>Central de decisão</strong><span>Combine uma copy e um criativo para visualizar exatamente o que será publicado.</span></div></div>
        <div className="cs-combination-selectors"><label><span>Copy</span><select value={copyId} onChange={(event) => onSelectCopy(event.target.value)}>{variants.map((item, index) => <option key={item.id} value={item.id}>V{index + 1} — {item.title}</option>)}</select></label><span>+</span><label><span>Criativo</span><select value={creativeId} onChange={(event) => onSelectCreative(event.target.value)}><option value="">Sem criativo</option>{creatives.map((item, index) => <option key={item.id} value={item.id}>C{index + 1} — {item.title || `Criativo ${index + 1}`}</option>)}</select></label></div>
      </div>
      <div className="cs-preview-layout">
        <div className="cs-linkedin-stage">
          <article className="cs-linkedin-card">
            <header><span className="cs-linkedin-avatar"><img src={victorPhoto} alt="Victor Baggio" /></span><div><strong>Victor Baggio</strong><span>Founder da Playbook Lab · 2º</span><small>Agora · 🌐</small></div><b>•••</b></header>
            <div className="cs-linkedin-copy">{copy?.text || 'Selecione ou escreva uma variação de copy para visualizar o post completo aqui.'}</div>
            {creative?.imageUrl && <img src={creative.imageUrl} alt={creative.title || 'Criativo selecionado'} />}
            <div className="cs-linkedin-reactions"><span>👍💡❤️ 126</span><span>18 comentários · 7 compartilhamentos</span></div>
            <footer><button type="button"><ThumbsUp size={14} /> Gostei</button><button type="button"><MessageSquare size={14} /> Comentar</button><button type="button"><Send size={14} /> Compartilhar</button></footer>
          </article>
        </div>
        <aside className="cs-approval-panel">
          <div className={`cs-approval-status ${approved ? 'approved' : ''}`}>{approved ? <CheckCircle2 size={19} /> : <UserRound size={19} />}<div><strong>{approved ? 'Combinação aprovada' : 'Aguardando decisão final'}</strong><span>{approved ? `${approved.approver} aprovou em ${shortDate(approved.createdAt)}` : 'Victor escolhe a copy e o criativo que devem ser publicados.'}</span></div></div>
          <div className="cs-decision-options">
            <section><header><span>1</span><div><strong>Escolha a copy</strong><small>{variants.length} versão(ões)</small></div></header><div>{variants.map((item, index) => <button type="button" key={item.id} className={item.id === copyId ? 'selected' : ''} onClick={() => onSelectCopy(item.id)}><b>V{index + 1}</b><span><strong>{item.title || `Versão ${index + 1}`}</strong><small>{item.text ? `${item.text.length} caracteres` : 'Em branco'}</small></span>{item.id === copyId && <Check size={13} />}</button>)}</div></section>
            <section><header><span>2</span><div><strong>Escolha o criativo</strong><small>{creatives.length} opção(ões)</small></div></header><div className="cs-decision-creative-list"><button type="button" className={!creativeId ? 'selected' : ''} onClick={() => onSelectCreative('')}><b>—</b><span><strong>Sem criativo</strong><small>Publicar somente texto</small></span>{!creativeId && <Check size={13} />}</button>{creatives.map((item, index) => <button type="button" key={item.id} className={item.id === creativeId ? 'selected' : ''} onClick={() => onSelectCreative(item.id)}>{item.imageUrl ? <img src={item.imageUrl} alt="" /> : <b>C{index + 1}</b>}<span><strong>{item.title || `Criativo ${index + 1}`}</strong><small>{item.description || 'Imagem pronta para o post'}</small></span>{item.id === creativeId && <Check size={13} />}</button>)}</div></section>
          </div>
          <div className="cs-selection-summary"><span>Combinação escolhida</span><strong>{copy?.title || 'Nenhuma copy'}</strong><strong>{creative?.title || 'Sem criativo selecionado'}</strong></div>
          <button type="button" className="cs-approve-button" disabled={!copy} onClick={() => onApprove(copy, creative)}><CheckCircle2 size={15} /> {currentUser === 'Victor' ? 'Aprovar esta combinação' : 'Sugerir esta combinação ao Victor'}</button>
          {approved && <button type="button" className="cs-schedule-button" onClick={onSchedule}><CalendarDays size={15} /> Programar publicação</button>}
          <div className="cs-decision-history"><span>Decisões e sugestões</span>{approvals.slice().reverse().map((item) => <article key={item.id}><strong>{item.approver}</strong><span>{item.decision === 'approved' ? 'aprovou' : 'sugeriu'} {item.copyTitle}{item.creativeTitle ? ` + ${item.creativeTitle}` : ''}</span><small>{shortDate(item.createdAt)}</small></article>)}{!approvals.length && <p>Nenhuma decisão registrada ainda.</p>}</div>
        </aside>
      </div>
    </section>
  );
}

function InfiniteCanvas({ blocks, setBlocks, attachments }) {
  const [zoom, setZoom] = useState(1);
  const addNote = () => setBlocks((current) => [...current, { id: uid(), type: 'note', x: 120 + current.length * 28, y: 100 + current.length * 24, w: 250, h: 150, content: 'Nova anotação', color: 'yellow' }]);
  const addText = () => setBlocks((current) => [...current, { id: uid(), type: 'text', x: 180 + current.length * 24, y: 180 + current.length * 20, w: 320, h: 130, content: 'Novo bloco de texto' }]);
  const update = (id, patch) => setBlocks((current) => current.map((block) => block.id === id ? { ...block, ...patch } : block));
  const remove = (id) => setBlocks((current) => current.filter((block) => block.id !== id));
  return (
    <section className="cs-tab-panel cs-canvas-panel">
      <div className="cs-canvas-toolbar"><div><button type="button" onClick={addNote}><Plus size={14} /> Nota</button><button type="button" onClick={addText}><FileText size={14} /> Texto</button></div><div><button type="button" aria-label="Diminuir zoom" onClick={() => setZoom((value) => Math.max(.55, value - .1))}><ZoomOut size={14} /></button><span>{Math.round(zoom * 100)}%</span><button type="button" aria-label="Aumentar zoom" onClick={() => setZoom((value) => Math.min(1.5, value + .1))}><ZoomIn size={14} /></button></div></div>
      <div className="cs-canvas-viewport">
        <div className="cs-canvas-world" style={{ transform: `scale(${zoom})` }}>
          {blocks.map((block) => (
            <motion.article
              drag dragMomentum={false} key={block.id} className={`cs-canvas-block ${block.type}`}
              style={{ left: block.x, top: block.y, width: block.w, minHeight: block.h }}
              onDragEnd={(_, info) => update(block.id, { x: Math.max(0, block.x + info.offset.x / zoom), y: Math.max(0, block.y + info.offset.y / zoom) })}
            >
              <button type="button" className="cs-block-remove" aria-label="Remover bloco" onClick={() => remove(block.id)}><X size={12} /></button>
              {block.type === 'image' ? <img src={block.url} alt={block.content || 'Material'} /> : <textarea value={block.content} onPointerDown={(event) => event.stopPropagation()} onChange={(event) => update(block.id, { content: event.target.value })} />}
            </motion.article>
          ))}
          {!blocks.length && <div className="cs-canvas-hint"><LayoutDashboard size={24} /><strong>Canvas livre</strong><span>Adicione notas, textos ou envie imagens em Materiais para organizar o desenvolvimento visualmente.</span></div>}
        </div>
      </div>
    </section>
  );
}

function FeedbackPanel({ feedback, currentUser, onAdd }) {
  const [message, setMessage] = useState('');
  const [reaction, setReaction] = useState('comment');
  const submit = () => { if (!message.trim()) return; onAdd({ id: uid(), author: currentUser, message: message.trim(), reaction, createdAt: nowIso() }); setMessage(''); };
  return (
    <section className="cs-tab-panel cs-feedback-panel">
      <div className="cs-feedback-compose">
        <div className="cs-reaction-picker">{[['comment', 'Comentar'], ['liked', 'Gostei'], ['adjust', 'Pedir ajuste'], ['approved', 'Aprovar']].map(([key, label]) => <button type="button" key={key} className={reaction === key ? 'active' : ''} onClick={() => setReaction(key)}>{key === 'approved' && <Check size={12} />}{label}</button>)}</div>
        <textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder={`Escreva o feedback de ${currentUser} para o time...`} />
        <button type="button" onClick={submit}>Publicar feedback</button>
      </div>
      <div className="cs-feedback-stream">
        {feedback.slice().reverse().map((item) => <article key={item.id}><span className="cs-feedback-avatar">{item.author?.slice(0, 1)}</span><div><header><strong>{item.author}</strong><span>{shortDate(item.createdAt)}</span><em className={item.reaction}>{item.reaction === 'liked' ? 'Gostei' : item.reaction === 'adjust' ? 'Pedir ajuste' : item.reaction === 'approved' ? 'Aprovado' : 'Comentário'}</em></header><p>{item.message}</p></div></article>)}
        {!feedback.length && <div className="cs-empty-state"><MessageSquare size={20} /><strong>Revisão compartilhada</strong><span>Victor, Fernando e Felipe podem comentar, pedir ajustes e aprovar.</span></div>}
      </div>
    </section>
  );
}

export default function CollaborativeStudioModal({ idea, currentUser, client, onClose, onSchedule, updateState, addToast }) {
  const initial = useMemo(() => blankWorkspace(idea, currentUser), [idea, currentUser]);
  const [workspace, setWorkspace] = useState(initial);
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [coverUploading, setCoverUploading] = useState(false);
  const [materialUploading, setMaterialUploading] = useState(false);
  const [sourceUploading, setSourceUploading] = useState(false);
  const [generatingCopy, setGeneratingCopy] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;

  const variants = workspace.copy_variants?.length ? workspace.copy_variants : initial.copy_variants;
  const selectedId = workspace.selected_copy_id || variants[0]?.id;
  const selectedVariant = variants.find((item) => item.id === selectedId) || variants[0];

  const updateWorkspace = (updater) => { setWorkspace((current) => typeof updater === 'function' ? updater(current) : { ...current, ...updater }); setDirty(true); };

  useEffect(() => {
    let active = true;
    client.from('idea_development_workspaces').select('*').eq('idea_id', idea.id).maybeSingle().then(({ data, error }) => {
      if (!active) return;
      if (data) setWorkspace({ ...initial, ...data });
      if (error && error.code !== 'PGRST116' && error.code !== '42P01') console.error('Development workspace load:', error);
      setLoading(false);
    });
    const channel = client.channel(`idea-workspace-${idea.id}`).on('postgres_changes', { event: '*', schema: 'public', table: 'idea_development_workspaces', filter: `idea_id=eq.${idea.id}` }, (payload) => {
      if (!dirtyRef.current && payload.new?.idea_id) setWorkspace((current) => ({ ...current, ...payload.new }));
    }).subscribe();
    return () => { active = false; client.removeChannel(channel); };
  }, [client, idea.id, initial]);

  const saveWorkspace = async (closeAfter = false, workspaceOverride = null) => {
    setSaving(true);
    const source = workspaceOverride || workspace;
    const sourceVariants = source.copy_variants?.length ? source.copy_variants : variants;
    const sourceSelectedId = source.selected_copy_id || sourceVariants[0]?.id;
    const sourceSelectedVariant = sourceVariants.find((item) => item.id === sourceSelectedId) || sourceVariants[0];
    const payload = {
      idea_id: idea.id,
      copy_variants: sourceVariants,
      selected_copy_id: sourceSelectedId,
      attachments: source.attachments || [],
      source_materials: source.source_materials || [],
      canvas_blocks: source.canvas_blocks || [],
      feedback: source.feedback || [],
      brief: source.brief || {},
      reference_links: source.reference_links || [],
      creative_variants: source.creative_variants || [],
      selected_creative_id: source.selected_creative_id || null,
      approvals: source.approvals || [],
      updated_by: currentUser,
      updated_at: nowIso(),
    };
    const { error } = await client.from('idea_development_workspaces').upsert(payload, { onConflict: 'idea_id' });
    if (error) {
      console.error('Development workspace save:', error);
      addToast('O workspace ficou salvo nesta sessão, mas a migration do Supabase ainda precisa ser aplicada.', 'error');
    } else {
      setDirty(false);
      updateState((previous) => ({ ...previous, ideas: previous.ideas.map((item) => item.id === idea.id ? { ...item, finalPostText: sourceSelectedVariant?.text || '', manualStatus: 'em_producao' } : item) }));
      addToast('Workspace colaborativo salvo para todo o time.', 'success');
      if (closeAfter) onClose();
    }
    setSaving(false);
  };

  const changeVariant = (id, patch) => updateWorkspace((current) => ({ ...current, copy_variants: variants.map((item) => item.id === id ? { ...item, ...patch, updatedBy: currentUser, updatedAt: nowIso() } : item) }));
  const addVariant = () => { const item = { id: uid(), title: `Variação ${variants.length + 1}`, text: '', status: 'draft', updatedBy: currentUser, updatedAt: nowIso() }; updateWorkspace((current) => ({ ...current, copy_variants: [...variants, item], selected_copy_id: item.id })); };
  const duplicateVariant = (source) => { const item = { ...source, id: uid(), title: `${source.title} — cópia`, updatedBy: currentUser, updatedAt: nowIso() }; updateWorkspace((current) => ({ ...current, copy_variants: [...variants, item], selected_copy_id: item.id })); };
  const deleteVariant = (id) => updateWorkspace((current) => ({ ...current, copy_variants: variants.filter((item) => item.id !== id), selected_copy_id: variants.find((item) => item.id !== id)?.id }));

  const uploadFiles = async (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    setUploading(true);
    const added = [];
    for (const file of files) {
      if (file.size > 25 * 1024 * 1024) { addToast(`${file.name} ultrapassa 25 MB.`, 'error'); continue; }
      const extraction = await extractSourceMaterial(file);
      const safeName = file.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '-');
      const path = `${idea.id}/${Date.now()}-${uid().slice(0, 8)}-${safeName}`;
      const { error } = await client.storage.from('content-production').upload(path, file, { contentType: file.type || undefined, upsert: false });
      if (error) { addToast(`Falha ao enviar ${file.name}. Verifique a migration do Storage.`, 'error'); continue; }
      const { data } = client.storage.from('content-production').getPublicUrl(path);
      added.push({ id: uid(), name: file.name, path, url: data.publicUrl, type: file.type, size: file.size, uploadedBy: currentUser, createdAt: nowIso(), ...extraction });
    }
    if (added.length) updateWorkspace((current) => ({ ...current, attachments: [...(current.attachments || []), ...added] }));
    event.target.value = '';
    setUploading(false);
  };

  const addAssetToCanvas = (asset) => { updateWorkspace((current) => ({ ...current, canvas_blocks: [...(current.canvas_blocks || []), { id: uid(), type: 'image', x: 140 + (current.canvas_blocks?.length || 0) * 30, y: 110 + (current.canvas_blocks?.length || 0) * 25, w: 320, h: 220, url: asset.url, content: asset.name }] })); setActiveTab('canvas'); };
  const removeAttachment = async (asset) => {
    if (asset.path) {
      const { error } = await client.storage.from('content-production').remove([asset.path]);
      if (error) { addToast(`Não foi possível remover ${asset.name} do armazenamento.`, 'error'); return; }
    }
    updateWorkspace((current) => ({ ...current, attachments: (current.attachments || []).filter((item) => item.id !== asset.id) }));
  };

  const uploadSourceFiles = async (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    setSourceUploading(true);
    const added = [];
    for (const file of files) {
      if (file.size > 25 * 1024 * 1024) { addToast(`${file.name} ultrapassa 25 MB.`, 'error'); continue; }
      const extraction = await extractSourceMaterial(file);
      const safeName = file.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '-');
      const path = `${idea.id}/sources/${Date.now()}-${uid().slice(0, 8)}-${safeName}`;
      const { error } = await client.storage.from('content-production').upload(path, file, { contentType: file.type || undefined, upsert: false });
      if (error) { addToast(`Não foi possível enviar ${file.name}.`, 'error'); continue; }
      const { data } = client.storage.from('content-production').getPublicUrl(path);
      added.push({ id: uid(), name: file.name, path, url: data.publicUrl, type: file.type, size: file.size, uploadedBy: currentUser, createdAt: nowIso(), ...extraction });
    }
    if (added.length) {
      updateWorkspace((current) => ({ ...current, source_materials: [...(current.source_materials || []), ...added] }));
      addToast(`${added.length} material(is) da referência adicionado(s).`, 'success');
    }
    event.target.value = '';
    setSourceUploading(false);
  };

  const removeSourceMaterial = async (material) => {
    if (material.path) {
      const { error } = await client.storage.from('content-production').remove([material.path]);
      if (error) { addToast(`Não foi possível excluir ${material.name}.`, 'error'); return; }
    }
    updateWorkspace((current) => ({ ...current, source_materials: (current.source_materials || []).filter((item) => item.id !== material.id) }));
  };

  const generateFirstCopy = async () => {
    setGeneratingCopy(true);
    try {
      const delivery = workspace.brief?.delivery || {};
      const contextMaterials = [
        ...(workspace.source_materials || []),
        ...(workspace.attachments || []),
        ...(delivery.materials || []),
        ...(idea.imageUrl ? [{ name: 'Imagem do post original', type: 'image/jpeg', url: idea.imageUrl }] : []),
        ...(delivery.coverUrl ? [{ name: 'Capa da entrega', type: 'image/jpeg', url: delivery.coverUrl }] : []),
        ...(workspace.creative_variants || []).map((creative) => ({ name: creative.title || 'Criativo', type: 'image/jpeg', url: creative.imageUrl, extractedText: creative.description || '' })),
      ];
      const contextUrls = [
        delivery.notionMaterialUrl,
        delivery.tallyUrl?.replace(/\/$/, '') !== 'https://tally.so' ? delivery.tallyUrl : '',
        ...(workspace.reference_links || []).map((link) => typeof link === 'string' ? link : (link.url || link.href || '')),
      ].filter(Boolean);
      const workspaceContext = [
        workspace.brief?.objective,
        workspace.brief?.audience,
        workspace.brief?.coreMessage,
        workspace.brief?.cta,
        workspace.brief?.notes,
        ...(workspace.canvas_blocks || []).map((block) => block.content),
        ...(workspace.creative_variants || []).map((creative) => `${creative.title || 'Criativo'}: ${creative.description || ''}`),
      ].filter(Boolean).join('\n\n');
      const { data, error } = await client.functions.invoke('generate-linkedin-copy', {
        body: {
          idea: { title: idea.title, summary: idea.summary, playbookAngle: idea.playbookAngle, linkedinUrl: idea.linkedinUrl, imageUrl: idea.imageUrl },
          sourceMaterials: contextMaterials,
          contextUrls,
          workspaceContext,
        },
      });
      if (error) {
        let detail = error.message || 'A função de IA retornou um erro.';
        try {
          const payload = await error.context?.json?.();
          detail = payload?.error || payload?.message || detail;
        } catch {
          // O contexto pode já ter sido consumido pelo client; preserva a mensagem original.
        }
        throw new Error(detail);
      }
      if (!data?.success || !data.result?.post) throw new Error(data?.error || 'A IA não devolveu uma versão completa.');
      const result = data.result;
      const item = {
        id: uid(),
        title: `IA • ${result.framework} • ${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}`,
        text: result.post,
        status: 'draft',
        ai: result,
        updatedBy: currentUser,
        updatedAt: nowIso(),
      };
      const next = { ...workspace, copy_variants: [...variants, item], selected_copy_id: item.id };
      setWorkspace(next);
      setDirty(true);
      await saveWorkspace(false, next);
      addToast(`Primeira versão gerada com ${result.framework} e salva para revisão.`, 'success');
    } catch (error) {
      console.error('LinkedIn Writer generation:', error);
      addToast(`Copy não gerada: ${error?.message || 'erro desconhecido na IA.'}`, 'error');
    } finally {
      setGeneratingCopy(false);
    }
  };

  const uploadCreativeFiles = async (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    setUploading(true);
    const added = [];
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;
      if (file.size > 25 * 1024 * 1024) { addToast(`${file.name} ultrapassa 25 MB.`, 'error'); continue; }
      const safeName = file.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '-');
      const path = `${idea.id}/${Date.now()}-${uid().slice(0, 8)}-creative-${safeName}`;
      const { error } = await client.storage.from('content-production').upload(path, file, { contentType: file.type, upsert: false });
      if (error) { addToast(`Falha ao enviar ${file.name}.`, 'error'); continue; }
      const { data } = client.storage.from('content-production').getPublicUrl(path);
      added.push({ id: uid(), title: `Criativo ${(workspace.creative_variants?.length || 0) + added.length + 1}`, description: '', imageUrl: data.publicUrl, path, createdBy: currentUser, createdAt: nowIso() });
    }
    if (added.length) updateWorkspace((current) => ({ ...current, creative_variants: [...(current.creative_variants || []), ...added], selected_creative_id: current.selected_creative_id || added[0].id }));
    event.target.value = '';
    setUploading(false);
  };

  const uploadDeliveryCover = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { addToast('A capa precisa ser uma imagem.', 'error'); return; }
    if (file.size > 25 * 1024 * 1024) { addToast('A capa ultrapassa 25 MB.', 'error'); return; }
    setCoverUploading(true);
    const safeName = file.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '-');
    const path = `${idea.id}/${Date.now()}-${uid().slice(0, 8)}-delivery-cover-${safeName}`;
    const { error } = await client.storage.from('content-production').upload(path, file, { contentType: file.type, upsert: false });
    if (error) {
      addToast('Não foi possível enviar a capa.', 'error');
    } else {
      const previousPath = workspace.brief?.delivery?.coverPath;
      const { data } = client.storage.from('content-production').getPublicUrl(path);
      updateWorkspace((current) => ({ ...current, brief: { ...(current.brief || {}), delivery: { ...(current.brief?.delivery || {}), coverUrl: data.publicUrl, coverPath: path } } }));
      if (previousPath) await client.storage.from('content-production').remove([previousPath]);
      addToast('Capa da entrega adicionada.', 'success');
    }
    event.target.value = '';
    setCoverUploading(false);
  };

  const uploadDeliveryMaterials = async (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    setMaterialUploading(true);
    const added = [];
    for (const file of files) {
      if (file.size > 25 * 1024 * 1024) { addToast(`${file.name} ultrapassa 25 MB.`, 'error'); continue; }
      const extraction = await extractSourceMaterial(file);
      const safeName = file.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '-');
      const path = `${idea.id}/delivery/${Date.now()}-${uid().slice(0, 8)}-${safeName}`;
      const { error } = await client.storage.from('content-production').upload(path, file, { contentType: file.type || undefined, upsert: false });
      if (error) { addToast(`Não foi possível enviar ${file.name}.`, 'error'); continue; }
      const { data } = client.storage.from('content-production').getPublicUrl(path);
      added.push({ id: uid(), name: file.name, path, url: data.publicUrl, type: file.type, size: file.size, uploadedBy: currentUser, createdAt: nowIso(), ...extraction });
    }
    if (added.length) updateWorkspace((current) => ({ ...current, brief: { ...(current.brief || {}), delivery: { tallyUrl: 'https://tally.so/', notionMaterialUrl: '', coverUrl: '', coverPath: '', materials: [], ...(current.brief?.delivery || {}), materials: [...(current.brief?.delivery?.materials || []), ...added] } } }));
    event.target.value = '';
    setMaterialUploading(false);
  };

  const removeDeliveryMaterial = async (material) => {
    if (material.path) {
      const { error } = await client.storage.from('content-production').remove([material.path]);
      if (error) { addToast(`Não foi possível remover ${material.name}.`, 'error'); return; }
    }
    updateWorkspace((current) => ({ ...current, brief: { ...(current.brief || {}), delivery: { ...(current.brief?.delivery || {}), materials: (current.brief?.delivery?.materials || []).filter((item) => item.id !== material.id) } } }));
  };

  const changeCreative = (id, patch) => updateWorkspace((current) => ({ ...current, creative_variants: (current.creative_variants || []).map((item) => item.id === id ? { ...item, ...patch, updatedBy: currentUser, updatedAt: nowIso() } : item) }));
  const removeCreative = async (creative) => {
    if (creative.path) await client.storage.from('content-production').remove([creative.path]);
    updateWorkspace((current) => ({ ...current, creative_variants: (current.creative_variants || []).filter((item) => item.id !== creative.id), selected_creative_id: current.selected_creative_id === creative.id ? (current.creative_variants || []).find((item) => item.id !== creative.id)?.id || null : current.selected_creative_id }));
  };
  const approveCombination = async (copy, creative) => {
    const approval = { id: uid(), copyId: copy.id, copyTitle: copy.title, creativeId: creative?.id || null, creativeTitle: creative?.title || null, approver: currentUser, decision: currentUser === 'Victor' ? 'approved' : 'suggested', createdAt: nowIso() };
    const next = { ...workspace, selected_copy_id: copy.id, selected_creative_id: creative?.id || null, approvals: [...(workspace.approvals || []), approval] };
    setWorkspace(next);
    setDirty(true);
    await saveWorkspace(false, next);
    addToast('Combinação aprovada e salva no pacote editorial.', 'success');
  };
  const handleSchedule = async () => { await saveWorkspace(false); onSchedule?.(idea); };
  const deliveryContext = workspace.brief?.delivery || {};
  const generationContextCount = 1
    + (workspace.attachments?.length || 0)
    + (workspace.source_materials?.length || 0)
    + (deliveryContext.materials?.length || 0)
    + (deliveryContext.notionMaterialUrl ? 1 : 0)
    + (deliveryContext.tallyUrl?.replace(/\/$/, '') !== 'https://tally.so' ? 1 : 0)
    + (workspace.creative_variants?.length || 0)
    + (workspace.canvas_blocks?.length || 0);
  const tabs = [
    { id: 'overview', label: 'Visão geral', icon: Target, count: 0 },
    { id: 'copies', label: 'Copies', icon: FileText, count: variants.length },
    { id: 'creatives', label: 'Criativos', icon: Palette, count: workspace.creative_variants?.length || 0 },
    { id: 'preview', label: 'Preview e aprovação', icon: Eye, count: workspace.approvals?.length || 0 },
    { id: 'materials', label: 'Materiais', icon: Paperclip, count: workspace.attachments?.length || 0 },
    { id: 'canvas', label: 'Canvas', icon: LayoutDashboard, count: workspace.canvas_blocks?.length || 0 },
    { id: 'feedback', label: 'Feedback', icon: MessageSquare, count: workspace.feedback?.length || 0 },
  ];

  return (
    <div className="cs-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <motion.section className={`cs-modal ${isFullscreen ? 'is-fullscreen' : ''} ${(activeTab === 'copies' || activeTab === 'creatives' || activeTab === 'preview') ? 'is-visual-mode' : ''}`} initial={{ opacity: 0, scale: .985, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }}>
        <header className="cs-header">
          <div><span className="cs-logo"><Sparkles size={15} /></span><div><strong>Estúdio colaborativo</strong><span>{idea.title}</span></div></div>
          <div className="cs-presence"><span>F</span><span>V</span><span>F</span><small>Felipe, Victor e Fernando</small><button type="button" className="cs-fullscreen-toggle" aria-label={isFullscreen ? 'Sair da tela cheia' : 'Maximizar workspace'} title={isFullscreen ? 'Sair da tela cheia' : 'Maximizar e focar no workspace'} onClick={() => setIsFullscreen((value) => !value)}>{isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</button><button type="button" aria-label="Fechar estúdio" onClick={onClose}><X size={17} /></button></div>
        </header>
        <div className="cs-body">
          <OriginalPost idea={idea} />
          <main className="cs-workspace">
            <nav className="cs-tabs">{tabs.map((tab) => { const Icon = tab.icon; return <button type="button" key={tab.id} className={activeTab === tab.id ? 'active' : ''} onClick={() => setActiveTab(tab.id)}><Icon size={14} /><span>{tab.label}</span>{tab.count > 0 && <strong>{tab.count}</strong>}</button>; })}</nav>
            <div className="cs-content">
              {loading ? <div className="cs-loading"><span /><strong>Carregando desenvolvimento...</strong></div> : (
                <AnimatePresence mode="wait">
                  <motion.div key={activeTab} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -6 }} transition={{ duration: .15 }} className="cs-panel-motion">
                    {activeTab === 'overview' && <OverviewPanel workspace={{ ...workspace, copy_variants: variants }} coverUploading={coverUploading} materialUploading={materialUploading} sourceUploading={sourceUploading} onChangeDelivery={(field, value) => updateWorkspace((current) => ({ ...current, brief: { ...(current.brief || {}), delivery: { tallyUrl: 'https://tally.so/', notionMaterialUrl: '', coverUrl: '', coverPath: '', materials: [], ...(current.brief?.delivery || {}), [field]: value } } }))} onUploadCover={uploadDeliveryCover} onUploadMaterial={uploadDeliveryMaterials} onRemoveMaterial={removeDeliveryMaterial} onUploadSource={uploadSourceFiles} onRemoveSource={removeSourceMaterial} onNavigate={setActiveTab} />}
                    {activeTab === 'copies' && <CopiesPanel variants={variants} selectedId={selectedId} contextCount={generationContextCount} generating={generatingCopy} onSelect={(id) => updateWorkspace({ selected_copy_id: id })} onChange={changeVariant} onAdd={addVariant} onDuplicate={duplicateVariant} onDelete={deleteVariant} onGenerate={generateFirstCopy} />}
                    {activeTab === 'creatives' && <CreativesPanel creatives={workspace.creative_variants || []} selectedId={workspace.selected_creative_id} uploading={uploading} onSelect={(id) => updateWorkspace({ selected_creative_id: id })} onUpload={uploadCreativeFiles} onChange={changeCreative} onRemove={removeCreative} />}
                    {activeTab === 'preview' && <LinkedInPreview idea={idea} workspace={{ ...workspace, copy_variants: variants }} currentUser={currentUser} onSelectCopy={(id) => updateWorkspace({ selected_copy_id: id })} onSelectCreative={(id) => updateWorkspace({ selected_creative_id: id || null })} onApprove={approveCombination} onSchedule={handleSchedule} />}
                    {activeTab === 'materials' && <MaterialsPanel attachments={workspace.attachments || []} uploading={uploading} onUpload={uploadFiles} onRemove={removeAttachment} onCanvas={addAssetToCanvas} />}
                    {activeTab === 'canvas' && <InfiniteCanvas blocks={workspace.canvas_blocks || []} setBlocks={(updater) => updateWorkspace((current) => ({ ...current, canvas_blocks: typeof updater === 'function' ? updater(current.canvas_blocks || []) : updater }))} attachments={workspace.attachments || []} />}
                    {activeTab === 'feedback' && <FeedbackPanel feedback={workspace.feedback || []} currentUser={currentUser} onAdd={(item) => updateWorkspace((current) => ({ ...current, feedback: [...(current.feedback || []), item] }))} />}
                  </motion.div>
                </AnimatePresence>
              )}
            </div>
            <footer className="cs-footer"><div><span className={dirty ? 'dirty' : ''}>{dirty ? 'Alterações ainda não salvas' : 'Tudo salvo para o time'}</span><small>Última edição por {workspace.updated_by || currentUser}</small></div><div><button type="button" className="cs-close-action" onClick={onClose}>Fechar</button><button type="button" className="cs-save-action" onClick={() => saveWorkspace(false)} disabled={saving}><Save size={14} /> {saving ? 'Salvando...' : 'Salvar workspace'}</button></div></footer>
          </main>
        </div>
      </motion.section>
    </div>
  );
}
