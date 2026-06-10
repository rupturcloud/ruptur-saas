/**
 * Campanhas.jsx — BETA /beta-bubble — composer de campanha (V0 laranja)
 *
 * Igual ao composer de /v0/campaigns, porém com BOTÕES que têm texto E link
 * (URL) editáveis — requisito do disparo X1/massa. O backend nativo aceita
 * `buttons: [{ text, url }]` e converte pro formato choices "Texto|URL" do UazAPI.
 *
 * Backend: campaigns.api.js → gateway /api/campaigns/* (proxy warmup-core).
 */
import { useState, useEffect, useCallback } from 'react';
import { PageHeader, Button, Input, Modal, Badge, EmptyState } from '../../ds/index.js';
import { campaignsApi } from '../../api/campaigns.api.js';
import { inboxApi } from '../../api/inbox.api.js';

const STYLES = `
  .bcmp-wrap { margin-top: 14px; }
  .bcmp-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(300px,1fr)); gap:14px; }
  .bcmp-card { background:var(--ink-0); border:1px solid var(--ink-200); border-radius:14px; padding:16px; }
  .bcmp-card__head { display:flex; align-items:center; gap:8px; margin-bottom:10px; }
  .bcmp-card__name { font-size:15px; font-weight:700; color:var(--ink-900); flex:1; }
  .bcmp-card__msg { font-size:13px; color:var(--ink-500); margin-bottom:12px; min-height:36px;
    display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
  .bcmp-metrics { display:flex; gap:14px; margin-bottom:12px; }
  .bcmp-metric { text-align:center; }
  .bcmp-metric__n { font-size:18px; font-weight:700; color:var(--ink-900); }
  .bcmp-metric__l { font-size:11px; color:var(--ink-500); }
  .bcmp-card__actions { display:flex; gap:8px; }

  .bcmp-form { display:flex; gap:20px; }
  .bcmp-form__col { flex:1; min-width:0; }
  .bcmp-field { margin-bottom:14px; }
  .bcmp-label { font-size:12px; font-weight:600; color:var(--ink-700); margin-bottom:5px; display:block; }
  .bcmp-hint { font-size:11px; color:var(--ink-400); margin-top:4px; }
  .bcmp-textarea {
    width:100%; border-radius:9px; border:1px solid var(--ink-200); padding:9px 11px;
    font-size:13px; font-family:inherit; resize:vertical; background:var(--ink-0); color:var(--ink-900);
  }
  .bcmp-row { display:flex; gap:8px; align-items:center; margin-bottom:6px; }
  .bcmp-btnbox { flex:1; display:flex; flex-direction:column; gap:5px; border:1px dashed var(--ink-200);
    border-radius:9px; padding:8px; }
  .bcmp-select {
    height:38px; padding:0 10px; border-radius:9px; border:1px solid var(--ink-200);
    background:var(--ink-0); color:var(--ink-900); font-size:13px; width:100%;
  }
  .bcmp-preview { background:#0b141a; border-radius:14px; padding:16px; min-height:200px; }
  .bcmp-bubble {
    background:#005c4b; color:#e9edef; border-radius:10px; padding:8px 10px; max-width:85%;
    margin-left:auto; font-size:13px; white-space:pre-wrap; word-break:break-word; box-shadow:0 1px 1px rgba(0,0,0,.2);
  }
  .bcmp-bubble__media {
    background:#0a3b32; border-radius:7px; height:90px; display:flex; align-items:center;
    justify-content:center; color:#7fb5a8; font-size:12px; margin-bottom:6px;
  }
  .bcmp-bubble__btns { margin-top:8px; border-top:1px solid rgba(255,255,255,.1); padding-top:6px; }
  .bcmp-bubble__btn { text-align:center; color:#53bdeb; font-size:13px; padding:6px; border-top:1px solid rgba(255,255,255,.08); }
  .bcmp-estimate { margin-top:12px; padding:10px 12px; background:rgba(255,106,61,.08); border-radius:9px; font-size:12px; color:var(--ink-700); }
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
  name: '', instanceKey: '', message: '', mediaType: 'text', mediaUrl: '',
  buttons: [], footerText: '', numbersText: '', delayMin: 3, delayMax: 8,
  scheduleType: 'immediate', scheduledAt: '',
};

export default function Campanhas() {
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
    const first = instances.find((i) => i.status === 'connected') || instances[0];
    setForm({ ...EMPTY_FORM, instanceKey: first?.key || '' });
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
    // Botões agora carregam texto E url (link). Botão sem url vira botão simples.
    buttons: form.buttons
      .filter((b) => b.text?.trim())
      .map((b) => ({ text: b.text.trim(), url: (b.url || '').trim() || undefined })),
    footerText: form.footerText,
    customNumbers: numbers,
    instanceIds: form.instanceKey ? [form.instanceKey] : [],
    senderType: form.instanceKey ? 'specific' : 'pool',
    dispatchMode: 'native',
    delayMin: Number(form.delayMin) || 3,
    delayMax: Number(form.delayMax) || 8,
    scheduleType: form.scheduleType,
    scheduledAt: form.scheduleType === 'scheduled' && form.scheduledAt ? new Date(form.scheduledAt).toISOString() : null,
  });

  const validate = () => {
    if (!form.name.trim()) return 'Dê um nome à campanha';
    if (!form.message.trim()) return 'Escreva a mensagem';
    if (!form.instanceKey) return 'Selecione uma instância';
    if (form.mediaType !== 'text' && !form.mediaUrl.trim()) return 'Informe a URL da mídia';
    // Botão com link precisa de URL válida
    for (const b of form.buttons) {
      if (b.url && b.url.trim() && !/^https?:\/\//i.test(b.url.trim())) {
        return `O link do botão "${b.text || ''}" deve começar com http:// ou https://`;
      }
    }
    return null;
  };

  const save = async (launch) => {
    const v = validate();
    if (v) { setError(v); return; }
    if (launch && numbers.length === 0) { setError('Para lançar agora, informe ao menos um destinatário'); return; }
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
    <div className="bcmp-wrap">
      <style>{STYLES}</style>
      <PageHeader
        crumbs={['Ruptur Beta', 'Campanhas']}
        title="Campanhas"
        sub="Monte a mensagem com mídia e botões (texto + link) e salve para disparar"
        actions={<Button onClick={openComposer}>Nova campanha</Button>}
      />

      {error && !showComposer && <div style={{ color: '#EF4444', fontSize: 13, marginBottom: 12 }}>{error}</div>}

      {loading ? (
        <div style={{ padding: 48, textAlign: 'center', color: 'var(--ink-500)' }}>Carregando campanhas…</div>
      ) : campaigns.length === 0 ? (
        <EmptyState
          icon="broadcast"
          title="Nenhuma campanha ainda"
          text="Crie sua primeira campanha. Você poderá lançá-la aqui ou pelo Disparador."
          action={<Button onClick={openComposer}>Nova campanha</Button>}
        />
      ) : (
        <div className="bcmp-grid">
          {campaigns.map((c) => {
            const m = c.metrics || {};
            const status = c.status || 'draft';
            return (
              <div key={c.id} className="bcmp-card">
                <div className="bcmp-card__head">
                  <span className="bcmp-card__name">{c.name}</span>
                  <Badge tone={STATUS_TONE[status] || 'neutral'}>{STATUS_LABEL[status] || status}</Badge>
                </div>
                <div className="bcmp-card__msg">{c.content?.message || '—'}</div>
                <div className="bcmp-metrics">
                  <div className="bcmp-metric"><div className="bcmp-metric__n">{m.totalRecipients ?? 0}</div><div className="bcmp-metric__l">Total</div></div>
                  <div className="bcmp-metric"><div className="bcmp-metric__n">{m.sentCount ?? 0}</div><div className="bcmp-metric__l">Enviadas</div></div>
                  <div className="bcmp-metric"><div className="bcmp-metric__n">{m.readCount ?? 0}</div><div className="bcmp-metric__l">Lidas</div></div>
                  <div className="bcmp-metric"><div className="bcmp-metric__n">{m.failedCount ?? 0}</div><div className="bcmp-metric__l">Falhas</div></div>
                </div>
                <div className="bcmp-card__actions">
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
  const addButton = () => { if (form.buttons.length < 3) upd({ buttons: [...form.buttons, { text: '', url: '' }] }); };
  const setButton = (i, patch) => upd({ buttons: form.buttons.map((b, idx) => (idx === i ? { ...b, ...patch } : b)) });
  const rmButton = (i) => upd({ buttons: form.buttons.filter((_, idx) => idx !== i) });

  const previewText = (form.message || 'Sua mensagem aparece aqui…')
    .replace(/\{name\}/g, 'Maria')
    .replace(/\{phone\}/g, '5511999999999');

  return (
    <div className="bcmp-form">
      {/* Coluna esquerda — edição */}
      <div className="bcmp-form__col">
        <div className="bcmp-field">
          <span className="bcmp-label">Nome da campanha</span>
          <Input value={form.name} onChange={(e) => upd({ name: e.target.value })} placeholder="Ex.: Promoção de junho" />
        </div>

        <div className="bcmp-field">
          <span className="bcmp-label">Instância de envio</span>
          <select className="bcmp-select" value={form.instanceKey} onChange={(e) => upd({ instanceKey: e.target.value })}>
            <option value="">Selecione…</option>
            {instances.map((i) => (
              <option key={i.key} value={i.key}>{i.name || i.phone || i.key} {i.status === 'connected' ? '🟢' : '⚪'}</option>
            ))}
          </select>
        </div>

        <div className="bcmp-field">
          <span className="bcmp-label">Mensagem</span>
          <textarea className="bcmp-textarea" rows={5} value={form.message}
            onChange={(e) => upd({ message: e.target.value })}
            placeholder="Olá {name}! Temos uma novidade pra você…" />
          <div className="bcmp-hint">Variáveis: {'{name}'}, {'{phone}'} · Spintext: {'{oi|olá|e aí}'}</div>
        </div>

        <div className="bcmp-field">
          <span className="bcmp-label">Mídia (opcional)</span>
          <div className="bcmp-row">
            <select className="bcmp-select" style={{ maxWidth: 150 }} value={form.mediaType}
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

        <div className="bcmp-field">
          <span className="bcmp-label">Botões (até 3) — texto e link editáveis</span>
          {form.buttons.map((b, i) => (
            <div className="bcmp-row" key={i} style={{ alignItems: 'flex-start' }}>
              <div className="bcmp-btnbox">
                <Input value={b.text} onChange={(e) => setButton(i, { text: e.target.value })} placeholder={`Texto do botão ${i + 1} (ex.: Conhecer)`} />
                <Input value={b.url || ''} onChange={(e) => setButton(i, { url: e.target.value })} placeholder="Link do botão (https://…) — opcional" />
              </div>
              <Button size="sm" variant="ghost" onClick={() => rmButton(i)}>✕</Button>
            </div>
          ))}
          {form.buttons.length < 3 && <Button size="sm" variant="secondary" onClick={addButton}>+ Adicionar botão</Button>}
          {form.buttons.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <span className="bcmp-label">Rodapé</span>
              <Input value={form.footerText} onChange={(e) => upd({ footerText: e.target.value })} placeholder="Texto do rodapé (opcional)" />
            </div>
          )}
        </div>

        <div className="bcmp-field">
          <span className="bcmp-label">Destinatários (um por linha ou separados por vírgula) — opcional ao salvar rascunho</span>
          <textarea className="bcmp-textarea" rows={4} value={form.numbersText}
            onChange={(e) => upd({ numbersText: e.target.value })}
            placeholder={'5511999999999\n5511888888888'} />
          <div className="bcmp-hint">{numbers.length} destinatário(s) · obrigatório para "Criar e lançar"</div>
        </div>

        <div className="bcmp-field">
          <span className="bcmp-label">Intervalo entre envios (segundos)</span>
          <div className="bcmp-row">
            <Input type="number" value={form.delayMin} onChange={(e) => upd({ delayMin: e.target.value })} placeholder="mín" />
            <Input type="number" value={form.delayMax} onChange={(e) => upd({ delayMax: e.target.value })} placeholder="máx" />
          </div>
        </div>

        <div className="bcmp-field">
          <span className="bcmp-label">Agendamento</span>
          <div className="bcmp-row">
            <select className="bcmp-select" style={{ maxWidth: 160 }} value={form.scheduleType}
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
      <div className="bcmp-form__col" style={{ maxWidth: 320 }}>
        <span className="bcmp-label">Pré-visualização</span>
        <div className="bcmp-preview">
          <div className="bcmp-bubble">
            {form.mediaType !== 'text' && (
              <div className="bcmp-bubble__media">
                {form.mediaType === 'image' ? '🖼️ Imagem' : form.mediaType === 'video' ? '🎬 Vídeo' : '📄 Documento'}
              </div>
            )}
            {previewText}
            {form.footerText && <div style={{ opacity: .6, fontSize: 11, marginTop: 6 }}>{form.footerText}</div>}
            {form.buttons.filter((b) => b.text?.trim()).length > 0 && (
              <div className="bcmp-bubble__btns">
                {form.buttons.filter((b) => b.text?.trim()).map((b, i) => (
                  <div key={i} className="bcmp-bubble__btn">
                    {b.url ? '🔗 ' : ''}{b.text}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="bcmp-estimate">
          Estimativa: <strong>{numbers.length} crédito(s)</strong> reservados ao lançar.
          Falhas são estornadas automaticamente.
        </div>
      </div>
    </div>
  );
}
