/**
 * Inbox — Caixa de entrada rica estilo Chatwoot/Paperlayer (Tier A).
 *
 * Layout de 4 regiões:
 *   1. Rail de filtros  — seletor de instância · Minhas/Não atribuídas/Todas · Etiquetas · Grupos · status tempo real
 *   2. Lista de conversas — busca + chats com avatar, prévia, hora, não-lidas, tags
 *   3. Thread            — cabeçalho do contato + bolhas + barra de envio
 *   4. Painel do lead    — dados do contato + atribuição + tags + status do ticket
 *
 * Backend: inbox.api.js → gateway /api/inbox/* → UAZAPI (/chat/find, /message/find,
 * /send/text, /message/markread, /chat/editLead, /chat/labels, /group/list, /sse).
 * O token da instância nunca chega ao frontend — o gateway resolve por tenant.
 *
 * Tempo real: SSE (EventSource) quando disponível + polling de 20s como rede de
 * segurança. Se o SSE cair, o polling mantém a lista fresca — nada quebra.
 *
 * Semântica de atribuição (Tier A): o Ruptur é dono da atribuição via editLead.
 * "Atribuir a mim" grava lead_assignedAttendant_id = user.id; "Minhas" filtra por
 * esse mesmo id; "Não atribuídas" filtra por id vazio. Consistente internamente,
 * independente dos atendentes nativos do UAZAPI.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { PageHeader } from '../../ds/index.js';
import { inboxApi } from '../../api/inbox.api.js';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { useInboxBadge } from '../../contexts/InboxBadgeContext.jsx';

// ---------------------------------------------------------------------------
// Estilos — escopo local, paleta V0 (var(--ink-*) clara + thread escuro WhatsApp)
// ---------------------------------------------------------------------------
const STYLES = `
  .ibx {
    display: flex;
    height: calc(100vh - 150px);
    min-height: 460px;
    border: 1px solid var(--ink-200);
    border-radius: 14px;
    overflow: hidden;
    background: var(--ink-0);
    margin-top: 14px;
  }

  /* ── 1. Rail de filtros ── */
  .ibx-rail {
    width: 212px;
    flex-shrink: 0;
    border-right: 1px solid var(--ink-200);
    display: flex;
    flex-direction: column;
    background: var(--ink-50, #F7F8FA);
    overflow-y: auto;
  }
  .ibx-rail-inst {
    padding: 12px 12px 10px;
    border-bottom: 1px solid var(--ink-200);
    flex-shrink: 0;
  }
  .ibx-rail-inst select {
    width: 100%;
    padding: 7px 9px;
    border-radius: 8px;
    border: 1px solid var(--ink-200);
    font-size: 12px;
    font-weight: 600;
    color: var(--ink-800);
    background: var(--ink-0);
    cursor: pointer;
    outline: none;
  }
  .ibx-rail-inst select:focus { border-color: var(--brand-400, #FF8A65); }
  .ibx-rail-instname {
    font-size: 12.5px;
    font-weight: 700;
    color: var(--ink-800);
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .ibx-rail-section { padding: 10px 8px 4px; }
  .ibx-rail-title {
    font-size: 10px;
    font-weight: 800;
    letter-spacing: .06em;
    text-transform: uppercase;
    color: var(--ink-400);
    padding: 4px 8px 6px;
  }
  .ibx-filter {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 8px 10px;
    margin: 1px 0;
    border-radius: 8px;
    cursor: pointer;
    font-size: 12.5px;
    font-weight: 600;
    color: var(--ink-700);
    transition: background .12s, color .12s;
    user-select: none;
  }
  .ibx-filter:hover { background: var(--ink-100); }
  .ibx-filter.active { background: var(--brand-500); color: #fff; }
  .ibx-filter .ic { width: 15px; height: 15px; flex-shrink: 0; }
  .ibx-filter .lbl { flex: 1; }
  .ibx-filter .count {
    font-size: 10.5px;
    font-weight: 800;
    background: var(--ink-200);
    color: var(--ink-600);
    border-radius: 999px;
    padding: 1px 7px;
    min-width: 18px;
    text-align: center;
  }
  .ibx-filter.active .count { background: rgba(255,255,255,.25); color: #fff; }

  .ibx-label {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 6px 10px;
    margin: 1px 0;
    border-radius: 8px;
    cursor: pointer;
    font-size: 12px;
    color: var(--ink-700);
    transition: background .12s;
  }
  .ibx-label:hover { background: var(--ink-100); }
  .ibx-label.active { background: var(--brand-50, #FFF4F1); color: var(--brand-600, #E0531F); font-weight: 700; }
  .ibx-label .dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
  .ibx-label .lbl { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  .ibx-rail-empty { font-size: 11px; color: var(--ink-400); padding: 4px 10px 8px; }

  .ibx-live {
    margin-top: auto;
    padding: 10px 12px;
    border-top: 1px solid var(--ink-200);
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 11px;
    color: var(--ink-500);
    flex-shrink: 0;
  }
  .ibx-live .pulse { width: 8px; height: 8px; border-radius: 50%; background: var(--ink-300); flex-shrink: 0; }
  .ibx-live.on .pulse { background: #29C467; box-shadow: 0 0 0 0 rgba(41,196,103,.6); animation: ibx-pulse 1.8s infinite; }
  @keyframes ibx-pulse { 0% { box-shadow: 0 0 0 0 rgba(41,196,103,.5); } 70% { box-shadow: 0 0 0 6px rgba(41,196,103,0); } 100% { box-shadow: 0 0 0 0 rgba(41,196,103,0); } }

  /* ── 2. Lista de conversas ── */
  .ibx-list {
    width: 318px;
    flex-shrink: 0;
    border-right: 1px solid var(--ink-200);
    display: flex;
    flex-direction: column;
    background: var(--ink-0);
  }
  .ibx-list-head {
    padding: 12px 14px;
    border-bottom: 1px solid var(--ink-200);
    flex-shrink: 0;
  }
  .ibx-search {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 7px 10px;
    background: var(--ink-100);
    border-radius: 9px;
    border: 1px solid transparent;
    transition: border-color .15s, background .15s;
  }
  .ibx-search:focus-within { border-color: var(--brand-300, #FFBFAB); background: var(--ink-0); }
  .ibx-search input {
    flex: 1; border: none; background: transparent; outline: none;
    font-size: 12.5px; color: var(--ink-900);
  }
  .ibx-search input::placeholder { color: var(--ink-400); }

  .ibx-chats { flex: 1; overflow-y: auto; }
  .ibx-chat {
    display: flex; align-items: flex-start; gap: 10px;
    padding: 11px 14px; cursor: pointer;
    border-bottom: 1px solid var(--ink-100);
    transition: background .1s;
  }
  .ibx-chat:hover { background: var(--ink-50); }
  .ibx-chat.active { background: var(--brand-50, #FFF4F1); box-shadow: inset 2px 0 0 var(--brand-500); }
  .ibx-ava {
    width: 38px; height: 38px; border-radius: 50%;
    background: linear-gradient(135deg, var(--brand-500), #FFB088);
    color: #fff; display: flex; align-items: center; justify-content: center;
    font-weight: 800; font-size: 12.5px; flex-shrink: 0;
  }
  .ibx-ava.group { background: linear-gradient(135deg, #5B6CF0, #9B8CFF); }
  .ibx-chat-info { flex: 1; min-width: 0; }
  .ibx-chat-name {
    font-weight: 600; font-size: 12.8px; color: var(--ink-900);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .ibx-chat-preview {
    font-size: 11.5px; color: var(--ink-500); margin-top: 2px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .ibx-chat-tags { display: flex; gap: 4px; margin-top: 4px; flex-wrap: wrap; }
  .ibx-tag {
    font-size: 9.5px; font-weight: 700; padding: 1px 6px;
    border-radius: 999px; background: var(--ink-100); color: var(--ink-600);
    white-space: nowrap;
  }
  .ibx-tag.assigned { background: var(--brand-50, #FFF4F1); color: var(--brand-600, #E0531F); }
  .ibx-chat-meta { display: flex; flex-direction: column; align-items: flex-end; gap: 5px; flex-shrink: 0; }
  .ibx-chat-time { font-size: 10.5px; color: var(--ink-400); font-variant-numeric: tabular-nums; }
  .ibx-chat-badge {
    min-width: 18px; height: 18px; padding: 0 5px; border-radius: 999px;
    background: var(--brand-500); color: #fff; font-size: 10px; font-weight: 800;
    display: flex; align-items: center; justify-content: center;
  }

  /* ── 3. Thread ── */
  .ibx-thread { flex: 1; min-width: 0; display: flex; flex-direction: column; background: #0B141A; }
  .ibx-thread-head {
    padding: 11px 16px; background: #1A232A;
    border-bottom: 1px solid rgba(255,255,255,.07);
    display: flex; align-items: center; gap: 11px; flex-shrink: 0;
  }
  .ibx-thread-head .meta { flex: 1; min-width: 0; }
  .ibx-thread-head .name { font-weight: 700; font-size: 13.5px; color: rgba(255,255,255,.92); }
  .ibx-thread-head .phone { font-size: 11px; color: rgba(255,255,255,.4); font-family: ui-monospace, monospace; margin-top: 1px; }
  .ibx-iconbtn {
    width: 32px; height: 32px; border-radius: 8px; border: none;
    background: rgba(255,255,255,.06); color: rgba(255,255,255,.7);
    display: flex; align-items: center; justify-content: center; cursor: pointer;
    transition: background .12s; flex-shrink: 0;
  }
  .ibx-iconbtn:hover { background: rgba(255,255,255,.12); }
  .ibx-iconbtn.on { background: var(--brand-500); color: #fff; }

  .ibx-msgs {
    flex: 1; overflow-y: auto; padding: 16px 18px;
    display: flex; flex-direction: column; gap: 5px;
    background-image: linear-gradient(rgba(11,20,26,.92), rgba(11,20,26,.92));
  }
  .ibx-bubble {
    padding: 7px 11px 5px; border-radius: 10px; font-size: 13px; line-height: 1.45;
    max-width: 68%; word-break: break-word; position: relative; animation: ibx-in .18s ease;
  }
  @keyframes ibx-in { from { opacity: 0; transform: translateY(3px); } }
  .ibx-bubble.sent { background: #005C4B; color: #fff; align-self: flex-end; border-bottom-right-radius: 3px; }
  .ibx-bubble.received { background: #1F2C33; color: rgba(255,255,255,.92); align-self: flex-start; border-bottom-left-radius: 3px; }
  .ibx-bubble .ts { font-size: 9.5px; color: rgba(255,255,255,.4); margin-top: 3px; text-align: right; }
  .ibx-daysep { align-self: center; font-size: 10.5px; color: rgba(255,255,255,.45); background: rgba(255,255,255,.06); padding: 3px 10px; border-radius: 999px; margin: 6px 0; }

  .ibx-reply {
    padding: 12px 16px; background: #1A232A;
    border-top: 1px solid rgba(255,255,255,.07);
    display: flex; align-items: center; gap: 10px; flex-shrink: 0;
  }
  .ibx-reply input {
    flex: 1; padding: 9px 14px; border-radius: 999px;
    border: 1px solid rgba(255,255,255,.1); background: rgba(255,255,255,.05);
    color: rgba(255,255,255,.92); font-size: 13px; outline: none; transition: border-color .15s;
  }
  .ibx-reply input:focus { border-color: rgba(255,106,61,.5); }
  .ibx-reply input::placeholder { color: rgba(255,255,255,.3); }
  .ibx-send {
    width: 36px; height: 36px; border-radius: 50%; background: var(--brand-500, #FF6A3D);
    border: none; display: flex; align-items: center; justify-content: center;
    cursor: pointer; flex-shrink: 0; transition: opacity .15s, transform .1s;
  }
  .ibx-send:disabled { opacity: .4; cursor: not-allowed; }
  .ibx-send:not(:disabled):hover { opacity: .88; }
  .ibx-send:not(:disabled):active { transform: scale(.92); }

  /* ── 4. Painel do lead ── */
  .ibx-panel {
    width: 290px; flex-shrink: 0; border-left: 1px solid var(--ink-200);
    background: var(--ink-0); display: flex; flex-direction: column; overflow-y: auto;
  }
  .ibx-panel-hero {
    padding: 22px 18px 18px; text-align: center;
    border-bottom: 1px solid var(--ink-200);
  }
  .ibx-panel-hero .ava {
    width: 64px; height: 64px; border-radius: 50%; margin: 0 auto 10px;
    background: linear-gradient(135deg, var(--brand-500), #FFB088);
    color: #fff; display: flex; align-items: center; justify-content: center;
    font-weight: 800; font-size: 22px;
  }
  .ibx-panel-hero .ava.group { background: linear-gradient(135deg, #5B6CF0, #9B8CFF); }
  .ibx-panel-hero .name { font-weight: 700; font-size: 14.5px; color: var(--ink-900); }
  .ibx-panel-hero .phone { font-size: 11.5px; color: var(--ink-500); font-family: ui-monospace, monospace; margin-top: 3px; }
  .ibx-panel-sec { padding: 14px 16px; border-bottom: 1px solid var(--ink-100); }
  .ibx-panel-sec h4 {
    margin: 0 0 9px; font-size: 10px; font-weight: 800; letter-spacing: .06em;
    text-transform: uppercase; color: var(--ink-400);
  }
  .ibx-act {
    width: 100%; padding: 8px 12px; border-radius: 8px; font-size: 12.5px; font-weight: 600;
    border: 1px solid var(--ink-200); background: var(--ink-0); color: var(--ink-800);
    cursor: pointer; transition: background .12s, border-color .12s; text-align: left;
    display: flex; align-items: center; gap: 8px;
  }
  .ibx-act:hover { background: var(--ink-50); border-color: var(--ink-300); }
  .ibx-act.primary { background: var(--brand-500); color: #fff; border-color: var(--brand-500); justify-content: center; }
  .ibx-act.primary:hover { opacity: .9; background: var(--brand-500); }
  .ibx-act.danger { color: #D14343; }
  .ibx-act + .ibx-act { margin-top: 7px; }
  .ibx-assigned-now {
    font-size: 12px; color: var(--ink-700); background: var(--brand-50, #FFF4F1);
    border: 1px solid var(--brand-200, #FFD3C4); border-radius: 8px; padding: 8px 10px;
    display: flex; align-items: center; gap: 7px; margin-bottom: 8px;
  }
  .ibx-tagrow { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 9px; }
  .ibx-tagrow:empty { display: none; }
  .ibx-tagchip {
    font-size: 11px; font-weight: 600; padding: 3px 8px; border-radius: 999px;
    background: var(--ink-100); color: var(--ink-700); display: flex; align-items: center; gap: 5px;
  }
  .ibx-tagchip button { border: none; background: none; color: var(--ink-400); cursor: pointer; padding: 0; font-size: 13px; line-height: 1; }
  .ibx-tagchip button:hover { color: #D14343; }
  .ibx-taginput {
    width: 100%; padding: 7px 10px; border-radius: 8px; border: 1px solid var(--ink-200);
    font-size: 12px; color: var(--ink-900); outline: none; background: var(--ink-0);
  }
  .ibx-taginput:focus { border-color: var(--brand-400, #FF8A65); }
  .ibx-statusrow { display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--ink-700); }
  .ibx-dot-st { width: 9px; height: 9px; border-radius: 50%; }
  .ibx-feedback { font-size: 11px; padding: 6px 16px; color: var(--brand-600, #E0531F); flex-shrink: 0; min-height: 0; }

  /* ── Estados vazios / spinner ── */
  .ibx-empty {
    flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 10px; padding: 40px; text-align: center; color: rgba(255,255,255,.28);
  }
  .ibx-empty.light { color: var(--ink-400); }
  .ibx-empty .icon { font-size: 38px; }
  .ibx-empty .label { font-size: 13px; line-height: 1.5; white-space: pre-line; }
  .ibx-spin {
    display: inline-block; width: 16px; height: 16px;
    border: 2px solid rgba(255,106,61,.2); border-top-color: var(--brand-500, #FF6A3D);
    border-radius: 50%; animation: ibx-rot .75s linear infinite;
  }
  @keyframes ibx-rot { to { transform: rotate(360deg); } }
  .ibx-banner {
    margin: 12px 12px 0; padding: 10px 12px; border-radius: 8px; font-size: 12px; line-height: 1.4;
    background: rgba(255,106,61,.1); border: 1px solid rgba(255,106,61,.3); color: var(--brand-600, #E0531F);
  }

  @media (max-width: 1080px) {
    .ibx-panel { display: none; }
    .ibx-panel.force { display: flex; position: absolute; right: 0; top: 0; bottom: 0; box-shadow: -8px 0 24px rgba(0,0,0,.12); z-index: 5; }
  }
  @media (max-width: 860px) {
    .ibx-rail { width: 64px; }
    .ibx-rail .lbl, .ibx-rail-title, .ibx-rail-instname span, .ibx-live span { display: none; }
    .ibx-list { width: 280px; }
  }

  /* Mobile-first: telas pequenas mostram UMA região por vez (lista ↔ thread). */
  .ibx-back { display: none; }
  @media (max-width: 640px) {
    .ibx { height: calc(100vh - 116px); border-radius: 10px; margin-top: 8px; }
    .ibx-rail { width: 46px; }
    .ibx-rail .lbl, .ibx-rail-title, .ibx-rail-instname span, .ibx-live span { display: none; }
    .ibx-list { flex: 1; width: auto; min-width: 0; }
    .ibx-thread { position: absolute; inset: 0; z-index: 8; display: none; }
    .ibx.has-active .ibx-rail, .ibx.has-active .ibx-list { display: none; }
    .ibx.has-active .ibx-thread { display: flex; }
    .ibx.has-active .ibx-back { display: inline-flex; }
  }
`;

// ---------------------------------------------------------------------------
// Utilitários puros
// ---------------------------------------------------------------------------
function fmtTime(ts) {
  if (!ts) return '';
  const ms = ts > 1e10 ? ts : ts * 1000;
  const d = new Date(ms);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
  const yest = new Date(now); yest.setDate(now.getDate() - 1);
  if (d.toDateString() === yest.toDateString()) return 'Ontem';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function dayLabel(ts) {
  if (!ts) return '';
  const ms = ts > 1e10 ? ts : ts * 1000;
  const d = new Date(ms);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return 'Hoje';
  const yest = new Date(now); yest.setDate(now.getDate() - 1);
  if (d.toDateString() === yest.toDateString()) return 'Ontem';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
}

function chatName(chat) {
  return (
    chat.lead_name || chat.wa_contactName || chat.wa_name || chat.name ||
    (chat.wa_chatid || chat.wa_fastid || '').replace('@s.whatsapp.net', '').replace('@g.us', '') ||
    '?'
  );
}

function initials(name) {
  const parts = String(name || '?').trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return String(name || '?').slice(0, 2).toUpperCase();
}

function chatPhone(chat) {
  return (chat.wa_chatid || chat.wa_fastid || '').replace('@s.whatsapp.net', '').replace('@g.us', '');
}

function lastMsgPreview(chat) {
  const txt = chat.wa_lastMessageText || chat.wa_lastMessageTextVote || '';
  if (txt) return txt.length > 46 ? txt.slice(0, 46) + '…' : txt;
  const type = chat.wa_lastMessageType || '';
  if (type.includes('image')) return '📷 Imagem';
  if (type.includes('audio') || type.includes('ptt')) return '🎤 Áudio';
  if (type.includes('video')) return '🎥 Vídeo';
  if (type.includes('document')) return '📄 Documento';
  return '';
}

function msgText(msg) {
  const m = msg.message || msg.content || msg;
  return (
    msg.text || 
    m.text ||
    m.body ||
    msg.body ||
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.documentMessage?.title ||
    m.buttonsResponseMessage?.selectedDisplayText ||
    m.listResponseMessage?.title ||
    msg.wa_lastMessageText ||
    (msg.messageType === 'audioMessage' || msg.messageType === 'pttMessage' ? '🎤 Áudio' : '') ||
    (msg.messageType === 'imageMessage' ? '📷 Imagem' : '') ||
    (msg.messageType === 'videoMessage' ? '🎥 Vídeo' : '') ||
    (msg.messageType === 'documentMessage' ? '📄 Documento' : '') ||
    '[mensagem]'
  );
}

function isFromMe(msg) {
  return msg.key?.fromMe === true || msg.fromMe === true || msg.wa_fromMe === true;
}

function msgTs(msg) {
  return msg.messageTimestamp || msg.timestamp || msg.wa_timestamp || 0;
}

function msgId(msg) {
  return msg.messageid || msg.id || msg.key?.id || null;
}

function normalizeTags(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter(Boolean);
  return String(raw).split(',').map(s => s.trim()).filter(Boolean);
}

/** Monta o objeto de filtros para /chat/find a partir do estado da UI */
function buildFilters({ tab, label, tag, groupsOnly, userId }) {
  const f = {};
  if (groupsOnly) f.wa_isGroup = true;
  if (label) f.wa_label = label;
  if (tag) f.lead_tags = tag;
  if (tab === 'mine' && userId) f.lead_assignedAttendant_id = userId;
  else if (tab === 'unassigned') f.lead_assignedAttendant_id = '';
  return f;
}

function Spinner({ dark }) {
  return <span className="ibx-spin" style={dark ? undefined : { borderColor: 'rgba(255,106,61,.2)' }} />;
}

// ---------------------------------------------------------------------------
// Subcomponentes de apresentação
// ---------------------------------------------------------------------------
function ChatRow({ chat, active, currentUserId, onClick }) {
  const name = chatName(chat);
  const isGroup = chat.wa_isGroup === true;
  const ts = chat.wa_lastMsgTimestamp || chat.wa_timestamp;
  const unread = chat.wa_unreadCount || 0;
  const tags = normalizeTags(chat.lead_tags);
  const mine = chat.lead_assignedAttendant_id && chat.lead_assignedAttendant_id === currentUserId;

  return (
    <div className={`ibx-chat${active ? ' active' : ''}`} onClick={onClick}>
      <div className={`ibx-ava${isGroup ? ' group' : ''}`}>{isGroup ? '👥' : initials(name)}</div>
      <div className="ibx-chat-info">
        <div className="ibx-chat-name">{name}</div>
        {lastMsgPreview(chat) && <div className="ibx-chat-preview">{lastMsgPreview(chat)}</div>}
        {(mine || tags.length > 0) && (
          <div className="ibx-chat-tags">
            {mine && <span className="ibx-tag assigned">você</span>}
            {tags.slice(0, 2).map(t => <span key={t} className="ibx-tag">{t}</span>)}
          </div>
        )}
      </div>
      <div className="ibx-chat-meta">
        {ts ? <div className="ibx-chat-time">{fmtTime(ts)}</div> : null}
        {unread > 0 && <div className="ibx-chat-badge">{unread > 99 ? '99+' : unread}</div>}
      </div>
    </div>
  );
}

function Bubble({ msg }) {
  const sent = isFromMe(msg);
  const ts = msgTs(msg);
  return (
    <div className={`ibx-bubble ${sent ? 'sent' : 'received'}`}>
      <div>{msgText(msg)}</div>
      {ts ? <div className="ts">{fmtTime(ts)}</div> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------
export default function Inbox() {
  const { authReady, user, tenantId } = useAuth();
  const { setUnread } = useInboxBadge();
  const userId = user?.id || null;

  // Instâncias
  const [instances, setInstances] = useState([]);
  const [instanceKey, setInstanceKey] = useState(null);

  // Filtros do rail
  const [tab, setTab] = useState('all');          // all | mine | unassigned
  const [labels, setLabels] = useState([]);
  const [activeLabel, setActiveLabel] = useState(null);
  const [activeTag, setActiveTag] = useState('');
  const [groupsOnly, setGroupsOnly] = useState(false);

  // Conversas
  const [chats, setChats] = useState([]);
  const [chatsLoading, setChatsLoading] = useState(false);
  const [instanceExpired, setInstanceExpired] = useState(false);
  const [search, setSearch] = useState('');

  // Chat ativo + mensagens
  const [activeChat, setActiveChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [msgsLoading, setMsgsLoading] = useState(false);

  // Envio
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);

  // Painel do lead
  const [showPanel, setShowPanel] = useState(true);
  const [tagDraft, setTagDraft] = useState('');
  const [savingLead, setSavingLead] = useState(false);
  const [feedback, setFeedback] = useState('');

  // Tempo real
  const [sseLive, setSseLive] = useState(false);

  // Refs estáveis (evitam re-subscrição do SSE e closures velhos)
  const bottomRef = useRef(null);
  const activeChatRef = useRef(null);
  const reloadChatsRef = useRef(null);
  const loadMessagesRef = useRef(null);

  // -- Loaders --------------------------------------------------------------
  const loadInstances = useCallback(async () => {
    try {
      const { instances: rows = [] } = await inboxApi.listInstances();
      // Sempre adicionamos a opção de "Todas as Instâncias" (Global) no topo
      const allRows = [{ key: 'all', id: 'all', name: 'Todas as Instâncias', status: 'connected', phone: '' }, ...rows];
      setInstances(allRows);
      
      const savedKey = window.localStorage.getItem('inbox_last_instance');
      // Resolve compatibilidade entre id e key
      const targetKey = savedKey && allRows.find(r => (r.key || r.id) === savedKey) ? savedKey : 'all';
      setInstanceKey(targetKey);
    } catch (e) {
      console.warn('[Inbox] listInstances falhou:', e.message);
    }
  }, []);

  // Troca de instância pelo usuário: além do key, reseta o contexto dependente
  // (chat ativo, mensagens, etiqueta). Fica fora do efeito para não disparar
  // setState síncrono dentro de useEffect (cascata de renders).
  const changeInstance = useCallback((key) => {
    setInstanceKey(key);
    window.localStorage.setItem('inbox_last_instance', key);
    setActiveChat(null);
    setMessages([]);
    setActiveLabel(null);
    setActiveTag('');
  }, []);

  const loadLabels = useCallback(async (key) => {
    if (!key) return;
    try {
      const { labels: rows = [] } = await inboxApi.getLabels(key);
      setLabels(Array.isArray(rows) ? rows : []);
    } catch (e) {
      console.warn('[Inbox] getLabels falhou:', e.message);
      setLabels([]);
    }
  }, []);

  const reloadChats = useCallback(async (silent) => {
    if (!instanceKey) return;
    if (!silent) { setChatsLoading(true); setInstanceExpired(false); }
    try {
      const filters = buildFilters({ tab, label: activeLabel, tag: activeTag, groupsOnly, userId });
      
      const res = await inboxApi.findChats(instanceKey, { filters, limit: 60 });
      if (res.freeTrialExpired || res.error === 'INSTANCE_EXPIRED') {
        setInstanceExpired(true); setChats([]); setUnread(0); return;
      }
      
      let rows = res.chats || [];
      rows = rows.map(chat => {
        const sourceKey = chat._sourceInstance || instanceKey;
        const i = instances.find(inst => (inst.key || inst.id) === sourceKey);
        return { ...chat, _sourceInstance: i || sourceKey };
      });

      setChats(rows);
      setUnread(rows.reduce((s, c) => s + (c.wa_unreadCount || 0), 0));
    } catch (e) {
      console.warn('[Inbox] findChats falhou:', e.message);
      if (!silent) setChats([]);
    } finally {
      if (!silent) setChatsLoading(false);
    }
  }, [instanceKey, tab, activeLabel, activeTag, groupsOnly, userId, setUnread, instances]);

  const loadMessages = useCallback(async (chat, silent) => {
    if (!chat) return;
    const targetKey = chat._sourceInstance?.key || chat._sourceInstance?.id || instanceKey;
    if (!targetKey || targetKey === 'all') return;
    
    const chatId = chat.wa_chatid || chat.wa_fastid;
    if (!chatId) return;
    if (!silent) { setMsgsLoading(true); setMessages([]); }
    try {
      const res = await inboxApi.findMessages(targetKey, chatId, { limit: 80 });
      const rows = (res.messages || []).slice().sort((a, b) => msgTs(a) - msgTs(b));
      setMessages(rows);
      // markread best-effort para mensagens recebidas, só se houver não-lidas
      if (!silent && (chat.wa_unreadCount || 0) > 0) {
        const ids = rows.filter(m => !isFromMe(m)).map(msgId).filter(Boolean);
        if (ids.length) inboxApi.markRead(targetKey, ids).catch(() => {});
      }
    } catch (e) {
      console.warn('[Inbox] findMessages falhou:', e.message);
      if (!silent) setMessages([]);
    } finally {
      if (!silent) setMsgsLoading(false);
    }
  }, [instanceKey]);

  // Mantém refs apontando para os loaders atuais
  useEffect(() => { reloadChatsRef.current = reloadChats; loadMessagesRef.current = loadMessages; }, [reloadChats, loadMessages]);
  useEffect(() => { activeChatRef.current = activeChat; }, [activeChat]);

  // Carrega instâncias quando auth estiver pronto OU ao trocar de tenant (tenantId)
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (authReady) loadInstances(); }, [authReady, tenantId, loadInstances]);

  // Instância mudou → carrega etiquetas dela (o reset de contexto vive em changeInstance)
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (instanceKey) loadLabels(instanceKey); }, [instanceKey, loadLabels]);

  // Filtros mudaram (instância/tab/label/grupo) → recarrega lista
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (instanceKey) reloadChats(false); }, [reloadChats, instanceKey]);

  // Polling de segurança a cada 20s
  useEffect(() => {
    if (!instanceKey) return;
    const id = setInterval(() => reloadChats(true), 20_000);
    return () => clearInterval(id);
  }, [instanceKey, reloadChats]);

  // Chat ativo → carrega mensagens
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (activeChat) loadMessages(activeChat, false); }, [activeChat, loadMessages]);

  // Scroll para o fim ao receber/abrir mensagens
  useEffect(() => {
    if (!msgsLoading && messages.length > 0) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, msgsLoading]);

  // SSE: tempo real com fallback no polling (refs mantêm a subscrição estável)
  useEffect(() => {
    if (!instanceKey || !authReady) return;
    let esConnections = []; 
    let refreshT;
    const signal = () => {
      clearTimeout(refreshT);
      refreshT = setTimeout(() => {
        reloadChatsRef.current?.(true);
        const c = activeChatRef.current;
        if (c) loadMessagesRef.current?.(c, true);
      }, 1200);
    };
    try {
      const keys = instanceKey === 'all' 
         ? instances.filter(i => i.key !== 'all' && i.status === 'connected').map(i => i.key || i.id)
         : [instanceKey];
         
      if (keys.length > 0) {
         esConnections = keys.map(k => {
           const e = new EventSource(inboxApi.sseUrl(k));
           e.onopen = () => setSseLive(true);
           e.onerror = () => setSseLive(false);
           e.addEventListener('messages', signal);
           e.addEventListener('messages_update', signal);
           return e;
         });
      }
    } catch (e) {
      console.warn('[Inbox] SSE indisponível, usando polling:', e.message);
    }
    return () => { 
      clearTimeout(refreshT); 
      setSseLive(false); 
      esConnections.forEach(e => { try { e.close(); } catch { /* noop */ } }); 
    };
  }, [instanceKey, authReady, instances]);

  // Feedback some sozinho
  useEffect(() => {
    if (!feedback) return;
    const t = setTimeout(() => setFeedback(''), 2600);
    return () => clearTimeout(t);
  }, [feedback]);

  // -- Derivados ------------------------------------------------------------
  const selectedInst = instances.find(i => i.key === instanceKey);
  const q = search.trim().toLowerCase();
  const filteredChats = q
    ? chats.filter(c => chatName(c).toLowerCase().includes(q) || chatPhone(c).includes(q))
    : chats;

  const activeName = activeChat ? chatName(activeChat) : null;
  const activePhone = activeChat ? chatPhone(activeChat) : null;
  const activeIsGroup = activeChat?.wa_isGroup === true;
  const activeTags = normalizeTags(activeChat?.lead_tags);
  const activeAssignedMe = activeChat?.lead_assignedAttendant_id && activeChat.lead_assignedAttendant_id === userId;
  const activeAssignedOther = activeChat?.lead_assignedAttendant_id && activeChat.lead_assignedAttendant_id !== userId;
  const ticketOpen = activeChat?.lead_isTicketOpen === true;

  // -- Ações ----------------------------------------------------------------
  async function handleSend() {
    const text = replyText.trim();
    if (!text || !activeChat || sending) return;
    
    const targetKey = activeChat._sourceInstance?.key || activeChat._sourceInstance?.id || instanceKey;
    if (!targetKey || targetKey === 'all') {
       setFeedback('Instância não identificada para envio.');
       return;
    }
    
    const to = activeChat.wa_chatid || activeChat.wa_fastid;
    if (!to) return;
    setSending(true);
    setReplyText('');
    const optimistic = { messageid: `local-${messages.length}-${text.length}`, fromMe: true, messageTimestamp: Math.floor(new Date().getTime() / 1000), message: { conversation: text } };
    setMessages(prev => [...prev, optimistic]);
    try {
      await inboxApi.send(targetKey, to, text);
      reloadChats(true);
    } catch (e) {
      console.warn('[Inbox] send falhou:', e.message);
      setMessages(prev => prev.filter(m => m.messageid !== optimistic.messageid));
      setReplyText(text);
      setFeedback('Falha ao enviar. Tente novamente.');
    } finally {
      setSending(false);
    }
  }

  /** Aplica campos de lead via editLead, atualiza chat ativo e lista */
  async function patchLead(fields, okMsg) {
    if (!activeChat) return;
    const targetKey = activeChat._sourceInstance?.key || activeChat._sourceInstance?.id || instanceKey;
    if (!targetKey || targetKey === 'all') return;
    
    const chatId = activeChat.wa_chatid || activeChat.wa_fastid;
    if (!chatId) return;
    setSavingLead(true);
    try {
      await inboxApi.editLead(targetKey, chatId, fields);
      setActiveChat(prev => (prev ? { ...prev, ...fields } : prev));
      setChats(prev => prev.map(c => ((c.wa_chatid || c.wa_fastid) === chatId ? { ...c, ...fields } : c)));
      if (okMsg) setFeedback(okMsg);
      reloadChats(true);
    } catch (e) {
      console.warn('[Inbox] editLead falhou:', e.message);
      setFeedback('Não foi possível salvar.');
    } finally {
      setSavingLead(false);
    }
  }

  const assignToMe = () => patchLead({ lead_assignedAttendant_id: userId }, 'Atribuído a você.');
  const unassign = () => patchLead({ lead_assignedAttendant_id: '' }, 'Atribuição removida.');
  const toggleTicket = () => patchLead({ lead_isTicketOpen: !ticketOpen }, ticketOpen ? 'Ticket fechado.' : 'Ticket reaberto.');

  function addTag() {
    const t = tagDraft.trim();
    if (!t) return;
    if (activeTags.includes(t)) { setTagDraft(''); return; }
    patchLead({ lead_tags: [...activeTags, t] }, 'Etiqueta adicionada.');
    setTagDraft('');
  }
  const removeTag = (t) => patchLead({ lead_tags: activeTags.filter(x => x !== t) }, 'Etiqueta removida.');

  // -- Render: agrupa mensagens por dia para separadores --------------------
  const rendered = [];
  let lastDay = null;
  for (const m of messages) {
    const dl = dayLabel(msgTs(m));
    if (dl && dl !== lastDay) { rendered.push({ sep: dl, key: `sep-${dl}-${rendered.length}` }); lastDay = dl; }
    rendered.push({ msg: m, key: msgId(m) || `m-${rendered.length}` });
  }

  const FILTERS = [
    { id: 'mine', label: 'Minhas', icon: <path d="M12 12a4 4 0 100-8 4 4 0 000 8zm0 2c-4 0-7 2-7 5v1h14v-1c0-3-3-5-7-5z" /> },
    { id: 'unassigned', label: 'Não atribuídas', icon: <path d="M12 3a4 4 0 014 4 4 4 0 01-4 4 4 4 0 01-4-4 4 4 0 014-4zm0 11c3.9 0 7 1.8 7 4.2V20H5v-1.8C5 15.8 8.1 14 12 14z" /> },
    { id: 'all', label: 'Todas', icon: <path d="M4 5h16v2H4zm0 6h16v2H4zm0 6h16v2H4z" /> },
  ];

  return (
    <>
      <style>{STYLES}</style>
      <PageHeader title="Inbox" sub="Conversas WhatsApp · atribuição, etiquetas e tempo real" />

      <div className={`ibx${activeChat ? ' has-active' : ''}`} style={{ position: 'relative' }}>
        {/* ── 1. Rail de filtros ── */}
        <div className="ibx-rail">
          <div className="ibx-rail-inst">
            {instances.length > 1 ? (
              <select value={instanceKey || ''} onChange={e => changeInstance(e.target.value)}>
                {instances.map(inst => (
                  <option key={inst.key} value={inst.key}>
                    {inst.status === 'connected' ? '🟢 ' : '⚪ '}{inst.name || inst.phone || inst.key}
                  </option>
                ))}
              </select>
            ) : (
              <div className="ibx-rail-instname">
                <span style={{ fontSize: 14 }}>{selectedInst?.status === 'connected' ? '🟢' : '⚪'}</span>
                <span>{selectedInst?.name || selectedInst?.phone || 'WhatsApp'}</span>
              </div>
            )}
          </div>

          <div className="ibx-rail-section">
            <div className="ibx-rail-title">Conversas</div>
            {FILTERS.map(f => (
              <div key={f.id} className={`ibx-filter${tab === f.id ? ' active' : ''}`} onClick={() => setTab(f.id)}>
                <svg className="ic" viewBox="0 0 24 24" fill="currentColor">{f.icon}</svg>
                <span className="lbl">{f.label}</span>
                {f.id === tab && chats.length > 0 && <span className="count">{chats.length}</span>}
              </div>
            ))}
            <div
              className={`ibx-filter${groupsOnly ? ' active' : ''}`}
              onClick={() => setGroupsOnly(v => !v)}
              style={{ marginTop: 4 }}
            >
              <svg className="ic" viewBox="0 0 24 24" fill="currentColor"><path d="M16 11a3 3 0 100-6 3 3 0 000 6zm-8 0a3 3 0 100-6 3 3 0 000 6zm0 2c-2.7 0-6 1.3-6 4v2h8v-2c0-1 .4-1.9 1-2.6A8 8 0 008 13zm8 0c-.3 0-.7 0-1 .1.9.8 1.5 1.8 1.5 2.9V18h6v-2c0-2.7-3.3-4-6-4z" /></svg>
              <span className="lbl">Grupos</span>
            </div>
          </div>

          <div className="ibx-rail-section">
            <div className="ibx-rail-title">Etiquetas</div>
            {labels.length === 0 && <div className="ibx-rail-empty">Nenhuma etiqueta</div>}
            {labels.map(l => {
              const key = l.id ?? l.name;
              return (
                <div
                  key={key}
                  className={`ibx-label${activeLabel === key ? ' active' : ''}`}
                  onClick={() => setActiveLabel(activeLabel === key ? null : key)}
                >
                  <span className="dot" style={{ background: l.color || 'var(--brand-500)' }} />
                  <span className="lbl">{l.name || key}</span>
                </div>
              );
            })}
          </div>

          <div className="ibx-rail-section">
            <div className="ibx-rail-title">Tags</div>
            <div className="ibx-search" style={{ marginTop: 8, marginBottom: 8 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" style={{ color: 'var(--ink-400)', flexShrink: 0 }}>
                <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" />
              </svg>
              <input type="text" placeholder="Filtrar por tag..." value={activeTag} onChange={e => setActiveTag(e.target.value)} />
            </div>
          </div>

          <div className={`ibx-live${sseLive ? ' on' : ''}`}>
            <span className="pulse" />
            <span>{sseLive ? 'Tempo real ativo' : 'Atualização periódica'}</span>
          </div>
        </div>

        {/* ── 2. Lista de conversas ── */}
        <div className="ibx-list">
          <div className="ibx-list-head">
            <div className="ibx-search">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" style={{ color: 'var(--ink-400)', flexShrink: 0 }}>
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input type="text" placeholder="Buscar conversa…" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>
          <div className="ibx-chats">
            {instanceExpired && !chatsLoading && (
              <div className="ibx-banner">⚠️ <b>Sessão expirada.</b> Vá em <b>Números</b> e reconecte o QR.</div>
            )}
            {chatsLoading && <div style={{ display: 'flex', justifyContent: 'center', padding: 22 }}><Spinner /></div>}
            {!chatsLoading && !instanceExpired && filteredChats.length === 0 && (
              <div className="ibx-empty light" style={{ minHeight: 220 }}>
                <div className="icon">💬</div>
                <div className="label">
                  {search ? 'Nenhuma conversa encontrada.'
                    : instances.length === 0 ? 'Nenhuma instância neste workspace.\nTroque de workspace no topo ou conecte um número em Números.'
                    : tab === 'mine' ? 'Nenhuma conversa atribuída a você.'
                    : tab === 'unassigned' ? 'Nenhuma conversa sem atendente.'
                    : !instanceKey ? 'Selecione uma instância acima.'
                    : 'Nenhuma conversa ainda.\nAguardando mensagens…'}
                </div>
                {!search && instances.length > 0 && (tab === 'mine' || tab === 'unassigned') && (
                  <button
                    onClick={() => setTab('all')}
                    style={{
                      marginTop: 4, padding: '7px 14px', borderRadius: 8, cursor: 'pointer',
                      border: '1px solid var(--brand-300, #FFBFAB)', background: 'var(--brand-50, #FFF4F1)',
                      color: 'var(--brand-600, #E0531F)', fontSize: 12.5, fontWeight: 700,
                    }}
                  >
                    Ver em &quot;Todas&quot; &rarr;
                  </button>
                )}
              </div>
            )}
            {!chatsLoading && filteredChats.map(chat => {
              const cid = chat.wa_chatid || chat.wa_fastid;
              const acid = activeChat?.wa_chatid || activeChat?.wa_fastid;
              return (
                <ChatRow
                  key={cid || chat.id}
                  chat={chat}
                  active={cid === acid}
                  currentUserId={userId}
                  onClick={() => setActiveChat(chat)}
                />
              );
            })}
          </div>
        </div>

        {/* ── 3. Thread ── */}
        <div className="ibx-thread">
          {!activeChat ? (
            <div className="ibx-empty">
              <div className="icon">💬</div>
              <div className="label">Selecione uma conversa<br />para ver as mensagens</div>
            </div>
          ) : (
            <>
              <div className="ibx-thread-head">
                <button className="ibx-back ibx-iconbtn" onClick={() => setActiveChat(null)} title="Voltar" style={{ marginRight: 2 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><polyline points="15 18 9 12 15 6" /></svg>
                </button>
                <div className={`ibx-ava${activeIsGroup ? ' group' : ''}`}>{activeIsGroup ? '👥' : initials(activeName)}</div>
                <div className="meta">
                  <div className="name">{activeName}</div>
                  {activePhone && <div className="phone">{activePhone}</div>}
                </div>
                <button
                  className={`ibx-iconbtn${showPanel ? ' on' : ''}`}
                  onClick={() => setShowPanel(v => !v)}
                  title="Detalhes do contato"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 4-6 8-6s8 2 8 6" />
                  </svg>
                </button>
              </div>

              <div className="ibx-msgs">
                {msgsLoading && <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 22 }}><Spinner dark /></div>}
                {!msgsLoading && messages.length === 0 && (
                  <div className="ibx-empty"><div className="icon" style={{ fontSize: 24 }}>🔇</div><div className="label">Sem mensagens carregadas</div></div>
                )}
                {!msgsLoading && rendered.map(item => (
                  item.sep
                    ? <div key={item.key} className="ibx-daysep">{item.sep}</div>
                    : <Bubble key={item.key} msg={item.msg} />
                ))}
                <div ref={bottomRef} />
              </div>

              <div className="ibx-reply">
                <input
                  type="text"
                  placeholder="Digite uma mensagem…"
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                  disabled={sending}
                />
                <button className="ibx-send" onClick={handleSend} disabled={sending || !replyText.trim()} title="Enviar">
                  {sending
                    ? <span className="ibx-spin" style={{ width: 14, height: 14 }} />
                    : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>}
                </button>
              </div>
            </>
          )}
        </div>

        {/* ── 4. Painel do lead ── */}
        {activeChat && (
          <div className={`ibx-panel${showPanel ? ' force' : ''}`} style={showPanel ? undefined : { display: 'none' }}>
            <div className="ibx-panel-hero">
              <div className={`ava${activeIsGroup ? ' group' : ''}`}>{activeIsGroup ? '👥' : initials(activeName)}</div>
              <div className="name">{activeName}</div>
              {activePhone && <div className="phone">{activePhone}</div>}
            </div>

            {feedback && <div className="ibx-feedback">{feedback}</div>}

            <div className="ibx-panel-sec">
              <h4>Atendente</h4>
              {activeAssignedMe && (
                <div className="ibx-assigned-now">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="var(--brand-500)"><path d="M9 16.2l-3.5-3.5L4 14.2 9 19l11-11-1.4-1.4z" /></svg>
                  Atribuída a você
                </div>
              )}
              {activeAssignedOther && (
                <div className="ibx-assigned-now" style={{ background: 'var(--ink-100)', borderColor: 'var(--ink-200)', color: 'var(--ink-700)' }}>
                  Atribuída a outro atendente
                </div>
              )}
              {!activeAssignedMe
                ? <button className="ibx-act primary" disabled={savingLead} onClick={assignToMe}>Atribuir a mim</button>
                : <button className="ibx-act" disabled={savingLead} onClick={unassign}>Remover atribuição</button>}
            </div>

            <div className="ibx-panel-sec">
              <h4>Etiquetas do lead</h4>
              <div className="ibx-tagrow">
                {activeTags.map(t => (
                  <span key={t} className="ibx-tagchip">{t}<button onClick={() => removeTag(t)} title="Remover">×</button></span>
                ))}
              </div>
              <input
                className="ibx-taginput"
                placeholder="Adicionar etiqueta + Enter"
                value={tagDraft}
                onChange={e => setTagDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
                disabled={savingLead}
              />
            </div>

            <div className="ibx-panel-sec">
              <h4>Ticket</h4>
              <div className="ibx-statusrow" style={{ marginBottom: 9 }}>
                <span className="ibx-dot-st" style={{ background: ticketOpen ? '#29C467' : 'var(--ink-300)' }} />
                {ticketOpen ? 'Aberto' : 'Fechado'}
              </div>
              <button className="ibx-act" disabled={savingLead} onClick={toggleTicket}>
                {ticketOpen ? 'Fechar ticket' : 'Reabrir ticket'}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
