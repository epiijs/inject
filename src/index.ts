export const SymbolInjector = Symbol('Injector');

export type ProviderFn = (options: {
  [key: string]: unknown;
  [SymbolInjector]: IInjector;
}) => unknown;

export interface IInjector {
  inherit: (injector?: IInjector) => IInjector | undefined;
  provide: (name: string, provider: ProviderFn | unknown) => void;
  service: <S = unknown, P = unknown>(name: string, options?: P) => S | undefined;
  dispose: (name?: string) => void;
}

interface IServiceWrapper {
  provider: unknown;
  instance: unknown;
}

function disposeInstance(instance: unknown) {
  if (!instance) { return; }
  // TODO: support Symbol.dispose while ECMA updated
  const disposeFn = (instance as any).dispose;
  if (typeof disposeFn === 'function') {
    try {
      disposeFn();
    } catch {
    }
  }
}

export class Injector implements IInjector {
  private services: {
    [key in string]: IServiceWrapper;
  };
  private ancestor?: IInjector;

  constructor() {
    this.services = {};
    this.ancestor = undefined;
  }

  inherit(injector?: IInjector): IInjector | undefined {
    let ancestor = injector;
    while (ancestor) {
      if (ancestor === this) {
        throw new Error('circular dependency');
      }
      ancestor = ancestor.inherit();
    }
    if (injector) {
      this.ancestor = injector;
    }
    return this.ancestor;
  }

  provide(name: string, provider: ProviderFn | unknown): void {
    if (!name || !provider) { return; }
    if (name in this.services) { return; }
    this.services[name] = {
      provider,
      instance: null
    };
  }

  service<S = unknown, P = unknown>(name: string, options?: P): S | undefined {
    // 1. find service directly
    if (name in this.services) {
      const wrapper = this.services[name];
      if (!wrapper.instance) {
        if (typeof wrapper.provider === 'function') {
          wrapper.instance = (wrapper.provider as ProviderFn)({
            ...options,
            [SymbolInjector]: this
          });
        } else {
          wrapper.instance = wrapper.provider;
        }
      }
      return wrapper.instance as S | undefined;
    }

    // 2. find service from ancestor injector
    if (this.ancestor) {
      return this.ancestor.service(name, options);
    }

    // 3. service not found
    return undefined;
  }

  dispose(name?: string): void {
    if (name) {
      const wrapper = this.services[name];
      disposeInstance(wrapper.instance);
      delete this.services[name];
    } else {
      Object.values(this.services).forEach((wrapper) => {
        disposeInstance(wrapper.instance);      
      });
      this.services = {};
      this.ancestor = undefined;
    }
  }
}
