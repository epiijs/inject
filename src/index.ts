interface IServiceOptions {
  writable?: boolean;
  callable?: boolean;
}

interface IServiceWrapper extends IServiceOptions {
  instance: any;
}

export interface IServiceHandler {
  [key: string]: unknown;
}

export interface IInjector {
  inherit: (base: IInjector) => void;
  provide: (name: string, service: any, options?: IServiceOptions) => void;
  service: (name: string) => unknown;
  handler: () => IServiceHandler;
}

export class Injector implements IInjector {
  private services: {
    [key in string]: IServiceWrapper;
  };
  private baseInjector?: IInjector;
  private serviceProxy?: IServiceHandler;

  constructor() {
    this.services = {};
    this.baseInjector = undefined;
    this.serviceProxy = undefined;
  }

  inherit(injector: IInjector): void {
    this.baseInjector = injector;
  }

  provide(name: string, service: any, options: IServiceOptions = {}): void {
    if (!name || !service) { return; }
    const wrapper = this.services[name];
    if (wrapper && !wrapper.writable) { return; }
    this.services[name] = {
      instance: service,
      writable: options.writable != null ? options.writable : true,
      callable: options.callable != null ? options.callable : true,
    };
  }

  service(name: string): unknown {
    // 1. find service directly
    if (name in this.services) {
      const wrapper = this.services[name];
      if (wrapper.callable && typeof wrapper.instance === 'function') {
        return wrapper.instance(this.handler);
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

  handler(): IServiceHandler {
    if (!this.serviceProxy) {
      this.serviceProxy = new Proxy({}, {
        get: (target, property) => {
          if (typeof property === 'string') {
            return this.service(property);
          }
        },
      });
    }
    return this.serviceProxy;
  }

  dispose() {
    this.services = {};
    this.baseInjector = undefined;
    this.serviceProxy = undefined;
  }
}
