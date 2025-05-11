// @ts-check
/// <reference lib="WebWorker" />

(function () {

var version = '0.13';

function boot() {
  const isBrowser = typeof window !== 'undefined' && window?.document && typeof window.document.createElement === 'function';
  const isIFRAMEWorker = isBrowser && typeof location !== 'undefined' && location?.host?.indexOf('-ifrwrk.') >= 0;
  const isServiceWorker = typeof self !== 'undefined' && self.constructor?.name === 'ServiceWorkerGlobalScope';

  console.log('IFRAME live v' + version, { isBrowser, isIFRAMEWorker, isServiceWorker });

  if (isBrowser && isIFRAMEWorker)
    activateServiceWorkerForBrowser();

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

async function bootInteractiveApp() {
  const HASH_CHAR_LENGTH = 8;

  async function generateSigningKeyPair() {
    const algorithm = {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    };
    const keyPair = await crypto.subtle.generateKey(algorithm, true, ["sign", "verify"]);

    const publicKeySpki = await crypto.subtle.exportKey('spki', keyPair.publicKey);
    const publicStr = btoa(String.fromCharCode.apply(null, new Uint8Array(publicKeySpki)));

    const publicKeyDigest = await crypto.subtle.digest('SHA-256', publicKeySpki);
    const publicHash = [...new Uint8Array(publicKeyDigest)].map(b => b.toString(36)).join('').slice(0, HASH_CHAR_LENGTH);

    return { publicStr, publicHash, privateKey: keyPair.privateKey };
  }

  async function signData(privateKey, str) {
    return crypto.subtle.sign({ name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, privateKey, new TextEncoder().encode(str));
  }

  var anchorBottom;
  function printOut(msg) {
    const msgEl = document.createElement('pre');
    msgEl.textContent = msg;
    if (anchorBottom) document.body.insertBefore(msgEl, anchorBottom);
    else document.body.appendChild(msgEl);
  }

  if (!document.body)
    document.documentElement.appendChild(document.createElement('body'));

  printOut('IFRAME Live v' + version + ': Signing...');
  const { publicStr, publicHash, privateKey } = await generateSigningKeyPair();
  printOut('Loading IFRAME worker...');
  const iframe = document.createElement('iframe');
  const iframeSrc = 'https://' + publicHash + '-ifrwrk.' + location.host;
  iframe.src = iframeSrc;
  iframe.style.cssText = 'width: 20px; height: 20px; border: none; position: absolute; top: -10px; left: -10px; opacity: 0.01; pointer-events: none; z-index: -1;';

  /** @type {Promise<void>} */
  const frameLoaded = new Promise((resolve) => {

    document.body.appendChild(iframe);

    iframe.onload = frameLoaded;

    function frameLoaded() {
      iframe.onload = null;
      printOut('IFRAME channel negotiation...');
      const initTag = 'INIT' + Date.now();
      window.addEventListener('message', handleIFRAMEMessage);

      iframe.contentWindow?.postMessage(
        {
          tag: initTag,
          init: {
            publicKey: publicStr,
            hash: publicHash
          }
        },
        iframeSrc);

      function handleIFRAMEMessage(e) {
        if (e.data?.tag === initTag) {
          resolve();
          window.removeEventListener('message', handleIFRAMEMessage);
        }
      }
    }

  });

  await frameLoaded;
  printOut('Ready.');

  const input = document.createElement('input');
  input.type = 'text';
  input.style.cssText = 'width: 100%;';
  document.body.appendChild(input);
  anchorBottom = input;
  input.focus();

  while (true) {
    const inputText = await new Promise((resolve) => {
      input.onkeydown = (e) => {
        if (e.key === 'Enter') {
          const value = input.value;
          input.onkeydown = null;
          resolve(value);
        }
      };
    });

    input.value = '';

    const scriptText = document.createElement('pre');
    scriptText.style.fontWeight = 'bold';
    scriptText.textContent = '> ' + inputText + '\n...';
    document.body.insertBefore(scriptText, input);

    const result = await new Promise(async (resolve) => {
      const executeTag = 'EXECUTE' + Date.now();
      iframe.contentWindow?.postMessage(
        {
          tag: executeTag,
          execute: {
            script: inputText,
            origin: location.origin,
            signature: await signData(privateKey, inputText)
          }
        },
        iframeSrc);

      window.addEventListener('message', handleIFRAMEMessage);

      function handleIFRAMEMessage(e) {
        if (e.data?.tag === executeTag) {
          resolve(e.data);
          window.removeEventListener('message', handleIFRAMEMessage);
        }
      }
    });

    scriptText.textContent = '> ' + inputText;

    printOut(JSON.stringify(result, null, 2));

  }

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
  
var publicKey;

/**
 * @param {MessageEvent} e
 */
async function handlePostMessage(e) {
  let result = {};
  console.log('IFRAME Worker ', e, { data: e.data, origin: e.origin, source: e.source });

  if (e.data?.init)
    result = { ...await handleInit(e.data.init) };

  if (!publicKey) {
    publicKey = localStorage.getItem('parent_publicKey');
    if (!publicKey) {
      console.error('MESSAGES NOT ALLOWED WITHOUT PUBLIC KEY NEGOTIATION ', e.data);
      return;
    }
  }

  const executePromise = e.data?.execute && handleExecute({ tag: e.data.tag, ...e.data.execute }, e.source);
  const filesPromise = e.data?.files && handleFiles(e.data.files);

  result = {
    tag: e.data?.tag,
    ...result,
    ...await executePromise,
    ...await filesPromise
  };

  console.log('IFRAME Worker result', result);

  e.source?.postMessage(
    result,
    { targetOrigin: e.origin });
}
  
async function handleInit({ publicKey }) {
  console.log('IFRAME Worker init', { publicKey });

  const hashStr = location.hostname.replace(/\-ifrwrk\..+$/, '').toLowerCase();
  const publicKeyObj = await importAndVerifyPublicKey(publicKey, hashStr);
  if (!publicKeyObj) {
    console.error('Public key verification failed. ', publicKey, hashStr);
    throw new Error('Public key verification failed.');
  }

  localStorage.setItem('parent_publicKey', publicKey);
  return { initSuccess: { publicKey: hashStr } };
}
  
function verifySignature(str, signature, publicKey) {
  const dataBuffer = new TextEncoder().encode(str);
  const verified = crypto.subtle.verify({ name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, publicKey, signature, dataBuffer);    
  if (!verified) {
    console.error('Signature verification failed. ', str, signature);
    throw new Error('Signature verification failed.');
  }
}
  
async function importAndVerifyPublicKey(publicStr, hashString) {
  const publicKeyBuffer = Uint8Array.from(atob(publicStr), c => c.charCodeAt(0)).buffer;
  const algorithm = {
    name: "RSASSA-PKCS1-v1_5",
    hash: "SHA-256",
  };
  const publicKey = await crypto.subtle.importKey('spki', publicKeyBuffer, algorithm, true, ['verify']);

  const publicKeySpki = await crypto.subtle.exportKey('spki', publicKey);
  const publicKeyDigest = await crypto.subtle.digest('SHA-256', publicKeySpki);
  const calculatedHash = [...new Uint8Array(publicKeyDigest)].map(b => b.toString(36)).join('').toLowerCase();

  if (calculatedHash.startsWith(hashString)) return publicKey;
}
  
async function handleExecute({ tag, script, origin, signature }, source) {
  if (!tag || !script || !source || !signature) return;

  await verifySignature(script, signature, publicKey);

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

      return {
        executeSuccess: { tag, result: JSON.stringify(result) }
      };
    } catch (biggerError) {
      return {
        executeError: { tag, error: String(biggerError) }
      };
    }
  })();
}
  
async function handleFiles({ tag, files, signature }, source) {

  if (!files || !source || !signature) return;

  await verifySignature(JSON.stringify(files), signature, publicKey);

  // TODO: add the counts for successes/failures
  return { filesApplied: { tag } };
}

// const HASH_CHAR_LENGTH = 8;

// async function generateSigningKeyPair() {
//   const algorithm = {
//     name: "RSASSA-PKCS1-v1_5",
//     modulusLength: 2048,
//     publicExponent: new Uint8Array([1, 0, 1]),
//     hash: "SHA-256",
//   };
//   const keyPair = await crypto.subtle.generateKey(algorithm, true, ["sign", "verify"]);

//   const publicKeySpki = await crypto.subtle.exportKey('spki', keyPair.publicKey);
//   const publicStr = btoa(String.fromCharCode.apply(null, new Uint8Array(publicKeySpki)));

//   const publicKeyDigest = await crypto.subtle.digest('SHA-256', publicKeySpki);
//   const publicHash = [...new Uint8Array(publicKeyDigest)].map(b => b.toString(36)).join('').slice(0, HASH_CHAR_LENGTH);

//   return { publicStr, publicHash, privateKey: keyPair.privateKey };
// }

// async function signData(privateKey, str) {
//   return crypto.subtle.sign({ name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, privateKey, new TextEncoder().encode(str));
// }

// async function importAndVerifyPublicKey(publicStr, hashString) {
//   const publicKeyBuffer = Uint8Array.from(atob(publicStr), c => c.charCodeAt(0)).buffer;
//   const algorithm = {
//     name: "RSASSA-PKCS1-v1_5",
//     hash: "SHA-256",
//   };
//   const publicKey = await crypto.subtle.importKey('spki', publicKeyBuffer, algorithm, true, ['verify']);

// }

// async function verifySignature(publicKey, signature, str) {
//   const dataBuffer = new TextEncoder().encode(str);
//   return crypto.subtle.verify({ name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, publicKey, signature, dataBuffer);
// }

boot();

})();