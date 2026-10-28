// Service worker mínimo: deixa o Hefesto instalável como app (celular e computador).
// Não guarda nada em cache: tudo vem sempre do servidor (os dados mudam a todo momento).
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
