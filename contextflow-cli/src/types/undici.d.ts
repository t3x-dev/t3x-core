declare module 'node:undici' {
  // Minimal declarations to satisfy TypeScript; runtime API provided by Node.js.
  export class ProxyAgent {
    constructor(uri: string);
  }

  export function setGlobalDispatcher(dispatcher: unknown): void;
}

declare module 'undici' {
  export class ProxyAgent {
    constructor(uri: string);
  }

  export function setGlobalDispatcher(dispatcher: unknown): void;
}
