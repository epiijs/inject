export type ServiceLocator = {
  [key in string]?: unknown;
};

export type ServiceFactoryFn = (services: ServiceLocator) => unknown;

export interface IInjector {
  inherit: (injector?: IInjector) => IInjector | undefined;
  provide: (name: string, service: ServiceFactoryFn | unknown) => void;
  service: (name?: string) => ServiceLocator | unknown | undefined;
  dispose: (name?: string) => void;
}

interface IServiceWrapper {
  original: unknown;
  instance: unknown;
  invoking: boolean;
}

export function createInjector(): IInjector {
  const privates: {
    ancestor?: IInjector;
    services: Record<string, IServiceWrapper>;
  } = {
    ancestor: undefined,
    services: {},
  };

  const injector: Partial<IInjector> = {};

  const serviceLocator = new Proxy({}, {
    get: (_, name) => {
      if (typeof name === 'string') {
        return (injector as IInjector).service(name);
      }
      return undefined;
    }
  });

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

  injector.provide = (name: string, service: ServiceFactoryFn | unknown): void => {
    if (!name || !service) { return; }
    if (name in privates.services) { return; }
    privates.services[name] = {
      original: service,
      instance: undefined,
      invoking: false
      // TODO: support record evaluate performance
    };
  }

  injector.service = (name?: string): ServiceLocator | unknown | undefined => {
    // 0. return service locator
    if (!name && typeof name !== 'string') {
      return serviceLocator;
    }

    // 1. find service directly
    if (name in privates.services) {
      const wrapper = privates.services[name];
      if (!wrapper.instance && !wrapper.invoking) {
        wrapper.invoking = true;
        wrapper.instance = typeof wrapper.original === 'function'
          ? (wrapper.original as ServiceFactoryFn)(serviceLocator)
          : wrapper.original;
        wrapper.invoking = false;
      }
      return wrapper.instance;
    }

    // 2. find service from ancestor injector
    if (privates.ancestor) {
      return privates.ancestor.service(name);
    }

    // 3. service not found
    return undefined;
  }

  function disposeInstance(instance: unknown) {
    if (!instance) { return; }
    const disposeFn =
      // TODO: support Symbol.dispose while ECMA updated
      // (instance as any)[Symbol.dispose] ||
      (instance as any).dispose;
    if (typeof disposeFn === 'function') {
      try { disposeFn(); } catch {}
    }
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