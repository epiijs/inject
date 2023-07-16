interface IServiceOptions {
  writable?: boolean;
  callable?: boolean;
}

interface IServiceWrapper extends IServiceOptions {
  provider: unknown;
  instance: unknown;
}

export interface IServiceHandler {
  [key: string]: unknown;
}

export interface IInjector {
  inherit: (base: IInjector) => void;
  provide: (name: string, provider: any, options?: IServiceOptions) => void;
  service: (name: string) => unknown;
  dispose: () => void;
}

export class Injector implements IInjector {
  private services: {
    [key in string]: IServiceWrapper;
  };
  private baseInjector?: IInjector;

  constructor() {
    this.services = {};
    this.baseInjector = undefined;
  }

  inherit(injector: IInjector): void {
    this.baseInjector = injector;
  }

  provide(name: string, provider: any, options: IServiceOptions = {}): void {
    if (!name || !provider) { return; }
    const wrapper = this.services[name];
    if (wrapper && !wrapper.writable) { return; }
    this.services[name] = {
      provider,
      instance: null,
      writable: options.writable != null ? options.writable : true,
      callable: options.callable != null ? options.callable : true,
    };
  }

  service(name: string): unknown {
    // 1. find service directly
    if (name in this.services) {
      const wrapper = this.services[name];
      if (!wrapper.instance) {
        if (wrapper.callable && typeof wrapper.provider === 'function') {
          wrapper.instance = wrapper.provider(this);
        } else {
          wrapper.instance = wrapper.provider;
        }
      }
      return wrapper.instance;
    }

    // 2. find service from inherit injector
    if (this.baseInjector) {
      return this.baseInjector.service(name);
    }

    // 3. service not found
    return null;
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
    this.baseInjector = undefined;
  }
}
