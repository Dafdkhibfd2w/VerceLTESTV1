/**
 * Enhanced Service Worker
 * Supports offline functionality, push notifications, and caching strategies
 */

const CACHE_VERSION = 'v2.0.0';
const CACHE_NAME = `manager-app-${CACHE_VERSION}`;

// Assets to cache immediately
const PRECACHE_ASSETS = [
  '/',
  '/manager',
  '/worker',
  '/css/style.css',
  '/css/dashboard.css',
  '/css/animations.css',
  '/css/notifications.css',
  '/js/ui.js',
  '/js/dashboard.js',
  '/js/upload-enhanced.js',
  '/js/notifications.js',
  '/js/data-management.js',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/manifest.json'
];

// API endpoints to cache
const API_CACHE_PATTERNS = [
  /\/api\/invoices/,
  /\/api\/dispersions/,
  /\/api\/suppliers/,
  /\/api\/orders/,
  /\/api\/team/
];

// Never cache these
const SKIP_CACHE_PATTERNS = [
  /\/api\/auth/,
  /\/csrf-token/,
  /\/api\/upload/
];

/**
 * Install event - precache assets
 */
self.addEventListener('install', (event) => {
  console.log('📦 Service Worker: Installing...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('📦 Service Worker: Caching precache assets');
        return cache.addAll(PRECACHE_ASSETS);
      })
      .then(() => {
        console.log('✅ Service Worker: Installation complete');
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('❌ Service Worker: Installation failed', error);
      })
  );
});

/**
 * Activate event - clean old caches
 */
self.addEventListener('activate', (event) => {
  console.log('🔄 Service Worker: Activating...');
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME)
            .map((name) => {
              console.log('🗑️ Service Worker: Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => {
        console.log('✅ Service Worker: Activation complete');
        return self.clients.claim();
      })
  );
});

/**
 * Fetch event - handle requests with caching strategies
 */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip cache for certain patterns
  if (SKIP_CACHE_PATTERNS.some(pattern => pattern.test(url.pathname))) {
    return;
  }

  // API requests - Network first, cache fallback
  if (API_CACHE_PATTERNS.some(pattern => pattern.test(url.pathname))) {
    event.respondWith(networkFirstStrategy(request));
    return;
  }

  // Static assets - Cache first, network fallback
  if (isStaticAsset(url.pathname)) {
    event.respondWith(cacheFirstStrategy(request));
    return;
  }

  // Default - Network first
  event.respondWith(networkFirstStrategy(request));
});

/**
 * Cache first strategy
 * Good for: Static assets (CSS, JS, images)
 */
async function cacheFirstStrategy(request) {
  try {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    
    if (cached) {
      // Return cached and update in background
      updateCacheInBackground(request, cache);
      return cached;
    }

    // Not in cache, fetch from network
    const response = await fetch(request);
    
    if (response.ok) {
      cache.put(request, response.clone());
    }
    
    return response;

  } catch (error) {
    console.error('Cache first strategy failed:', error);
    return createOfflineResponse();
  }
}

/**
 * Network first strategy
 * Good for: Dynamic content, API calls
 */
async function networkFirstStrategy(request) {
  try {
    const response = await fetch(request);
    
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    
    return response;

  } catch (error) {
    // Network failed, try cache
    const cached = await caches.match(request);
    
    if (cached) {
      return cached;
    }

    // Nothing in cache either
    return createOfflineResponse();
  }
}

/**
 * Update cache in background
 */
async function updateCacheInBackground(request, cache) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response);
    }
  } catch (error) {
    // Silent fail for background updates
  }
}

/**
 * Check if URL is a static asset
 */
function isStaticAsset(pathname) {
  const staticExtensions = ['.css', '.js', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico'];
  return staticExtensions.some(ext => pathname.endsWith(ext));
}

/**
 * Create offline fallback response
 */
function createOfflineResponse() {
  return new Response(
    JSON.stringify({
      ok: false,
      message: 'אין חיבור לאינטרנט',
      offline: true
    }),
    {
      status: 503,
      statusText: 'Service Unavailable',
      headers: {
        'Content-Type': 'application/json'
      }
    }
  );
}

/**
 * Push notification event
 */
self.addEventListener('push', (event) => {
  console.log('📬 Service Worker: Push notification received');

  const options = {
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    vibrate: [200, 100, 200],
    data: {}
  };

  let title = 'עדכון חדש';
  
  if (event.data) {
    try {
      const data = event.data.json();
      title = data.title || title;
      options.body = data.body || '';
      options.data = data;
    } catch (error) {
      options.body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

/**
 * Notification click event
 */
self.addEventListener('notificationclick', (event) => {
  console.log('👆 Service Worker: Notification clicked');

  event.notification.close();

  const urlToOpen = event.notification.data?.url || '/manager';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Check if app is already open
        for (const client of clientList) {
          if (client.url === urlToOpen && 'focus' in client) {
            return client.focus();
          }
        }
        
        // Open new window
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
  );
});

/**
 * Background sync event
 */
self.addEventListener('sync', (event) => {
  console.log('🔄 Service Worker: Background sync triggered');

  if (event.tag === 'sync-data') {
    event.waitUntil(syncPendingData());
  }
});

/**
 * Sync pending data when back online
 */
async function syncPendingData() {
  try {
    const cache = await caches.open('pending-uploads');
    const requests = await cache.keys();

    for (const request of requests) {
      try {
        const response = await fetch(request);
        if (response.ok) {
          await cache.delete(request);
        }
      } catch (error) {
        console.error('Failed to sync:', request.url);
      }
    }

    console.log('✅ Service Worker: Data synced');
  } catch (error) {
    console.error('❌ Service Worker: Sync failed', error);
  }
}

/**
 * Message event - handle messages from client
 */
self.addEventListener('message', (event) => {
  console.log('💬 Service Worker: Message received', event.data);

  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.delete(CACHE_NAME).then(() => {
        event.ports[0].postMessage({ success: true });
      })
    );
  }

  if (event.data.type === 'CACHE_SIZE') {
    event.waitUntil(
      getCacheSize().then((size) => {
        event.ports[0].postMessage({ size });
      })
    );
  }
});

/**
 * Get cache size
 */
async function getCacheSize() {
  const cache = await caches.open(CACHE_NAME);
  const keys = await cache.keys();
  
  let totalSize = 0;
  
  for (const request of keys) {
    const response = await cache.match(request);
    if (response) {
      const blob = await response.blob();
      totalSize += blob.size;
    }
  }

  return {
    items: keys.length,
    bytes: totalSize,
    mb: (totalSize / (1024 * 1024)).toFixed(2)
  };
}

console.log('🚀 Service Worker: Loaded and ready');
