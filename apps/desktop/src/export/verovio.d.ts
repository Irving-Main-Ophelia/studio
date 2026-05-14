// Minimal type stubs for the Verovio toolkit. The runtime API is documented
// at https://book.verovio.org/installing-or-building-from-sources/javascript-and-webassembly.html
// but it ships untyped, so we declare just the surface we touch.

declare module "verovio/wasm" {
  const createVerovioModule: () => Promise<unknown>;
  export default createVerovioModule;
}

declare module "verovio/esm" {
  export class VerovioToolkit {
    constructor(module: unknown);
    setOptions(opts: Record<string, unknown>): void;
    loadData(data: string): boolean;
    getPageCount(): number;
    renderToSVG(pageNumber: number): string;
  }
}
