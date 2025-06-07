// filepath: c:\Users\mihai\vscode-previewer\inert.sh\test.js
const test = require('node:test');
const assert = require('node:assert');
const liveJsModule = require('./iframe.l.i.v.e.js');

test.describe('iframe.l.i.v.e.js basic tests with overrideGlobals', () => {
  let originalGlobals = {}; // To store original globals if needed, though overrideGlobals replaces the reference.
  let mockConsole;
  let mockEval;
  let mockCryptoSubtleVerify;
  let mockVerifySignature;

  test.beforeEach(() => {
    // 1. Define Mocks
    mockConsole = {
      log: test.mock.fn(),
      info: test.mock.fn(),
      error: test.mock.fn(),
    };
    mockEval = test.mock.fn(async (scriptContent) => 'eval_result: ' + scriptContent);
    mockCryptoSubtleVerify = test.mock.fn(async () => true); // Simulates successful crypto verification

    // It's often easier to mock the direct dependency if it's exposed,
    // rather than all its underlying dependencies (like crypto.subtle.verify).
    // Since verifySignature is exported, we can mock it directly on the module.
    // However, the functions inside iframe.l.i.v.e.js will call the *internal* verifySignature,
    // not module.exports.verifySignature unless they are written to do so.
    // The overrideGlobals is for 'globals' like console, eval, crypto, location, localStorage.
    // Let's assume verifySignature uses globals.crypto.subtle.verify.

    // 2. Prepare the mock globals object
    const mockGlobalsForTest = {
      console: mockConsole,
      eval: mockEval,
      crypto: {
        subtle: {
          verify: mockCryptoSubtleVerify,
          // Add other crypto.subtle methods if they are called by functions under test
          // and are not part of verifySignature itself, which we aim to bypass via mocking its own dependencies.
          // For these specific tests, handleExecute and handleFiles call verifySignature,
          // which then calls globals.crypto.subtle.verify.
          // So, mocking globals.crypto.subtle.verify is the correct level.
          sign: test.mock.fn(async () => new ArrayBuffer(8)), // if signData is involved indirectly
          importKey: test.mock.fn(async () => ({})), // if importKey is involved
          exportKey: test.mock.fn(async () => new ArrayBuffer(0)),
          digest: test.mock.fn(async () => new ArrayBuffer(32)),
          generateKey: test.mock.fn(async () => ({ publicKey: {}, privateKey: {} })),
        }
      },
      // Mock other globals used by the functions under test if necessary
      // For handleExecute/handleFiles, the primary external dependencies are eval and crypto.subtle.verify (via verifySignature)
      // and publicKey which is a module-level variable.
      // We also need to provide TextEncoder if verifySignature or its callers use it.
      TextEncoder: class { encode = (str) => new Uint8Array(Buffer.from(str)); },
      // publicKey is tricky as it's a module-level var set by e.g. importAndVerifyPublicKey
      // For these tests, we'll assume verifySignature can be called without a valid publicKey if its internals are mocked.
      // Or, we mock verifySignature itself if it proves too hard to mock its dependencies via globals.
    };

    // 3. Use overrideGlobals
    // Storing the original 'globals' from inside the module isn't straightforward
    // as overrideGlobals replaces the internal reference.
    // The module doesn't export its 'getGlobals' or original 'globals' object.
    liveJsModule.overrideGlobals(mockGlobalsForTest);

    // If overriding globals.crypto.subtle.verify is not enough because verifySignature
    // itself is complex or uses other globals not easily mocked,
    // an alternative is to mock verifySignature on the module, but this only works
    // if the internal calls are to `module.exports.verifySignature`.
    // Given the prompt, we stick to overrideGlobals.
    // The internal `publicKey` variable used by `verifySignature` will be undefined
    // unless `importAndVerifyPublicKey` is called. This might cause issues.
    // A robust way would be for `verifySignature` to take `globals` as an argument,
    // or for `overrideGlobals` to also reset/mock module-level state like `publicKey`.

    // For simplicity, let's also mock the module-level `publicKey` if possible,
    // or ensure tests don't fail due to it.
    // The `publicKey` is not part of `globals` object, so `overrideGlobals` won't touch it.
    // This means `verifySignature` in the original code will receive an undefined `publicKey`.
    // This will likely make `globals.crypto.subtle.verify` be called with `undefined` as key.
    // The mock for `verify` needs to handle this or we accept `verifySignature` might fail before calling it.

    // Let's try a direct mock of verifySignature on the module object for simplicity,
    // acknowledging this might not work if internal calls don't use module.exports.verifySignature.
    // This is a fallback if globals.crypto.subtle.verify mocking isn't sufficient.
    mockVerifySignature = test.mock.fn(async (str, sig, pk) => { return; /* success */ });
    liveJsModule.verifySignature = mockVerifySignature; // This is the problematic part from before.
                                                        // The new `overrideGlobals` might make this unnecessary
                                                        // if `globals.crypto.subtle.verify` is reliably mocked.
                                                        // Let's rely on mocking `globals.crypto.subtle.verify` for now.
                                                        // And remove the direct mock of liveJsModule.verifySignature.

  });

  test.afterEach(() => {
    // Restore original globals if a mechanism was in place.
    // Since overrideGlobals replaces the internal reference, and we don't have the original,
    // the best we can do is call overrideGlobals again with Node's globalThis,
    // or accept that the module's globals are modified for subsequent tests (if not re-required).
    // For node:test, tests are in separate contexts, so this might be less of an issue.
    // Let's clear mocks to be safe.
    mockConsole.log.mock.resetCalls();
    mockConsole.info.mock.resetCalls();
    mockConsole.error.mock.resetCalls();
    mockEval.mock.resetCalls();
    mockCryptoSubtleVerify.mock.resetCalls();
    if (mockVerifySignature) mockVerifySignature.mock.resetCalls(); // If we were using this
  });

  test.it('handleFiles should call crypto.subtle.verify (via internal verifySignature) and return filesApplied', async () => {
    const mockSource = { postMessage: test.mock.fn() };
    const filesPayload = [{ name: 'file1.txt', content: 'abc' }];
    const signaturePayload = new ArrayBuffer(8); // Signature should be ArrayBuffer

    // At this point, liveJsModule is using the mockGlobalsForTest via overrideGlobals.
    // So, its internal call to verifySignature should use mockGlobalsForTest.crypto.subtle.verify.

    const result = await liveJsModule.handleFiles({ files: filesPayload, signature: signaturePayload, tag: 'testTag' }, mockSource);

    // Check if our mocked globals.crypto.subtle.verify was called
    assert.strictEqual(mockCryptoSubtleVerify.mock.calls.length, 1, 'globals.crypto.subtle.verify should be called once');
    
    // We can't easily check arguments of the *internal* verifySignature,
    // but we can check args of the mocked crypto.subtle.verify.
    const verifyArgs = mockCryptoSubtleVerify.mock.calls[0].arguments;
    // The first arg to crypto.subtle.verify is algorithm, then key, then signature, then data.
    // The 'key' would be the module-level 'publicKey', which is likely undefined here.
    // This is a known difficulty with the current structure.
    // Let's assume the mock handles an undefined key gracefully.
    assert.ok(verifyArgs[2] instanceof ArrayBuffer, 'crypto.subtle.verify called with ArrayBuffer signature');
    assert.ok(verifyArgs[3] instanceof Uint8Array, 'crypto.subtle.verify called with Uint8Array data (stringified files)');

    assert.deepStrictEqual(result, { filesApplied: true }, 'Should return filesApplied: true');
  });

  test.it('handleExecute should call eval and crypto.subtle.verify and return success', async () => {
    const mockSource = { postMessage: test.mock.fn() };
    const scriptPayload = 'console.log("hello")';
    const tagPayload = 'exec-tag-123';
    const originPayload = 'test-origin';
    const signaturePayload = new ArrayBuffer(8); // Signature should be ArrayBuffer
    const expectedEvalResult = 'eval_result: ' + scriptPayload;

    const result = await liveJsModule.handleExecute(
      { tag: tagPayload, script: scriptPayload, origin: originPayload, signature: signaturePayload },
      mockSource
    );

    assert.strictEqual(mockCryptoSubtleVerify.mock.calls.length, 1, 'globals.crypto.subtle.verify should be called once for execute');
    assert.strictEqual(mockSource.postMessage.mock.calls.length, 1, 'source.postMessage should be called once');
    assert.deepStrictEqual(mockSource.postMessage.mock.calls[0].arguments[0], { executeStart: { tag: tagPayload } });
    assert.deepStrictEqual(mockSource.postMessage.mock.calls[0].arguments[1], originPayload);

    assert.strictEqual(mockEval.mock.calls.length, 1, 'mockEval should be called once');
    assert.strictEqual(mockEval.mock.calls[0].arguments[0], scriptPayload, 'mockEval called with correct script');

    assert.deepStrictEqual(result, { executeSuccess: JSON.stringify(expectedEvalResult) }, 'Should return executeSuccess');
  });

  test.it('handleExecute should return executeError if eval throws', async () => {
    const mockSource = { postMessage: test.mock.fn() };
    const scriptPayload = 'throw new Error("eval failure")'; // This will be passed to our mockEval
    const tagPayload = 'exec-tag-err';
    const originPayload = 'test-origin-err';
    const signaturePayload = new ArrayBuffer(8);

    // Configure mockEval to throw for this specific test case
    mockEval.mock.mockImplementationOnce(async (script) => {
      throw new Error('eval failure');
    });

    const result = await liveJsModule.handleExecute(
      { tag: tagPayload, script: scriptPayload, origin: originPayload, signature: signaturePayload },
      mockSource
    );

    assert.strictEqual(mockCryptoSubtleVerify.mock.calls.length, 1, 'globals.crypto.subtle.verify should still be called for error case');
    assert.strictEqual(mockSource.postMessage.mock.calls.length, 1, 'source.postMessage should still be called for executeStart');
    assert.strictEqual(mockEval.mock.calls.length, 1, 'mockEval should be called for error case');
    
    assert.ok(result.executeError, 'Result should have executeError property');
    assert.ok(result.executeError.includes('eval failure'), 'executeError message should contain the error from eval');
  });
});
