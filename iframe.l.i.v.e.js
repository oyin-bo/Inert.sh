// @ts-check
/// <reference lib="WebWorker" />

const globals =
  typeof globalThis !== 'undefined' ? globalThis :
    typeof self !== 'undefined' ? self :
      typeof window !== 'undefined' ? window :
        this;


(function () {
  function iframeLIVE(environment) {
    var version = '0.19';

    const globals =
      typeof globalThis !== 'undefined' ? globalThis :
        typeof self !== 'undefined' ? self :
          typeof window !== 'undefined' ? window :
            this;

    function boot() {
      const isBrowser = typeof globals.window.document.createElement === 'function';
      const isIFRAMEWorker = isBrowser && Number(typeof globals.location?.host?.indexOf('-ifrwrk.')) >= 0;
      const isServiceWorker = globals.self.constructor?.name === 'ServiceWorkerGlobalScope';

      globals.console.log('IFRAME live v' + version, { isBrowser, isIFRAMEWorker, isServiceWorker });

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
      const msg = globals.document.createElement('pre');
      msg.textContent = 'TO BE DEFINED: IFRAME WORKER ' + new Date() + ' ' + Math.random();

      if (!globals.document.body)
        globals.document.documentElement.appendChild(globals.document.createElement('body'));

      globals.document.body.appendChild(msg);

      globals.window.addEventListener('message', handlePostMessage);
    }

    async function bootInteractiveApp() {
      const HASH_CHAR_LENGTH = 8;

      var anchorBottom;
      function printOut(msg) {
        const msgEl = globals.document.createElement('pre');
        msgEl.textContent = msg;
        if (anchorBottom) globals.document.body.insertBefore(msgEl, anchorBottom);
        else globals.document.body.appendChild(msgEl);
      }

      if (!globals.document.body)
        globals.document.documentElement.appendChild(globals.document.createElement('body'));

      printOut('IFRAME Live v' + version + ': Signing...');
      const { publicStr, publicHash, privateKey } = await generateSigningKeyPair();
      printOut('Loading IFRAME worker...');
      const iframe = globals.document.createElement('iframe');
      const iframeSrc = 'https://' + publicHash + '-ifrwrk.' + globals.location.host;
      iframe.src = iframeSrc;
      iframe.allow = 'cross-origin-embedder-policy; cross-origin-opener-policy; cross-origin-resource-policy; cross-origin-isolated;';
      iframe.style.cssText = 'width: 20px; height: 20px; border: none; position: absolute; top: -10px; left: -10px; opacity: 0.01; pointer-events: none; z-index: -1;';

      /** @type {Promise<void>} */
      const frameLoaded = new Promise((resolve) => {

        globals.document.body.appendChild(iframe);

        iframe.onload = frameLoaded;

        function frameLoaded() {
          iframe.onload = null;
          printOut('IFRAME channel negotiation...');
          const initTag = 'INIT' + Date.now();
          globals.window.addEventListener('message', handleIFRAMEMessage);

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
              globals.window.removeEventListener('message', handleIFRAMEMessage);
            }
          }
        }

      });

      await frameLoaded;
      printOut('Ready.');

      const input = globals.document.createElement('input');
      input.type = 'text';
      input.style.cssText = 'width: 100%;';
      globals.document.body.appendChild(input);
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

        const scriptText = globals.document.createElement('pre');
        scriptText.style.fontWeight = 'bold';
        scriptText.textContent = '> ' + inputText + '\n...';
        globals.document.body.insertBefore(scriptText, input);

        const result = await new Promise(async (resolve) => {
          const executeTag = 'EXECUTE' + Date.now();
          iframe.contentWindow?.postMessage(
            {
              tag: executeTag,
              execute: {
                script: inputText,
                origin: globals.location.origin,
                signature: await signData(privateKey, inputText)
              }
            },
            iframeSrc);

          globals.window.addEventListener('message', handleIFRAMEMessage);

          function handleIFRAMEMessage(e) {
            if (e.data?.tag === executeTag) {
              resolve(e.data);
              globals.window.removeEventListener('message', handleIFRAMEMessage);
            }
          }
        });

        scriptText.textContent = '> ' + inputText;

        printOut(JSON.stringify(result, null, 2));

      }

    }

    function activateServiceWorkerForBrowser() {
      if (typeof globals.navigator !== 'undefined' && typeof globals.navigator?.serviceWorker?.register === 'function') {
        globals.navigator.serviceWorker.register('./iframe.l.i.v.e.js')
          .then(registration => {
            globals.console.log('Service Worker registered with scope:', registration.scope);
            const visibleMsg = globals.document.createElement('pre');
            visibleMsg.style.cssText = 'color: gray';
            visibleMsg.textContent = 'service worker registered';
            if (!globals.document.body)
              globals.document.documentElement.appendChild(globals.document.createElement('body'));
            globals.document.body.appendChild(visibleMsg);
          });
      }
    }

    function bootServiceWorker() {
  /** @type {ServiceWorkerGlobalScope} */(/** @type {*} */(globals.self)).addEventListener(
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
            globals.console.info('SVCWK GET ', url.pathname, ' cached ', cached);
            event.respondWith(responseWithHeaders(
              cached));
            return;
          }

          // TODO: communicate back to the parent and request the file
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
          globals.console.info('SVCWK PUT ', url.pathname, ' cached ', toCache);
          event.respondWith(responseWithHeaders(
            new Response(null, { status: 200, statusText: 'OK to local' })));
          return;

        case 'DELETE':
          const logDelete = local?.[url.pathname];
          const deleted = local && delete local[url.pathname];
          globals.console.info('SVCWK DELETE ', url.pathname, deleted ? ' deleted ' : ' absent ', logDelete);
          event.respondWith(responseWithHeaders(
            new Response(null, { status: 200, statusText: deleted ? 'OK deleted' : 'OK absent' })));
          return;
      }

      globals.console.info('SVCWK ' + event.request.method + ' ', url.pathname, ' pass through...');

      event.respondWith(
        globals.fetch(event.request)
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
          statusText: response.statusText + ' + IFRAME service worker',
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
      globals.console.log('IFRAME Worker ', e, { data: e.data, origin: e.origin, source: e.source });

      if (e.data?.init)
        result = { ...await handleInit(e.data.init) };

      if (!publicKey) {
        const publicKeyStr = globals.localStorage.getItem('parent_publicKey');
        if (!publicKeyStr) {
          globals.console.error('MESSAGE WITHOUT PUBLIC KEY NEGOTIATION ', e.data);
          return;
        }

        importAndVerifyPublicKey(publicKeyStr);
      }

      const executePromise = e.data?.execute && handleExecute({ tag: e.data.tag, ...e.data.execute }, e.source);
      const filesPromise = e.data?.files && handleFiles(e.data.files);

      result = {
        tag: e.data?.tag,
        ...result,
        ...await executePromise,
        ...await filesPromise
      };

      globals.console.log('IFRAME Worker result', result);

      e.source?.postMessage(
        result,
        { targetOrigin: e.origin });
    }

    async function handleInit({ publicKey }) {
      globals.console.log('IFRAME Worker init', { publicKey });

      await importAndVerifyPublicKey(publicKey);

      return { initSuccess: { publicKey } };
    }

    async function generateSigningKeyPair() {
      const algorithm = {
        name: "RSASSA-PKCS1-v1_5",
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: "SHA-256",
      };
      const keyPair = await globals.crypto.subtle.generateKey(algorithm, true, ["sign", "verify"]);

      const publicKeySpki = await globals.crypto.subtle.exportKey('spki', keyPair.publicKey);
      const publicStr = btoa(String.fromCharCode.apply(null, new Uint8Array(publicKeySpki)));

      const publicKeyDigest = await globals.crypto.subtle.digest('SHA-256', publicKeySpki);
      const publicHash = [...new Uint8Array(publicKeyDigest)].map(b => b.toString(36)).join('').slice(0, HASH_CHAR_LENGTH);

      return { publicStr, publicHash, privateKey: keyPair.privateKey };
    }

    async function signData(privateKey, str) {
      return globals.crypto.subtle.sign({ name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, privateKey, new TextEncoder().encode(str));
    }

    function verifySignature(str, signature, publicKey) {
      const dataBuffer = new TextEncoder().encode(str);
      const verified = globals.crypto.subtle.verify({ name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, publicKey, signature, dataBuffer);
      if (!verified) {
        globals.console.error('Signature verification failed. ', str, signature);
        throw new Error('Signature verification failed.');
      }
    }
  
    async function importAndVerifyPublicKey(publicStr) {

      const hashStr = globals.location.hostname.replace(/\-ifrwrk\..+$/, '').toLowerCase();
      const publicKeyObj = await importAndVerifyPublicKeyCryptoCore(publicStr, hashStr);

      if (!publicKeyObj) {
        globals.console.error('Public key verification failed. ', publicKey, hashStr);
        throw new Error('Public key verification failed.');
      }

      globals.localStorage.setItem('parent_publicKey', publicStr);
      publicKey = publicKeyObj;

      async function importAndVerifyPublicKeyCryptoCore(publicStr, hashString) {
        const publicKeyBuffer = Uint8Array.from(atob(publicStr), c => c.charCodeAt(0)).buffer;
        const algorithm = {
          name: "RSASSA-PKCS1-v1_5",
          hash: "SHA-256",
        };
        const publicKey = await globals.crypto.subtle.importKey('spki', publicKeyBuffer, algorithm, true, ['verify']);

        const publicKeySpki = await globals.crypto.subtle.exportKey('spki', publicKey);
        const publicKeyDigest = await globals.crypto.subtle.digest('SHA-256', publicKeySpki);
        const calculatedHash = [...new Uint8Array(publicKeyDigest)].map(b => b.toString(36)).join('').toLowerCase();

        if (calculatedHash.startsWith(hashString)) return publicKey;
      }
    }

    async function handleExecute({ tag, script, origin, signature }, source) {
      if (!tag || !script || !source || !signature) return;

      verifySignature(script, signature, publicKey);

      source.postMessage(
        { executeStart: { tag } },
        origin);

      try {
        var result;
        try {
          result = await (0, globals.eval)(script);
        } catch (error) {
          return {
            executeError: String(error)
          };
        }

        return {
          executeSuccess: JSON.stringify(result)
        };
      } catch (biggerError) {
        return {
          executeError: String(biggerError)
        };
      }
    }
  
    async function handleFiles({ tag, files, signature }, source) {

      if (!files || !source || !signature) return;

      await verifySignature(JSON.stringify(files), signature, publicKey);

      // TODO: add the counts for successes/failures
      // TODO: store the files to use in fetch
      return { filesApplied: true };
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

    if (environment === 'test') {
      Object.assign(module.exports, {
        boot,
        bootIFRAMEWorker,
        bootInteractiveApp,
        activateServiceWorkerForBrowser,
        bootServiceWorker,
        handleFetch,
        responseWithHeaders,
        handlePostMessage,
        handleInit,
        generateSigningKeyPair,
        signData,
        verifySignature,
        importAndVerifyPublicKey,
        handleExecute,
        handleFiles
      });
    }

    boot();
  }

  iframeLIVE();
})();