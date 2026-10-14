// Service worker: recebe as notificações push mesmo com o app fechado.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (e) => {
  let data = { title: "Minhas Finanças", body: "Você tem um lembrete" };
  try { data = e.data.json(); } catch (_) {}
  e.waitUntil(self.registration.showNotification(data.title, {
    body: data.body,
    // tag única por aviso: avisos diferentes com o mesmo título não se substituem
    tag: data.tag || ("financas-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7)),
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: "window" }).then((cs) =>
      cs.length ? cs[0].focus() : self.clients.openWindow("/")
    )
  );
});
