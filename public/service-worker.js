// service-worker.js (development version)
self.addEventListener("install", (event) => {
  // ישר מתקדם, בלי קאש
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // תופס שליטה בלי למחוק/ליצור קאש
  event.waitUntil(self.clients.claim());
});

// לא מתערבים בכלל בבקשות
self.addEventListener("fetch", (event) => {
  // משאיר לרשת לטפל כרגיל
});
