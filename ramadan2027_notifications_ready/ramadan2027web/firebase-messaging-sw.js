importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyC7Bvo6XguL0xab_7_2NeQPPnM4EmOHqjW0",
  authDomain: "ramadan-comptition-2027.firebaseapp.com",
  projectId: "ramadan-comptition-2027",
  storageBucket: "ramadan-comptition-2027.firebasestorage.app",
  messagingSenderId: "459071960490",
  appId: "1:459071960490:web:8e7a94eb9df4376768e7d3",
  measurementId: "G-TRPVH89HG2"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const n = payload.notification || {};

  self.registration.showNotification(
    n.title || 'مسابقة رمضان',
    {
      body: n.body || '',
      icon: '/favicon.ico',
      data: payload.data || {}
    }
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = event.notification?.data?.link;
  const target = link
    ? new URL(link, self.location.origin).href
    : self.location.origin + '/#/notifications';

  event.waitUntil(
    clients.matchAll({type:'window', includeUncontrolled:true}).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(target);
    })
  );
});
