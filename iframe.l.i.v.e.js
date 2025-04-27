// @ts-check
/// <reference lib="WebWorker" />

(function () {

function boot() {

  const isBrowser = typeof window !== 'undefined' && window?.document && typeof window.document.createElement === 'function';
  const isIFRAMEWorker = isBrowser && typeof location !== 'undefined' && location?.host?.indexOf('-ifrwrk.') >= 0;
  const isServiceWorker = typeof self !== 'undefined' && self.constructor?.name === 'ServiceWorkerGlobalScope';

  if (isBrowser) {
    activateServiceWorkerForBrowser();
  }

  if (isIFRAMEWorker) bootIFRAMEWorker();
  else if (isBrowser) bootInteractiveApp();
  else if (isServiceWorker) bootServiceWorker();
  else {
    throw new Error('ENVIRONMENT NOT SUPPORTED!');
  }
}

function bootIFRAMEWorker() {
  const msg = document.createElement('pre');
  msg.textContent = 'TO BE DEFINED: IFRAME WORKER ' + new Date() + ' ' + Math.random();

  if (!document.body)
    document.documentElement.appendChild(document.createElement('body'));

  document.body.appendChild(msg);

  window.addEventListener('message', handlePostMessage);
}

function bootInteractiveApp() {
  const msg = document.createElement('pre');
  msg.style.cssText = 'background: tomato; color: white;';
  msg.textContent = 'UNSUPPORTED: ' + new Date() + ' ' + Math.random();
  if (!document.body)
    document.documentElement.appendChild(document.createElement('body'));

  document.body.appendChild(msg);
}

function activateServiceWorkerForBrowser() {
  if (typeof navigator !== 'undefined' && typeof navigator?.serviceWorker?.register === 'function') {
    navigator.serviceWorker.register('./iframe.l.i.v.e.js')
      .then(registration => {
        console.log('Service Worker registered with scope:', registration.scope);
        const visibleMsg = document.createElement('pre');
        visibleMsg.style.cssText = 'color: gray';
        visibleMsg.textContent = 'service worker registered';
        if (!document.body)
          document.documentElement.appendChild(document.createElement('body'));
        document.body.appendChild(visibleMsg);
      });
  }
}

function bootServiceWorker() {

  /** @type {ServiceWorkerGlobalScope} */(/** @type {*} */(self)).addEventListener(
  'fetch',
  handleFetch);

}

var local;

/**
 * 
 * @param {FetchEvent} event 
 */
function handleFetch(event) {
  const url = new URL(event.request.url);

  switch (event.request.method) {
    case 'GET':
      const cached = local?.[url.pathname];
      if (cached) {
        console.info('SVCWK GET ', url.pathname, ' cached ', cached);
        event.respondWith(responseWithHeaders(
          cached));
        return;
      }
      break;

    case 'PUT':
      const toCache = {
        headers: event.request.headers,
        status: 200,
        statusText: 'OK local',
        body: event.request.body
      };
      if (!local) local = { [url.pathname]: toCache };
      else local[url.pathname] = toCache;
      console.info('SVCWK PUT ', url.pathname, ' cached ', toCache);
      event.respondWith(responseWithHeaders(
        new Response(null, { status: 200, statusText: 'OK to local' })));
      return;

    case 'DELETE':
      const logDelete = local?.[url.pathname];
      const deleted = local && delete local[url.pathname];
      console.info('SVCWK DELETE ', url.pathname, deleted ? ' deleted ' : ' absent ', logDelete);
      event.respondWith(responseWithHeaders(
        new Response(null, { status: 200, statusText: deleted ? 'OK deleted' : 'OK absent' })));
      return;
  }

  console.info('SVCWK ' + event.request.method + ' ', url.pathname, ' pass through...');

  event.respondWith(
    fetch(event.request)
      .then(responseWithHeaders));
}

/** @param {Response} response */
function responseWithHeaders(response) {
  const newHeaders = new Headers(response.headers);

  const headers = {
    'Cross-Origin-Embedder-Policy': 'require-corp',
    'Cross-Origin-Opener-Policy': 'cross-origin',
    'Cross-Origin-Resource-Policy': 'cross-origin',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Security-Policy':
      `default-src * 'unsafe-inline' 'unsafe-eval' https://unpkg.com/; ` +
      `script-src * 'unsafe-inline' 'unsafe-eval' https://unpkg.com; ` +
      `connect-src * 'unsafe-inline'; img-src * data: blob: 'unsafe-inline'; ` +
      `frame-src *; style-src * 'unsafe-inline'; ` +
      `worker-src * self 'unsafe-inline' 'unsafe-eval' blob:`
  };

  Object.entries(headers).forEach(([key, value]) => {
    newHeaders.set(key, value);
  });

  const newResponse = new Response(
    response.body,
    {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders
    });
  return newResponse;
}

/**
 * @param {MessageEvent} e
 */
function handlePostMessage(e) {
  const tag = e.data?.execute?.tag;
  const script = e.data?.execute?.script;
  const origin = e.data?.execute?.origin;
  const source = e.source;

  if (!tag || !script || !source) return;

  source.postMessage(
    { executeStart: { tag } },
    origin);

  (async () => {
    try {
      var result;
      try {
        result = await (0, eval)(script);
      } catch (error) {
        source.postMessage(
          {
            executeError: { tag, error: String(error) }
          },
          origin);
        return;
      }

      source.postMessage(
        {
          executeSuccess: { tag, result: JSON.stringify(result) }
        },
        origin);
    } catch (biggerError) {
      source.postMessage(
        {
          executeError: { tag, error: String(biggerError) }
        },
        origin);
    }
  })();
}

boot();

})();