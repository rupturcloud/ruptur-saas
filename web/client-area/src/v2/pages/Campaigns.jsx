/**
 * Campaigns.jsx — Campanhas de disparo em massa (V0 laranja)
 *
 * Lista de campanhas + composer de mensagem com suporte a mídia, botões
 * interativos, variáveis de personalização ({name}/{phone}) e spintext.
 *
 * Modo de disparo: NATIVO (híbrido) — o backend cria a campanha na fila da
 * UAZAPI (/sender/advanced) e reconcilia créditos via /sender/listmessages.
 *
 * Backend: campaigns.api.js → gateway /api/campaigns/* (proxy warmup-core).
 */
import { useState, useEffect, useCallback } from 'react';
import { PageHeader, Button, Input, Modal, Badge, EmptyState } from '../../ds/index.js';
import { campaignsApi } from '../../api/campaigns.api.js';
import { inboxApi } from '../../api/inbox.api.js';

const STYLES = `
  .cmp-wrap { margin-top: 14px; }
  .cmp-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(300px,1fr)); gap:14px; }
  .cmp-card { background:var(--ink-0); border:1px solid var(--ink-200); border-radius:14px; padding:16px; }
  .cmp-card__head { display:flex; align-items:center; gap:8px; margin-bottom:10px; }
  .cmp-card__name { font-size:15px; font-weight:700; color:var(--ink-900); flex:1; }
  .cmp-card__msg { font-size:13px; color:var(--ink-500); margin-bottom:12px; min-height:36px;
    display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
  .cmp-metrics { display:flex; gap:14px; margin-bottom:12px; }
  .cmp-metric { text-align:center; }
  .cmp-metric__n { font-size:18px; font-weight:700; color:var(--ink-900); }
  .cmp-metric__l { font-size:11px; color:var(--ink-500); }
  .cmp-card__actions { display:flex; gap:8px; }

  .cmp-form { display:flex; gap:20px; }
  .cmp-form__col { flex:1; min-width:0; }
  .cmp-field { margin-bottom:14px; }
  .cmp-label { font-size:12px; font-weight:600; color:var(--ink-700); margin-bottom:5px; display:block; }
  .cmp-hint { font-size:11px; color:var(--ink-400); margin-top:4px; }
  .cmp-textarea {
    width:100%; border-radius:9px; border:1px solid var(--ink-200); padding:9px 11px;
    font-size:13px; font-family:inherit; resize:vertical; background:var(--ink-0); color:var(--ink-900);
  }
  .cmp-row { display:flex; gap:8px; align-items:center; margin-bottom:6px; }
  .cmp-btn-chip { flex:1; }
  .cmp-select {
    height:38px; padding:0 10px; border-radius:9px; border:1px solid var(--ink-200);
    background:var(--ink-0); color:var(--ink-900); font-size:13px; width:100%;
  }
  /* Preview estilo WhatsApp */
  .cmp-preview { background:#0b141a; border-radius:14px; padding:16px; min-height:200px; }
  .cmp-bubble {
    background:#005c4b; color:#e9edef; border-radius:10px; padding:8px 10px; max-width:85%;
    margin-left:auto; font-size:13px; white-space:pre-wrap; word-break:break-word; box-shadow:0 1px 1px rgba(0,0,0,.2);
  }
  .cmp-bubble__media {
    background:#0a3b32; border-radius:7px; height:90px; display:flex; align-items:center;
    justify-content:center; color:#7fb5a8; font-size:12px; margin-bottom:6px;
  }
  .cmp-bubble__btns { margin-top:8px; border-top:1px solid rgba(255,255,255,.1); padding-top:6px; }
  .cmp-bubble__btn { text-align:center; color:#53bdeb; font-size:13px; padding:6px; border-top:1px solid rgba(255,255,255,.08); }
  .cmp-estimate { margin-top:12px; padding:10px 12px; background:rgba(255,106,61,.08); border-radius:9px; font-size:12px; color:var(--ink-700); }
`;

const STATUS_LABEL = {
  draft: 'Rascunho', scheduled: 'Agendada', sending: 'Enviando', active: 'Enviando',
  paused: 'Pausada', completed: 'Concluída', failed: 'Falhou', stopped: 'Parada', cancelled: 'Cancelada',
};
const STATUS_TONE = {
  draft: 'neutral', scheduled: 'brand', sending: 'brand', active: 'brand',
  paused: 'warn', completed: 'ok', failed: 'danger', stopped: 'neutral', cancelled: 'neutral',
};

const EMPTY_FORM = {
  name: '', instanceKeys: [], message: '', mediaType: 'text', mediaUrl: '',
  buttons: [], footerText: '', numbersText: '', tagsText: '', delayMin: 3, delayMax: 8,
  scheduleType: 'immediate', scheduledAt: '',
};

export default function Campaigns() {
  const [campaigns, setCampaigns] = useState([]);
  const [instances, setInstances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showComposer, setShowComposer] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

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
    inboxApi.listInstances()
      .then((d) => setInstances(d.instances || []))
      .catch(() => {});
  }, [load]);

  const openComposer = () => {
    const connected = instances.filter((i) => i.status === 'connected');
    const first = connected.length > 0 ? [connected[0].key] : [];
    setForm({ ...EMPTY_FORM, instanceKeys: first });
    setError('');
    setShowComposer(true);
  };

  const upd = (patch) => setForm((f) => ({ ...f, ...patch }));

  const numbers = form.numbersText.split(/[\n,;]+/).map((n) => n.trim()).filter(Boolean);

  const buildPayload = () => ({
    name: form.name.trim(),
    message: form.message,
    mediaType: form.mediaType,
    media: form.mediaUrl ? [form.mediaUrl] : [],
    buttons: form.buttons.filter((b) => b.text?.trim()).map((b) => ({ text: b.text.trim() })),
    footerText: form.footerText,
    customNumbers: numbers,
    instanceIds: form.instanceKeys,
    senderType: form.instanceKeys.length > 0 ? 'specific' : 'pool',
    dispatchMode: 'native',
    delayMin: Number(form.delayMin) || 3,
    delayMax: Number(form.delayMax) || 8,
    scheduleType: form.scheduleType,
    scheduledAt: form.scheduleType === 'scheduled' && form.scheduledAt ? new Date(form.scheduledAt).toISOString() : null,
    tags: form.tagsText ? form.tagsText.split(',').map(t => t.trim()).filter(Boolean) : [],
  });

  const validate = () => {
    if (!form.name.trim()) return 'Dê um nome à campanha';
    if (!form.message.trim()) return 'Escreva a mensagem';
    if (numbers.length === 0) return 'Informe ao menos um destinatário';
    if (form.instanceKeys.length === 0) return 'Selecione ao menos uma instância';
    if (form.mediaType !== 'text' && !form.mediaUrl.trim()) return 'Informe a URL da mídia';
    return null;
  };

  const save = async (launch) => {
    const v = validate();
    if (v) { setError(v); return; }
    setSaving(true);
    setError('');
    try {
      const created = await campaignsApi.create(buildPayload());
      const id = created.id || created.campaign?.id;
      if (launch && id) await campaignsApi.launch(id);
      setShowComposer(false);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const doAction = async (id, action) => {
    try {
      await campaignsApi[action](id);
      await load();
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div className="cmp-wrap">
      <style>{STYLES}</style>
      <PageHeader
        crumbs={['Ruptur OS', 'Campanhas']}
        title="Campanhas"
        sub="Disparo em massa com mídia, botões e personalização"
        actions={<Button onClick={openComposer}>Nova campanha</Button>}
      />

      {error && !showComposer && <div style={{ color: '#EF4444', fontSize: 13, marginBottom: 12 }}>{error}</div>}

      {loading ? (
        <div style={{ padding: 48, textAlign: 'center', color: 'var(--ink-500)' }}>Carregando campanhas…</div>
      ) : campaigns.length === 0 ? (
        <EmptyState
          icon="broadcast"
          title="Nenhuma campanha ainda"
          text="Crie sua primeira campanha de disparo em massa."
          action={<Button onClick={openComposer}>Nova campanha</Button>}
        />
      ) : (
        <div className="cmp-grid">
          {campaigns.map((c) => {
            const m = c.metrics || {};
            const status = c.status || 'draft';
            return (
              <div key={c.id} className="cmp-card">
                <div className="cmp-card__head">
                  <span className="cmp-card__name">{c.name}</span>
                  <Badge tone={STATUS_TONE[status] || 'neutral'}>{STATUS_LABEL[status] || status}</Badge>
                </div>
                <div className="cmp-card__msg">{c.content?.message || '—'}</div>
                <div className="cmp-metrics">
                  <div className="cmp-metric"><div className="cmp-metric__n">{m.totalRecipients ?? 0}</div><div className="cmp-metric__l">Total</div></div>
                  <div className="cmp-metric"><div className="cmp-metric__n">{m.sentCount ?? 0}</div><div className="cmp-metric__l">Enviadas</div></div>
                  <div className="cmp-metric"><div className="cmp-metric__n">{m.readCount ?? 0}</div><div className="cmp-metric__l">Lidas</div></div>
                  <div className="cmp-metric"><div className="cmp-metric__n">{m.failedCount ?? 0}</div><div className="cmp-metric__l">Falhas</div></div>
                </div>
                <div className="cmp-card__actions">
                  {(status === 'draft' || status === 'scheduled') && (
                    <Button size="sm" onClick={() => doAction(c.id, 'launch')}>Lançar</Button>
                  )}
                  {(status === 'sending' || status === 'active') && (
                    <Button size="sm" variant="secondary" onClick={() => doAction(c.id, 'pause')}>Pausar</Button>
                  )}
                  {(status === 'sending' || status === 'active' || status === 'paused') && (
                    <Button size="sm" variant="ghost" onClick={() => doAction(c.id, 'stop')}>Parar</Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showComposer && (
        <Modal title="Nova campanha" onClose={() => setShowComposer(false)} width={920}
          footer={
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center', width: '100%' }}>
              {error && <span style={{ color: '#EF4444', fontSize: 12, marginRight: 'auto' }}>{error}</span>}
              <Button variant="ghost" onClick={() => setShowComposer(false)} disabled={saving}>Cancelar</Button>
              <Button variant="secondary" onClick={() => save(false)} disabled={saving}>Salvar rascunho</Button>
              <Button onClick={() => save(true)} disabled={saving}>{saving ? 'Enviando…' : 'Criar e lançar'}</Button>
            </div>
          }
        >
          <Composer form={form} upd={upd} instances={instances} numbers={numbers} />
        </Modal>
      )}
    </div>
  );
}

function Composer({ form, upd, instances, numbers }) {
  const addButton = () => { if (form.buttons.length < 3) upd({ buttons: [...form.buttons, { text: '' }] }); };
  const setButton = (i, text) => upd({ buttons: form.buttons.map((b, idx) => (idx === i ? { text } : b)) });
  const rmButton = (i) => upd({ buttons: form.buttons.filter((_, idx) => idx !== i) });

  const previewText = (form.message || 'Sua mensagem aparece aqui…')
    .replace(/\{name\}/g, 'Maria')
    .replace(/\{phone\}/g, '5511999999999');

  return (
    <div className="cmp-form">
      {/* Coluna esquerda — edição */}
      <div className="cmp-form__col">
        <div className="cmp-field">
          <span className="cmp-label">Nome da campanha</span>
          <Input value={form.name} onChange={(e) => upd({ name: e.target.value })} placeholder="Ex.: Promoção de junho" />
        </div>

        <div className="cmp-field">
          <span className="cmp-label">Instâncias de envio (Multi-seleção)</span>
          <select className="cmp-select" multiple style={{ height: 100 }} value={form.instanceKeys} onChange={(e) => {
            const values = Array.from(e.target.selectedOptions, option => option.value);
            upd({ instanceKeys: values });
          }}>
            {instances.map((i) => (
              <option key={i.key} value={i.key}>{i.name || i.phone || i.key} {i.status === 'connected' ? '🟢' : '⚪'}</option>
            ))}
          </select>
          <div className="cmp-hint">Segure Ctrl ou Cmd para selecionar várias. O envio fará Round-Robin entre elas.</div>
        </div>

        <div className="cmp-field">
          <span className="cmp-label">Mensagem</span>
          <textarea className="cmp-textarea" rows={5} value={form.message}
            onChange={(e) => upd({ message: e.target.value })}
            placeholder="Olá {name}! Temos uma novidade pra você…" />
          <div className="cmp-hint">Variáveis: {'{name}'}, {'{phone}'} · Spintext: {'{oi|olá|e aí}'}</div>
        </div>

        <div className="cmp-field">
          <span className="cmp-label">Mídia (opcional)</span>
          <div className="cmp-row">
            <select className="cmp-select" style={{ maxWidth: 150 }} value={form.mediaType}
              onChange={(e) => upd({ mediaType: e.target.value })}>
              <option value="text">Sem mídia</option>
              <option value="image">Imagem</option>
              <option value="video">Vídeo</option>
              <option value="document">Documento</option>
            </select>
            {form.mediaType !== 'text' && (
              <Input value={form.mediaUrl} onChange={(e) => upd({ mediaUrl: e.target.value })} placeholder="https://… URL da mídia" />
            )}
          </div>
        </div>

        <div className="cmp-field">
          <span className="cmp-label">Botões interativos (até 3)</span>
          {form.buttons.map((b, i) => (
            <div className="cmp-row" key={i}>
              <div className="cmp-btn-chip">
                <Input value={b.text} onChange={(e) => setButton(i, e.target.value)} placeholder={`Botão ${i + 1}`} />
              </div>
              <Button size="sm" variant="ghost" onClick={() => rmButton(i)}>✕</Button>
            </div>
          ))}
          {form.buttons.length < 3 && <Button size="sm" variant="secondary" onClick={addButton}>+ Adicionar botão</Button>}
          {form.buttons.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <span className="cmp-label">Rodapé</span>
              <Input value={form.footerText} onChange={(e) => upd({ footerText: e.target.value })} placeholder="Texto do rodapé (opcional)" />
            </div>
          )}
        </div>

        <div className="cmp-field">
          <span className="cmp-label">Destinatários (um por linha ou separados por vírgula)</span>
          <textarea className="cmp-textarea" rows={4} value={form.numbersText}
            onChange={(e) => upd({ numbersText: e.target.value })}
            placeholder={'5511999999999\n5511888888888'} />
          <div className="cmp-hint">{numbers.length} destinatário(s)</div>
        </div>

        <div className="cmp-field">
          <span className="cmp-label">Etiquetas automáticas no CRM (opcional, separadas por vírgula)</span>
          <Input value={form.tagsText} onChange={(e) => upd({ tagsText: e.target.value })} placeholder="ex: blackfriday, promo_junho" />
          <div className="cmp-hint">As etiquetas serão aplicadas a cada destinatário ao lançar a campanha</div>
        </div>

        <div className="cmp-field">
          <span className="cmp-label">Intervalo entre envios (segundos)</span>
          <div className="cmp-row">
            <Input type="number" value={form.delayMin} onChange={(e) => upd({ delayMin: e.target.value })} placeholder="mín" />
            <Input type="number" value={form.delayMax} onChange={(e) => upd({ delayMax: e.target.value })} placeholder="máx" />
          </div>
        </div>

        <div className="cmp-field">
          <span className="cmp-label">Agendamento</span>
          <div className="cmp-row">
            <select className="cmp-select" style={{ maxWidth: 160 }} value={form.scheduleType}
              onChange={(e) => upd({ scheduleType: e.target.value })}>
              <option value="immediate">Imediato</option>
              <option value="scheduled">Agendar</option>
            </select>
            {form.scheduleType === 'scheduled' && (
              <Input type="datetime-local" value={form.scheduledAt} onChange={(e) => upd({ scheduledAt: e.target.value })} />
            )}
          </div>
        </div>
      </div>

      {/* Coluna direita — preview */}
      <div className="cmp-form__col" style={{ maxWidth: 320 }}>
        <span className="cmp-label">Pré-visualização</span>
        <div className="cmp-preview">
          <div className="cmp-bubble">
            {form.mediaType !== 'text' && (
              <div className="cmp-bubble__media">
                {form.mediaType === 'image' ? '🖼️ Imagem' : form.mediaType === 'video' ? '🎬 Vídeo' : '📄 Documento'}
              </div>
            )}
            {previewText}
            {form.footerText && <div style={{ opacity: .6, fontSize: 11, marginTop: 6 }}>{form.footerText}</div>}
            {form.buttons.filter((b) => b.text?.trim()).length > 0 && (
              <div className="cmp-bubble__btns">
                {form.buttons.filter((b) => b.text?.trim()).map((b, i) => (
                  <div key={i} className="cmp-bubble__btn">{b.text}</div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="cmp-estimate">
          Estimativa: <strong>{numbers.length} crédito(s)</strong> serão reservados ao lançar.
          Falhas são estornadas automaticamente.
        </div>
      </div>
    </div>
  );
}
