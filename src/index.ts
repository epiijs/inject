export interface IServiceOptions {
  writable?: boolean;
  callable?: boolean;
}

export interface IInjector {
  inherit: (base?: IInjector) => IInjector | undefined;
  provide: (name: string, provider: any, options?: IServiceOptions) => void;
  service: <TService = unknown, TOptions = unknown>(name: string, options?: TOptions) => TService | undefined;
  dispose: () => void;
}

interface IServiceWrapper extends IServiceOptions {
  provider: unknown;
  instance: unknown;
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

  provide(name: string, provider: any, options: IServiceOptions = {}): void {
    if (!name || !provider) { return; }
    const wrapper = this.services[name];
    if (wrapper && !wrapper.writable) { return; }
    this.services[name] = {
      provider,
      instance: null,
      writable: options.writable ?? false,
      callable: options.callable ?? true,
    };
  }

  service<TService = unknown, TOptions = unknown>(name: string, options?: TOptions): TService | undefined {
    // 1. find service directly
    if (name in this.services) {
      const wrapper = this.services[name];
      if (!wrapper.instance) {
        if (wrapper.callable && typeof wrapper.provider === 'function') {
          wrapper.instance = wrapper.provider(this, options);
        } else {
          wrapper.instance = wrapper.provider;
        }
      }
      return wrapper.instance as TService | undefined;
    }

    // 2. find service from ancestor injector
    if (this.ancestor) {
      return this.ancestor.service(name, options);
    }

    // 3. service not found
    return undefined;
  }

  dispose() {
    Object.values(this.services).forEach((wrapper) => {
      const { instance } = wrapper;
      if (!instance) { return; }
      // TODO: support Symbol.dispose while ECMA updated
      const disposeFn = (instance as any).dispose;
      if (typeof disposeFn === 'function') {
        try {
          disposeFn();
        } catch {
        }
      }
    });
    this.services = {};
    this.ancestor = undefined;
  }
}
