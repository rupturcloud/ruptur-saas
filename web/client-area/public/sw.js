/**
 * Service Worker para Jarvis Phase 7
 * Handles:
 * - Push notifications
 * - Notification clicks
 * - Offline fallback
 */

// Versão do SW (increment para force update)
const SW_VERSION = "3.0.0-network-first";
const CACHE_NAME = `ruptur-${SW_VERSION}`;

console.log(`✓ Service Worker v${SW_VERSION} loaded`);

// ============ INSTALL EVENT ============
self.addEventListener("install", (event) => {
  console.log(`🔧 Installing Service Worker ${SW_VERSION}`);
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log(`✓ Cache ${CACHE_NAME} aberto`);
      // NÃO pré-cachear "/" nem "/index.html" — o HTML é network-first.
      return cache.addAll([
        "/manifest.json",
        "/logo.png",
        "/badge.png",
      ]).catch((err) => {
        console.warn("Alguns arquivos não conseguiram ser cacheados:", err);
        // Não falhar se algum arquivo não existe
        return Promise.resolve();
      });
    })
  );
  // Force this service worker to become active
  self.skipWaiting();
});

// ============ ACTIVATE EVENT ============
self.addEventListener("activate", (event) => {
  console.log(`⚡ Activating Service Worker ${SW_VERSION}`);
  event.waitUntil(
    // Limpa TODOS os caches (inclusive os deste SW) para eliminar bundles antigos
    // presos. O fetch network-first re-popula com o conteúdo atual.
    caches.keys()
      .then((names) => Promise.all(names.map((n) => {
        console.log(`🗑️  Deletando cache: ${n}`);
        return caches.delete(n);
      })))
      .then(() => self.clients.claim())
  );
});

// ============ PUSH EVENT (Notificações) ============
self.addEventListener("push", (event) => {
  console.log("📬 Push event recebido");

  if (!event.data) {
    console.warn("Push recebido sem dados");
    return;
  }

  try {
    const data = event.data.json();
    console.log("📨 Dados de notificação:", data);

    const options = {
      body: data.body || "Nova notificação do Jarvis",
      icon: data.icon || "/logo.png",
      badge: data.badge || "/badge.png",
      tag: data.tag || "jarvis-notification",
      requireInteraction: false,
      vibrate: [200, 100, 200],
      timestamp: data.timestamp ? new Date(data.timestamp).getTime() : Date.now(),

      // Actions (buttons na notificação)
      actions: data.actions || [
        { action: "open", title: "Abrir" },
        { action: "close", title: "Fechar" },
      ],

      // Custom data
      data: data.data || {},

      // Comportamento visual
      silent: false,
    };

    // Se tem badge color, adicionar
    if (data.badgeColor) {
      options.badgeColor = data.badgeColor;
    }

    // Mostrar notificação
    event.waitUntil(
      self.registration.showNotification(data.title || "Jarvis", options)
        .then(() => {
          console.log("✓ Notificação exibida com sucesso");
        })
        .catch((err) => {
          console.error("❌ Erro ao exibir notificação:", err);
        })
    );
  } catch (err) {
    console.error("❌ Erro ao processar push event:", err);
    // Fallback: mostrar notificação genérica
    event.waitUntil(
      self.registration.showNotification("Jarvis", {
        body: "Nova notificação (erro ao processar dados)",
        icon: "/logo.png",
      })
    );
  }
});

// ============ NOTIFICATION CLICK EVENT ============
self.addEventListener("notificationclick", (event) => {
  console.log("👆 Notification click:", event.action);

  event.notification.close();

  const action = event.action;
  const notificationData = event.notification.data || {};

  // URL base da aplicação
  const baseUrl = "https://jarvis.ruptur.cloud";

  let targetUrl = baseUrl;

  // Determinar URL baseado na ação clicada
  if (action === "open" || !action) {
    // Clique no corpo da notificação (default)
    if (notificationData.agent) {
      targetUrl = `${baseUrl}/agent/${notificationData.agent}`;
    } else if (notificationData.voice_url) {
      targetUrl = `${baseUrl}/voice?playback=${encodeURIComponent(notificationData.voice_url)}`;
    } else {
      targetUrl = baseUrl;
    }
  } else if (action === "play" && notificationData.voice_url) {
    // Clique em "Reproduzir" (se tiver som)
    targetUrl = `${baseUrl}/voice?playback=${encodeURIComponent(notificationData.voice_url)}`;
  } else if (action === "close") {
    // Clique em "Fechar" - não abrir nada
    console.log("Notificação fechada pelo usuário");
    return;
  }

  console.log(`📍 Abrindo URL: ${targetUrl}`);

  // Procurar por cliente existente
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        // Procurar janela já aberta com Jarvis
        for (let i = 0; i < clientList.length; i++) {
          const client = clientList[i];
          if (client.url === baseUrl + "/" && "focus" in client) {
            // Já tem Jarvis aberta, focar nela
            return client.focus();
          }
        }
        // Não tem Jarvis aberta, abrir nova janela
        if (clients.openWindow) {
          return clients.openWindow(targetUrl);
        }
      })
  );
});

// ============ NOTIFICATION CLOSE EVENT ============
self.addEventListener("notificationclose", (event) => {
  console.log("✕ Notificação fechada pelo usuário:", event.notification.tag);
  // Opcionalmente: enviar evento ao servidor
});

// ============ FETCH EVENT (Cache First Strategy) ============
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  let url;
  try { url = new URL(event.request.url); } catch { return; }

  // API: nunca cachear — sempre rede (evita servir dados velhos)
  if (url.pathname.startsWith("/api/")) return;

  // Assets hasheados (/assets/*) são imutáveis (hash no nome) → cache-first
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      caches.match(event.request).then((cached) =>
        cached || fetch(event.request).then((res) => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(event.request, clone));
          }
          return res;
        })
      )
    );
    return;
  }

  // HTML / navegação / resto → NETWORK-FIRST: sempre busca o index novo
  // (que referencia os chunks novos). Cache só como fallback offline.
  // É isto que elimina o bundle preso no cache.
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(event.request, clone));
        }
        return res;
      })
      .catch(() =>
        caches.match(event.request).then((cached) =>
          cached || new Response("Offline", { status: 503, statusText: "Service Unavailable" })
        )
      )
  );
});

// ============ MESSAGE EVENT (Comunicação com client) ============
self.addEventListener("message", (event) => {
  console.log("💬 Mensagem recebida do cliente:", event.data);

  if (event.data && event.data.type === "SKIP_WAITING") {
    console.log("⚡ Pulando wait, ativando novo SW");
    self.skipWaiting();
    return;
  }

  if (event.data && event.data.type === "CACHE_URLS") {
    // Client quer cachear URLs adicionais
    const urls = event.data.urls || [];
    if (event.ports && event.ports[0]) {
      caches.open(CACHE_NAME).then((cache) => {
        cache.addAll(urls)
          .then(() => {
            event.ports[0].postMessage({ type: "CACHED", urls });
          })
          .catch((err) => {
            console.error("❌ Erro ao cachear URLs:", err);
            event.ports[0].postMessage({ type: "CACHE_ERROR", error: err.message });
          });
      });
    } else {
      console.warn("⚠️  Tentativa de responder sem ports disponíveis");
    }
    return;
  }
});

console.log(`✓ Service Worker ready to handle: push, notifications, fetch, messages`);
