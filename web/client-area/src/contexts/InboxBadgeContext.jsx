/**
 * InboxBadgeContext — contador dinâmico de conversas não-lidas para o badge
 * do item "Inbox" na sidebar.
 *
 * Substitui o badge hardcoded (era `badge: 7` fixo no AppShell).
 * O Inbox alimenta o valor (soma de wa_unreadCount) sempre que recarrega a lista
 * de conversas; a sidebar (AppShell) lê e mostra. Quando 0/desconhecido, some.
 */
/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useCallback } from 'react';

const InboxBadgeContext = createContext({ unread: 0, setUnread: () => {} });

export function InboxBadgeProvider({ children }) {
  const [unread, setUnreadState] = useState(0);
  const setUnread = useCallback((n) => {
    const v = parseInt(n, 10);
    setUnreadState(Number.isFinite(v) && v > 0 ? v : 0);
  }, []);
  return (
    <InboxBadgeContext.Provider value={{ unread, setUnread }}>
      {children}
    </InboxBadgeContext.Provider>
  );
}

export function useInboxBadge() {
  return useContext(InboxBadgeContext);
}

export default InboxBadgeContext;
