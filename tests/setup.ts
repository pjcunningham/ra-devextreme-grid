import '@testing-library/jest-dom/vitest';

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
