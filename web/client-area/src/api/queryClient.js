import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // Dados são frescos por 5 minutos
      retry: 2, // Retentar 2 vezes em caso de falha de rede
      refetchOnWindowFocus: false, // Menos requisições ao focar na janela, pois SSE já atualiza
    },
    mutations: {
      retry: 0, // Mutações (POST/PUT/DELETE) não retentam sozinhas (evita duplicidade de cobrança/msg)
    },
  },
});
