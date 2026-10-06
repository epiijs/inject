export interface IServiceLocator {
  [key: string]: unknown;
}

/** @deprecated 改用 {@link IServiceLocator} */
export type ServiceLocator = IServiceLocator;

export type ServiceFactoryFn = (services: IServiceLocator) => unknown;

export interface IInjector {
  inherit: (injector?: IInjector) => IInjector | undefined;
  provide: (name: string, service: ServiceFactoryFn | unknown) => void;
  service<K extends string>(name: K): IServiceLocator[K];
  service(): IServiceLocator;
  dispose: (name?: string) => void;
}

interface IServiceWrapper {
  original: ServiceFactoryFn | unknown;
  instance: unknown;
  invoking: boolean;
}

export function createInjector(): IInjector {
  const privates: {
    ancestor?: IInjector;
    services: Record<string, IServiceWrapper>;
  } = {
    ancestor: undefined,
    services: {}
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
  };

  injector.provide = (name: string, service: ServiceFactoryFn | unknown): void => {
    if (!name || !service) {
      return;
    }
    if (name in privates.services) {
      return;
    }
    privates.services[name] = {
      original: service,
      instance: undefined,
      invoking: false
      // TODO: support record evaluate performance
    };
  };

  function service<K extends string>(name: K): IServiceLocator[K];
  function service(): IServiceLocator;
  function service(name?: string): IServiceLocator | unknown {
    // 0. return service locator
    if (name === undefined) {
      return serviceLocator;
    }

    // 1. find service directly
    if (name in privates.services) {
      const wrapper = privates.services[name];
      if (wrapper.invoking) {
        throw new Error(`circular dependency on "${name}"`);
      }
      if (!wrapper.instance) {
        wrapper.invoking = true;
        try {
          wrapper.instance = typeof wrapper.original === 'function'
            ? (wrapper.original as ServiceFactoryFn)(serviceLocator)
            : wrapper.original;
        } finally {
          // 复位后求值失败的服务可以重试
          wrapper.invoking = false;
        }
      }
      return wrapper.instance;
    }

    // 2. find service from ancestor injector
    if (privates.ancestor) {
      return privates.ancestor.service(name);
    }

    // 3. service not found
    throw new Error(`service "${name}" not found`);
  }
  injector.service = service;

  function disposeInstance(instance: unknown): void {
    if (!instance) {
      return;
    }
    const disposable = instance as {
      [Symbol.dispose]?: () => void;
      dispose?: () => void;
    };
    const disposeFn = disposable[Symbol.dispose] ?? disposable.dispose;
    if (typeof disposeFn === 'function') {
      try {
        // 以实例为接收者调用，依赖 this 的销毁实现才有效
        disposeFn.call(instance);
      } catch {
        // dispose failure is ignored
      }
    }
  }

  injector.dispose = (name?: string): void => {
    if (name !== undefined) {
      if (!(name in privates.services)) {
        return;
      }
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
  };

  return injector as IInjector;
};
