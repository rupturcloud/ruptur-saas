/**
 * Leads.jsx — Preparação local da lista de destinatários (BETA /beta-bubble)
 *
 * Página 100% client-side: cola/importa números, normaliza pro formato
 * 5511999999999 (só dígitos), deduplica e marca inválidos. Permite copiar os
 * válidos pro clipboard e persiste a última lista em localStorage para colar
 * depois no Disparador. Sem chamadas de backend.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { PageHeader, Button, Badge, EmptyState } from '../../ds/index.js';

const STORAGE_KEY = 'beta_leads';
const PHONE_HEADERS = ['phone', 'number', 'telefone', 'celular', 'whatsapp'];
const NAME_HEADERS = ['nome', 'name'];

const STYLES = `
  .blm-wrap { margin-top: 14px; }
  .blm-grid { display:grid; grid-template-columns:1fr 320px; gap:18px; align-items:start; }
  @media (max-width: 860px) { .blm-grid { grid-template-columns:1fr; } }
  .blm-card { background:var(--ink-0); border:1px solid var(--ink-200); border-radius:14px; padding:16px; }
  .blm-label { font-size:12px; font-weight:600; color:var(--ink-700); margin-bottom:6px; display:block; }
  .blm-hint { font-size:11px; color:var(--ink-400); margin-top:6px; }
  .blm-textarea {
    width:100%; border-radius:9px; border:1px solid var(--ink-200); padding:10px 12px;
    font-size:13px; font-family:inherit; resize:vertical; min-height:180px;
    background:var(--ink-0); color:var(--ink-900);
  }
  .blm-actions { display:flex; gap:8px; flex-wrap:wrap; margin-top:12px; }
  .blm-stats { display:flex; gap:14px; margin-top:14px; flex-wrap:wrap; }
  .blm-stat { text-align:center; min-width:64px; }
  .blm-stat__n { font-size:22px; font-weight:700; color:var(--ink-900); }
  .blm-stat__l { font-size:11px; color:var(--ink-500); }
  .blm-file {
    display:inline-flex; align-items:center; gap:8px; cursor:pointer;
    font-size:13px; color:var(--ink-700);
  }
  .blm-file input { display:none; }
  .blm-table { width:100%; border-collapse:collapse; font-size:13px; margin-top:10px; }
  .blm-table th { text-align:left; font-size:11px; color:var(--ink-500); font-weight:600; padding:6px 8px; border-bottom:1px solid var(--ink-200); }
  .blm-table td { padding:6px 8px; border-bottom:1px solid var(--ink-100); color:var(--ink-800); }
  .blm-mono { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; }
  .blm-msg { font-size:12px; margin-top:10px; }
`;

/** Normaliza um telefone bruto para apenas dígitos (remove +, espaços, ( ) -). */
function normalizePhone(raw) {
  return String(raw || '').replace(/\D+/g, '');
}

/** Considera válido um número com 10 a 15 dígitos (DDI+DDD+linha). */
function isValidPhone(digits) {
  return digits.length >= 10 && digits.length <= 15;
}

/**
 * Faz o parse de um texto livre (um por linha, vírgula ou ponto-e-vírgula),
 * retornando { validos, invalidos, duplicados } já deduplicado.
 */
function parseText(text) {
  const tokens = String(text || '').split(/[\n,;]+/).map((t) => t.trim()).filter(Boolean);
  const seen = new Set();
  const validos = [];
  let invalidos = 0;
  let duplicados = 0;
  for (const tok of tokens) {
    const d = normalizePhone(tok);
    if (!isValidPhone(d)) { invalidos += 1; continue; }
    if (seen.has(d)) { duplicados += 1; continue; }
    seen.add(d);
    validos.push(d);
  }
  return { validos, invalidos, duplicados };
}

/** Parser de CSV simples (vírgula ou ponto-e-vírgula como separador). */
function parseCsv(content) {
  const lines = String(content || '').split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return { rows: [], header: [] };
  const delim = (lines[0].match(/;/g) || []).length > (lines[0].match(/,/g) || []).length ? ';' : ',';
  const split = (line) => line.split(delim).map((c) => c.trim().replace(/^"(.*)"$/, '$1'));
  const header = split(lines[0]).map((h) => h.toLowerCase());

  const phoneIdx = header.findIndex((h) => PHONE_HEADERS.includes(h));
  const nameIdx = header.findIndex((h) => NAME_HEADERS.includes(h));

  // Sem header reconhecível: trata a primeira coluna como telefone (sem header).
  const hasHeader = phoneIdx !== -1;
  const dataLines = hasHeader ? lines.slice(1) : lines;
  const pIdx = hasHeader ? phoneIdx : 0;

  const seen = new Set();
  const rows = dataLines.map((line) => {
    const cells = split(line);
    const digits = normalizePhone(cells[pIdx]);
    const nome = nameIdx !== -1 ? (cells[nameIdx] || '') : '';
    let status;
    if (!isValidPhone(digits)) status = 'invalido';
    else if (seen.has(digits)) status = 'duplicado';
    else { seen.add(digits); status = 'valido'; }
    return { nome, telefone: digits, raw: cells[pIdx] || '', status };
  });
  return { rows, header };
}

export default function Leads() {
  const [text, setText] = useState('');
  const [csvRows, setCsvRows] = useState([]);
  const [msg, setMsg] = useState('');

  // Carrega última lista persistida no mount.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved) setText(saved);
    } catch { /* noop */ }
  }, []);

  const { validos, invalidos, duplicados } = useMemo(() => parseText(text), [text]);

  // Persiste a lista válida (string normalizada) a cada mudança.
  useEffect(() => {
    try { window.localStorage.setItem(STORAGE_KEY, validos.join('\n')); } catch { /* noop */ }
  }, [validos]);

  const onFile = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const { rows } = parseCsv(String(reader.result || ''));
      setCsvRows(rows);
      const valid = rows.filter((r) => r.status === 'valido').map((r) => r.telefone);
      if (valid.length) {
        // Mescla os válidos do CSV no textarea, deduplicando via parseText.
        setText((prev) => {
          const merged = parseText(`${prev}\n${valid.join('\n')}`).validos;
          return merged.join('\n');
        });
        setMsg(`${valid.length} número(s) válido(s) importado(s) do CSV.`);
      } else {
        setMsg('Nenhum número válido encontrado no CSV.');
      }
    };
    reader.onerror = () => setMsg('Falha ao ler o arquivo.');
    reader.readAsText(file);
    e.target.value = '';
  }, []);

  const copyValid = useCallback(async () => {
    if (validos.length === 0) { setMsg('Não há números válidos para copiar.'); return; }
    try {
      await navigator.clipboard.writeText(validos.join(','));
      setMsg(`${validos.length} número(s) copiado(s) (separados por vírgula).`);
    } catch {
      setMsg('Não foi possível copiar — copie manualmente do campo acima.');
    }
  }, [validos]);

  const clearAll = useCallback(() => {
    setText('');
    setCsvRows([]);
    setMsg('Lista limpa.');
    try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* noop */ }
  }, []);

  const statusTone = { valido: 'ok', duplicado: 'warn', invalido: 'danger' };
  const statusLabel = { valido: 'Válido', duplicado: 'Duplicado', invalido: 'Inválido' };

  return (
    <div className="blm-wrap">
      <style>{STYLES}</style>
      <PageHeader
        crumbs={['Ruptur Beta', 'Leads']}
        title="Leads"
        sub="Prepare e limpe sua lista de números aqui; depois copie os válidos para colar no Disparador."
      />

      <div className="blm-grid">
        {/* Coluna principal — entrada */}
        <div className="blm-card">
          <span className="blm-label">Cole os números (um por linha, ou separados por vírgula/ponto-e-vírgula)</span>
          <textarea
            className="blm-textarea"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={'5511999999999\n+55 (11) 98888-8888\n5511777777777'}
          />
          <div className="blm-hint">
            Os números são normalizados para só dígitos (formato 5511999999999) e a lista é deduplicada automaticamente.
          </div>

          <div className="blm-actions">
            <Button size="sm" onClick={copyValid}>Copiar números válidos</Button>
            <Button size="sm" variant="ghost" onClick={clearAll}>Limpar</Button>
            <label className="blm-file">
              <span className="btn btn-secondary btn-sm">Importar CSV</span>
              <input type="file" accept=".csv,text/csv" onChange={onFile} />
            </label>
          </div>

          {msg && <div className="blm-msg" style={{ color: 'var(--ink-600)' }}>{msg}</div>}

          {csvRows.length > 0 && (
            <table className="blm-table">
              <thead>
                <tr><th>Nome</th><th>Telefone</th><th>Status</th></tr>
              </thead>
              <tbody>
                {csvRows.slice(0, 100).map((r, i) => (
                  <tr key={i}>
                    <td>{r.nome || '—'}</td>
                    <td className="blm-mono">{r.telefone || r.raw || '—'}</td>
                    <td><Badge tone={statusTone[r.status]}>{statusLabel[r.status]}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {csvRows.length > 100 && (
            <div className="blm-hint">Mostrando 100 de {csvRows.length} linhas do CSV.</div>
          )}
        </div>

        {/* Coluna lateral — resumo */}
        <div className="blm-card">
          <span className="blm-label">Resumo da lista</span>
          {validos.length === 0 && invalidos === 0 && duplicados === 0 ? (
            <EmptyState
              icon="leads"
              title="Lista vazia"
              text="Cole números ou importe um CSV para começar."
            />
          ) : (
            <div className="blm-stats">
              <div className="blm-stat"><div className="blm-stat__n">{validos.length}</div><div className="blm-stat__l">Válidos</div></div>
              <div className="blm-stat"><div className="blm-stat__n">{duplicados}</div><div className="blm-stat__l">Duplicados</div></div>
              <div className="blm-stat"><div className="blm-stat__n">{invalidos}</div><div className="blm-stat__l">Inválidos</div></div>
            </div>
          )}
          <div className="blm-hint" style={{ marginTop: 14 }}>
            A lista de válidos fica salva neste navegador e sobrevive a recarregar a página.
          </div>
        </div>
      </div>
    </div>
  );
}
