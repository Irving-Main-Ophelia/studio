// Vitest setup — runs before every test file.
// Currently a no-op; we use it to register polyfills/mocks for jsdom as
// they become necessary (e.g., ResizeObserver, AudioContext stubs).

import "@testing-library/dom";
