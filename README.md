# @epiijs/inject

A simple dependency injector.

# Install

```bash
npm i @epiijs/inject --save
```

# Usage

```typescript
import { createInjector } from '@epiijs/inject';

// declare the service names this consumer looks up, so lookups come back typed
declare module '@epiijs/inject' {
  interface IServiceLocator {
    UserService: {
      connect: () => void;
      dispose: () => void;
    };
  }
}

const injector = createInjector();

injector.provide('UserService', () => {
  return {
    connect: () => {},
    dispose: () => {}
  };
});

const service = injector.service('UserService');
service.connect();

injector.dispose();
```

# API

## createInjector

```typescript
import { createInjector } from '@epiijs/inject';

const injector = createInjector();
```

## injector.provide

`injector.provide` can accept any service values or service factory functions.

```typescript
export interface IUserService {}

// provide instance as service
export const userService: IUserService = {};

// provide factory function as service
export function createUserService(): IUserService {
  const userService: IUserService = {};
  return userService;
}

injector.provide('UserService', userService);
// injector.dispose('UserService');
injector.provide('UserService', createUserService);
```

## injector.inherit

`injector.inherit` can be attached with another injector. Current injector will try to find services from inherited injector if nothing found from itself.

```typescript
const injector = createInjector();

const anotherInjector = createInjector();
anotherInjector.provide('UserService', {});
injector.inherit(anotherInjector);

const service = injector.service('UserService');
```

## injector.service

`injector.service` can find service by name, create service instance and return it. A name that resolves to nothing throws `service "<name>" not found`, so a lookup never returns `undefined`.

```typescript
const service = injector.service('UserService');
```

The result type comes from the service names declared on `IServiceLocator` (the older name `ServiceLocator` is an alias of it and deprecated):

```typescript
declare module '@epiijs/inject' {
  interface IServiceLocator {
    UserService: IUserService;
  }
}

injector.service('UserService'); // IUserService
```

Names are open-ended: a name nobody declared still compiles and still resolves at runtime, typed as `unknown`.

Also you can use the first argument of service factory function as service locator to find other services.

```typescript
injector.provide('PlanService', (services) => {
  const userService = services.UserService;
  return { user: userService, plan: undefined };
});
```

Actually `injector.service()` without a name returns the service locator proxy. Reading a name from it is the same lookup and throws the same way, while a non-string key (a symbol, for instance) is not a lookup at all and returns `undefined`.

Services whose factories refer to each other in a cycle throw `circular dependency on "<name>"` instead of handing back an incomplete instance.

## injector.dispose

`injector.dispose` will dispose specified service by name or all instances and clear all providers. A name that resolves to nothing is left alone, and an empty name is treated as a name, not as a request to clear everything.

```typescript
export const userService: IUserService = {
  // you can use Symbol.dispose method to dispose
  [Symbol.dispose]: () => {
    console.log('disposed');
  },

  // also you can use 'dispose' method to dispose
  dispose: () => {
    console.log('disposed if Symbol.dispose method not defined');
  }
};

injector.provide('UserService', userService);

injector.dispose('UserService');
injector.dispose();

// console output: disposed
```
