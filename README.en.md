# @epiijs/inject

[中文](README.md)

Provides a simple dependency injection container.
A provider registers factory functions or service instances into the container, and a consumer gets an instance by the registered name (initialized on use, cached after instantiation).
The host of the container can dispose it whenever it needs to. Producing and releasing instances are both handled by the container, so the consumer does not need to care.

## Install

```bash
npm i --save @epiijs/inject
```

## Usage

```typescript
import { createInjector } from '@epiijs/inject';

const injector = createInjector();

injector.provide('UserService', () => ({
  connect: () => {},
  dispose: () => {}
}));

// optional: the consumer declares the service-name to service-type mapping, so lookups match the declared types
declare module '@epiijs/inject' {
  interface IServiceLocator {
    UserService: {
      connect: () => void;
      dispose: () => void;
    };
  }
}

const userService = injector.service('UserService');
userService.connect();

injector.dispose();
```

## API

```typescript
export function createInjector(): IInjector;

export interface IInjector {
  provide: (name: string, service: ServiceFactoryFn | unknown) => void;
  service<K extends string>(name: K): IServiceLocator[K];
  service(): IServiceLocator;
  inherit: (injector?: IInjector) => IInjector | undefined;
  dispose: (name?: string) => void;
}

export type ServiceFactoryFn = (services: IServiceLocator) => unknown;

export interface IServiceLocator {
  [key: string]: unknown;
}
```

### injector.provide

`provide(name, service)` registers a service and returns nothing.

- A function is treated as the factory of the service instance, evaluated on the first lookup and cached. The first argument of the factory is the service locator, which can be used to get other services
- A non-function value is treated as the service instance itself, returned as-is on lookup
- A falsy `name` or a falsy `service` is ignored silently, treated as if no call happened
- Registering a name that is already registered is skipped outright; the name can be registered again once that registration is disposed

```typescript
export interface IUserService {
  connect: () => void;
  dispose: () => void;
}

export const userService: IUserService = {
  connect: () => {},
  dispose: () => {}
};

// register an instance
injector.provide('UserService', userService);

// register a factory, the first argument is the service locator
injector.provide('PlanService', (services) => {
  return { user: services.UserService };
});
```

### injector.service

`service(name)` looks a service up by name and returns the instance.

- A lookup that matches nothing throws `service "<name>" not found`. The container provides no existence probe entry, and no lookup behavior that returns `undefined` without an error
- On the first lookup of a service registered as a function, the factory function is called and its return value is cached as the service instance
- When a factory triggers the factory of another service in a cycle, `circular dependency on "<name>"` is thrown, and an incomplete instance is not returned
- When a factory throws by itself, the next lookup evaluates it again, and the failed result is not cached
- A falsy service instance is not cached and is re-evaluated on every lookup

```typescript
const userService = injector.service('UserService'); // IUserService
```

`service()` without a name returns the service locator, see the next section.

The type of the result comes from the merged declarations of `IServiceLocator`.
If the consumer has not merged a type declaration for the service, the matched service instance is typed `unknown`.

### IServiceLocator

The service locator: the return value of `service()`, and the type of the first argument of the factory.
It is a Proxy view of the container's service lookup capability, and also the type left for the consumer's `declare module` declaration merging.

- Reading one of its string properties is equivalent to calling `service(name)`
- A non-string key (a Symbol, for instance) is treated as no lookup at all and returns `undefined`
- Type declarations of `IServiceLocator` from several parties merge as TypeScript does it: different member names, or the same name with the same type, coexist; the same name with a different type is a compile error
- The older name `ServiceLocator` is kept as a `@deprecated` alias; please switch to `IServiceLocator`

```typescript
declare module '@epiijs/inject' {
  interface IServiceLocator {
    UserService: IUserService;
  }
}

// IUserService
injector.service('UserService');

const services = injector.service();
// IUserService, equivalent to one lookup by name
services.UserService;
```

### injector.inherit

`inherit(another)` links another container as the ancestor and returns the current ancestor.
`inherit()` without an argument only reads the current ancestor.

A service lookup started from the current container matches against the current container first, and an unmatched lookup walks back up the inheritance chain layer by layer.
This is commonly used to separate scopes, giving a finer-grained scope the chance to reach the container of a broader scope.

```typescript
const injector = createInjector();
const ancestor = createInjector();
ancestor.provide('UserService', userService);

// returns ancestor
injector.inherit(ancestor);

// matched after walking back to the ancestor container
injector.service('UserService');

// reads back ancestor
injector.inherit();
```

The inheritance chain forbids circular references: a link detected as pointing back to itself throws `circular dependency`.

### injector.dispose

`dispose(name)` disposes the service instance of the given name and removes the registration.
`dispose()` disposes every instance, clears every registration, and detaches the inheritance link.

- An unregistered name triggers no actual work
- Disposal only reaches services that were instantiated; a value-registered service has no instance before its first lookup, so disposing it calls no disposal handle, and the container does not instantiate one just to dispose it
- The disposal handle is `Symbol.dispose` if present, otherwise the `dispose` method
- Exceptions thrown during disposal are ignored and do not block the disposal of other instances

```typescript
const disposable = {
  [Symbol.dispose]: () => console.log('disposed'),
  // the dispose method is used only when Symbol.dispose is absent
  dispose: () => console.log('disposed')
};

injector.provide('UserService', disposable);

// instantiate; only now is there something to dispose
injector.service('UserService');
// console output: disposed
injector.dispose('UserService');
// dispose the whole container
injector.dispose();
```

## Out of scope

- No service discovery: nothing is loaded implicitly from the filesystem or the network. The container lacks constraint information from the business, so it cannot offer a general safe design; service discovery is business behavior for the framework above
- No handling of asynchronous factory semantics: the first-level return value is always passed through. If the framework above cares about async, it should wrap it itself
- No parameterized lookup: the service name is the only matching key, and a factory function should not behave polymorphically based on arguments
- No cache policy customization: if a shorter lifecycle is needed, instantiate a container with a shorter lifecycle

Mechanism details are in `docs/design-v1.md`.
