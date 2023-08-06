const SymbolInjector = Symbol('injector');
const SymbolDisposer = Symbol('disposer');

export const Symbols = new Proxy({}, {
  get: (target, key) => {
    if (key === 'injector') {
      return SymbolInjector;
    }
    if (key === 'disposer') {
      return SymbolDisposer;
    }
  }
}) as {
  readonly injector: symbol;
  readonly disposer: symbol;
};

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
  const disposeFn =
    (instance as any)[SymbolDisposer] ||
    (instance as any).dispose;
  if (typeof disposeFn === 'function') {
    try { disposeFn(); } catch {}
  }
}

export function createInjector(): IInjector {
  const privates: {
    services: Record<string, IServiceWrapper>;
    ancestor?: IInjector;
  } = {
    services: {},
    ancestor: undefined
  };

  const injector: Partial<IInjector> = {};

  injector.inherit = (another?: IInjector): IInjector | undefined => {
    let cursor = another;
    while (cursor) {
      if (cursor === injector) {
        throw new Error('circular dependency');
      }
      cursor = cursor.inherit();
    }
    if (another) {
      privates.ancestor = another;
    }
    return privates.ancestor;
  }

  injector.provide = (name: string, provider: ProviderFn | unknown): void => {
    if (!name || !provider) { return; }
    if (name in privates.services) { return; }
    privates.services[name] = {
      provider,
      instance: null
    };
  }

  injector.service = <S = unknown, P = unknown>(name: string, options?: P): S | undefined => {
    // 1. find service directly
    if (name in privates.services) {
      const wrapper = privates.services[name];
      if (!wrapper.instance) {
        if (typeof wrapper.provider === 'function') {
          wrapper.instance = (wrapper.provider as ProviderFn)({
            ...options,
            [SymbolInjector]: injector as IInjector
          });
        } else {
          wrapper.instance = wrapper.provider;
        }
      }
      return wrapper.instance as S | undefined;
    }

    // 2. find service from ancestor injector
    if (privates.ancestor) {
      return privates.ancestor.service(name, options);
    }

    // 3. service not found
    return undefined;
  }

  injector.dispose = (name?: string): void => {
    if (name) {
      const wrapper = privates.services[name];
      disposeInstance(wrapper.instance);
      delete privates.services[name];
    } else {
      Object.values(privates.services).forEach((wrapper) => {
        disposeInstance(wrapper.instance);      
      });
      privates.services = {};
      privates.ancestor = undefined;
    }
  }

  return injector as IInjector;
};