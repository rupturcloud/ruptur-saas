/**
 * Monitor.jsx — Monitor de campanhas/disparos (BETA /beta-bubble)
 *
 * Lista as campanhas do tenant com status e métricas, atualizando via polling
 * (8s) e com botão de refresh manual. Permite Pausar/Parar/Lançar por linha
 * conforme o status. Tudo via campaignsApi (gateway /api/campaigns/*).
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { PageHeader, Button, Badge, EmptyState } from '../../ds/index.js';
import { campaignsApi } from '../../api/campaigns.api.js';

const POLL_MS = 8000;

const STATUS_LABEL = {
  draft: 'Rascunho', scheduled: 'Agendada', sending: 'Enviando', active: 'Enviando',
  paused: 'Pausada', completed: 'Concluída', failed: 'Falhou', stopped: 'Parada', cancelled: 'Cancelada',
};
const STATUS_TONE = {
  draft: 'neutral', scheduled: 'brand', sending: 'brand', active: 'brand',
  paused: 'warn', completed: 'ok', failed: 'danger', stopped: 'neutral', cancelled: 'neutral',
};

const STYLES = `
  .bmon-wrap { margin-top: 14px; }
  .bmon-bar { display:flex; align-items:center; gap:12px; margin-bottom:12px; }
  .bmon-ago { font-size:12px; color:var(--ink-500); }
  .bmon-err { color:#EF4444; font-size:13px; margin-bottom:12px; }
  .bmon-card { background:var(--ink-0); border:1px solid var(--ink-200); border-radius:14px; padding:0; overflow:hidden; }
  .bmon-table { width:100%; border-collapse:collapse; font-size:13px; }
  .bmon-table th { text-align:left; font-size:11px; color:var(--ink-500); font-weight:600; padding:10px 14px; border-bottom:1px solid var(--ink-200); }
  .bmon-table td { padding:10px 14px; border-bottom:1px solid var(--ink-100); color:var(--ink-800); vertical-align:middle; }
  .bmon-table tr:last-child td { border-bottom:none; }
  .bmon-name { font-weight:600; color:var(--ink-900); }
  .bmon-metrics { display:flex; gap:14px; }
  .bmon-metric { text-align:center; }
  .bmon-metric__n { font-size:15px; font-weight:700; color:var(--ink-900); }
  .bmon-metric__l { font-size:10px; color:var(--ink-500); }
  .bmon-row-actions { display:flex; gap:6px; justify-content:flex-end; }
`;

export default function Monitor() {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastSync, setLastSync] = useState(null);
  const [ago, setAgo] = useState(0);
  const lastSyncRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const data = await campaignsApi.list({ limit: 50 });
      setCampaigns(data.campaigns || data || []);
      setError('');
      const now = Date.now();
      lastSyncRef.current = now;
      setLastSync(now);
    } catch (e) {
      // Não quebra o polling: apenas mostra o erro e mantém a lista anterior.
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Polling + carga inicial.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  // Tick do indicador "atualizado há Xs".
  useEffect(() => {
    const id = setInterval(() => {
      if (lastSyncRef.current) setAgo(Math.round((Date.now() - lastSyncRef.current) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const doAction = useCallback(async (id, action) => {
    setError('');
    try {
      await campaignsApi[action](id);
      await load();
    } catch (e) {
      setError(e.message);
    }
  }, [load]);

  return (
    <div className="bmon-wrap">
      <style>{STYLES}</style>
      <PageHeader
        crumbs={['Ruptur Beta', 'Monitor']}
        title="Monitor de disparos"
        sub="Acompanhe o status e as métricas das campanhas em tempo quase real."
      />

      <div className="bmon-bar">
        <Button size="sm" onClick={load}>Atualizar agora</Button>
        {lastSync && <span className="bmon-ago">Atualizado há {ago}s</span>}
      </div>

      {error && <div className="bmon-err">{error}</div>}

      {loading ? (
        <div style={{ padding: 48, textAlign: 'center', color: 'var(--ink-500)' }}>Carregando campanhas…</div>
      ) : campaigns.length === 0 ? (
        <EmptyState
          icon="broadcast"
          title="Nenhuma campanha para monitorar"
          text="Quando você lançar disparos, eles aparecerão aqui com status e métricas."
        />
      ) : (
        <div className="bmon-card">
          <table className="bmon-table">
            <thead>
              <tr>
                <th>Campanha</th>
                <th>Status</th>
                <th>Métricas</th>
                <th style={{ textAlign: 'right' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => {
                const m = c.metrics || {};
                const status = c.status || 'draft';
                const isSending = status === 'sending' || status === 'active';
                const canStop = isSending || status === 'paused';
                const canLaunch = status === 'draft' || status === 'scheduled';
                return (
                  <tr key={c.id}>
                    <td><span className="bmon-name">{c.name || '—'}</span></td>
                    <td><Badge tone={STATUS_TONE[status] || 'neutral'}>{STATUS_LABEL[status] || status}</Badge></td>
                    <td>
                      <div className="bmon-metrics">
                        <div className="bmon-metric"><div className="bmon-metric__n">{m.totalRecipients ?? 0}</div><div className="bmon-metric__l">Total</div></div>
                        <div className="bmon-metric"><div className="bmon-metric__n">{m.sentCount ?? 0}</div><div className="bmon-metric__l">Enviadas</div></div>
                        <div className="bmon-metric"><div className="bmon-metric__n">{m.readCount ?? 0}</div><div className="bmon-metric__l">Lidas</div></div>
                        <div className="bmon-metric"><div className="bmon-metric__n">{m.failedCount ?? 0}</div><div className="bmon-metric__l">Falhas</div></div>
                      </div>
                    </td>
                    <td>
                      <div className="bmon-row-actions">
                        {canLaunch && <Button size="sm" onClick={() => doAction(c.id, 'launch')}>Lançar</Button>}
                        {isSending && <Button size="sm" variant="secondary" onClick={() => doAction(c.id, 'pause')}>Pausar</Button>}
                        {canStop && <Button size="sm" variant="ghost" onClick={() => doAction(c.id, 'stop')}>Parar</Button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
