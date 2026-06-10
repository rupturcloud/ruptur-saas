/**
 * Disparador.jsx — BETA /beta-bubble — dispara campanhas (X1 / em massa)
 *
 * Dois caminhos, ambos sobre a API nativa já existente (create + launch):
 *  1. Lançar um rascunho existente com 1 clique.
 *  2. "Disparo rápido": escolhe uma campanha salva como MODELO, cola os
 *     destinatários (puxados do Leads via localStorage 'beta_leads') e dispara
 *     — cria uma campanha nova com esse conteúdo + números e lança na hora.
 *
 * Backend: campaigns.api.js → /api/campaigns/* (modo nativo /sender/*).
 */
import { useState, useEffect, useCallback } from 'react';
import { PageHeader, Button, Badge } from '../../ds/index.js';
import { campaignsApi } from '../../api/campaigns.api.js';
import { inboxApi } from '../../api/inbox.api.js';

const STYLES = `
  .bdisp-wrap { margin-top: 14px; display:flex; flex-direction:column; gap:18px; }
  .bdisp-card { background:var(--ink-0); border:1px solid var(--ink-200); border-radius:14px; padding:18px; }
  .bdisp-card h3 { font-size:14px; font-weight:700; color:var(--ink-900); margin:0 0 12px; }
  .bdisp-label { font-size:12px; font-weight:600; color:var(--ink-700); margin-bottom:5px; display:block; }
  .bdisp-hint { font-size:11px; color:var(--ink-400); margin-top:4px; }
  .bdisp-select, .bdisp-textarea {
    width:100%; border-radius:9px; border:1px solid var(--ink-200); padding:9px 11px;
    font-size:13px; font-family:inherit; background:var(--ink-0); color:var(--ink-900);
  }
  .bdisp-textarea { resize:vertical; }
  .bdisp-field { margin-bottom:14px; }
  .bdisp-row { display:flex; gap:8px; align-items:center; }
  .bdisp-drafts { display:flex; flex-direction:column; gap:8px; }
  .bdisp-draft { display:flex; align-items:center; gap:10px; padding:10px 12px; border:1px solid var(--ink-200); border-radius:10px; }
  .bdisp-draft__name { flex:1; font-size:13px; font-weight:600; color:var(--ink-900); }
  .bdisp-feedback { font-size:13px; padding:10px 12px; border-radius:9px; margin-top:8px; }
  .bdisp-ok { background:rgba(34,197,94,.10); color:#15803d; }
  .bdisp-err { background:rgba(239,68,68,.10); color:#b91c1c; }
`;

const STATUS_LABEL = {
  draft: 'Rascunho', scheduled: 'Agendada', sending: 'Enviando', active: 'Enviando',
  paused: 'Pausada', completed: 'Concluída', failed: 'Falhou', stopped: 'Parada', cancelled: 'Cancelada',
};
const STATUS_TONE = {
  draft: 'neutral', scheduled: 'brand', sending: 'brand', active: 'brand',
  paused: 'warn', completed: 'ok', failed: 'danger', stopped: 'neutral', cancelled: 'neutral',
};

/** Normaliza um número para o formato 5511999999999 (só dígitos). */
function normNumber(raw) {
  return String(raw || '').replace(/\D+/g, '');
}

/** Extrai o conteúdo de uma campanha-modelo para um payload de create. */
function contentToPayload(c) {
  const content = c.content || {};
  const buttons = Array.isArray(content.buttons)
    ? content.buttons
        .filter((b) => (b && (b.text || b.title)))
        .map((b) => ({ text: (b.text || b.title || '').trim(), url: (b.url || '').trim() || undefined }))
    : [];
  const media = Array.isArray(content.media) ? content.media
    : (content.mediaUrl ? [content.mediaUrl] : []);
  return {
    message: content.message || '',
    mediaType: content.mediaType || (media.length ? 'image' : 'text'),
    media,
    buttons,
    footerText: content.footerText || '',
  };
}

export default function Disparador() {
  const [campaigns, setCampaigns] = useState([]);
  const [instances, setInstances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Disparo rápido
  const [templateId, setTemplateId] = useState('');
  const [instanceKey, setInstanceKey] = useState('');
  const [numbersText, setNumbersText] = useState('');
  const [delayMin, setDelayMin] = useState(3);
  const [delayMax, setDelayMax] = useState(8);
  const [firing, setFiring] = useState(false);
  const [feedback, setFeedback] = useState(null); // { tone:'ok'|'err', msg }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await campaignsApi.list({ limit: 50 });
      setCampaigns(data.campaigns || data || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    inboxApi.listInstances().then((d) => setInstances(d.instances || [])).catch(() => {});
    // Prefill de destinatários vindos da página Leads
    try {
      const saved = window.localStorage.getItem('beta_leads');
      if (saved) {
        const arr = JSON.parse(saved);
        if (Array.isArray(arr) && arr.length) {
          const nums = arr.map((x) => (typeof x === 'string' ? x : x.telefone || x.phone || '')).filter(Boolean);
          // eslint-disable-next-line react-hooks/set-state-in-effect
          if (nums.length) setNumbersText(nums.join('\n'));
        }
      }
    } catch { /* noop */ }
  }, [load]);

  const numbers = [...new Set(numbersText.split(/[\n,;]+/).map(normNumber).filter((n) => n.length >= 10))];

  const drafts = campaigns.filter((c) => (c.status || 'draft') === 'draft' || c.status === 'scheduled');

  const doAction = async (id, action) => {
    setError('');
    try {
      await campaignsApi[action](id);
      await load();
    } catch (e) {
      setError(e.message);
    }
  };

  const fire = async () => {
    setFeedback(null);
    if (!templateId) { setFeedback({ tone: 'err', msg: 'Escolha uma campanha-modelo' }); return; }
    if (!instanceKey) { setFeedback({ tone: 'err', msg: 'Selecione a instância de envio' }); return; }
    if (numbers.length === 0) { setFeedback({ tone: 'err', msg: 'Informe ao menos um destinatário válido' }); return; }
    setFiring(true);
    try {
      // Lê o conteúdo completo do modelo (get traz content detalhado)
      let template = campaigns.find((c) => c.id === templateId);
      try { template = (await campaignsApi.get(templateId)) || template; } catch { /* usa o da lista */ }
      const base = contentToPayload(template.campaign || template);
      const payload = {
        name: `${(template.name || template.campaign?.name || 'Disparo')} · ${numbers.length} destino(s)`,
        ...base,
        customNumbers: numbers,
        instanceIds: [instanceKey],
        senderType: 'specific',
        dispatchMode: 'native',
        delayMin: Number(delayMin) || 3,
        delayMax: Number(delayMax) || 8,
        scheduleType: 'immediate',
        scheduledAt: null,
      };
      const created = await campaignsApi.create(payload);
      const id = created.id || created.campaign?.id;
      if (id) await campaignsApi.launch(id);
      setFeedback({ tone: 'ok', msg: `Disparo iniciado para ${numbers.length} destinatário(s). Acompanhe no Monitor.` });
      await load();
    } catch (e) {
      setFeedback({ tone: 'err', msg: e.message });
    } finally {
      setFiring(false);
    }
  };

  return (
    <div className="bdisp-wrap">
      <style>{STYLES}</style>
      <PageHeader
        crumbs={['Ruptur Beta', 'Disparador']}
        title="Disparador"
        sub="Lance rascunhos ou dispare em massa a partir de uma campanha-modelo"
      />

      {error && <div style={{ color: '#EF4444', fontSize: 13 }}>{error}</div>}

      {/* Disparo rápido */}
      <div className="bdisp-card">
        <h3>Disparo rápido (X1 / em massa)</h3>
        <div className="bdisp-field">
          <span className="bdisp-label">Campanha-modelo (conteúdo: mensagem, mídia, botões)</span>
          <select className="bdisp-select" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
            <option value="">Selecione…</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <div className="bdisp-field">
          <span className="bdisp-label">Instância de envio</span>
          <select className="bdisp-select" value={instanceKey} onChange={(e) => setInstanceKey(e.target.value)}>
            <option value="">Selecione…</option>
            {instances.map((i) => (
              <option key={i.key} value={i.key}>{i.name || i.phone || i.key} {i.status === 'connected' ? '🟢' : '⚪'}</option>
            ))}
          </select>
        </div>

        <div className="bdisp-field">
          <span className="bdisp-label">Destinatários (um por linha ou separados por vírgula)</span>
          <textarea className="bdisp-textarea" rows={5} value={numbersText}
            onChange={(e) => setNumbersText(e.target.value)}
            placeholder={'5511999999999\n5511888888888'} />
          <div className="bdisp-hint">{numbers.length} destinatário(s) válido(s) · prefill automático vindo da página Leads</div>
        </div>

        <div className="bdisp-field">
          <span className="bdisp-label">Intervalo entre envios (segundos)</span>
          <div className="bdisp-row">
            <input className="bdisp-select" style={{ maxWidth: 120 }} type="number" value={delayMin} onChange={(e) => setDelayMin(e.target.value)} placeholder="mín" />
            <input className="bdisp-select" style={{ maxWidth: 120 }} type="number" value={delayMax} onChange={(e) => setDelayMax(e.target.value)} placeholder="máx" />
          </div>
        </div>

        <Button onClick={fire} disabled={firing}>{firing ? 'Disparando…' : 'Disparar agora'}</Button>
        {feedback && (
          <div className={`bdisp-feedback ${feedback.tone === 'ok' ? 'bdisp-ok' : 'bdisp-err'}`}>{feedback.msg}</div>
        )}
      </div>

      {/* Lançar rascunhos existentes */}
      <div className="bdisp-card">
        <h3>Lançar campanha pronta</h3>
        {loading ? (
          <div style={{ color: 'var(--ink-500)', fontSize: 13 }}>Carregando…</div>
        ) : drafts.length === 0 ? (
          <div style={{ color: 'var(--ink-500)', fontSize: 13 }}>Nenhum rascunho com destinatários para lançar. Crie em Campanhas.</div>
        ) : (
          <div className="bdisp-drafts">
            {drafts.map((c) => (
              <div key={c.id} className="bdisp-draft">
                <span className="bdisp-draft__name">{c.name}</span>
                <Badge tone={STATUS_TONE[c.status] || 'neutral'}>{STATUS_LABEL[c.status] || c.status}</Badge>
                <span style={{ fontSize: 12, color: 'var(--ink-500)' }}>{c.metrics?.totalRecipients ?? 0} destino(s)</span>
                <Button size="sm" onClick={() => doAction(c.id, 'launch')}>Lançar</Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
