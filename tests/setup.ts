import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});

// Prevent DevExtreme trial panel from registering custom elements that queue unhandled microtasks on teardown
if (typeof customElements !== 'undefined') {
  const origGet = customElements.get.bind(customElements);
  customElements.get = (name: string) => {
    if (name === 'dx-license' || name === 'dx-license-trigger') {
      return class DummyLicenseElement extends HTMLElement {};
    }
    return origGet(name);
  };
}

// Fix JSDOM AbortSignal mismatch with Node.js undici Request
const OriginalRequest = globalThis.Request;
if (OriginalRequest) {
  globalThis.Request = class PatchedRequest extends OriginalRequest {
    constructor(input: RequestInfo | URL, init?: RequestInit) {
      if (init && 'signal' in init) {
        const restInit = { ...init };
        delete (restInit as { signal?: unknown }).signal;
        super(input, restInit);
      } else {
        super(input, init);
      }
    }
  };
}

// Polyfill window.matchMedia for DevExtreme responsive checks in jsdom
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

// Polyfill ResizeObserver for DevExtreme grid layout measurement in jsdom
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};
