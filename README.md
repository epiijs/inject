# @epiijs/inject

A simple dependency injector.

# Install

```bash
npm i @epiijs/inject --save
```

# Usage

```typescript
import { createInjector } from '@epiijs/inject';

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

`injector.service` can find service by name, create service instance and return it.

```typescript
const service = injector.service('UserService');
```

Also you can use the first argument of service factory function as service locator to find other services.

```typescript
injector.provide('PlanService', (services) => {
  const userService = service.UserService;
  return { user: userService, plan: undefined };
});
```

Actually `injector.serivce()` will return a service locator proxy.

## injector.dispose

`injector.dispose` will dispose specified service by name or all instances and clear all providers.

```typescript
export const userService: IUserService = {
  // you can use Symbol.dispose method to dispose
  // [Symbol.dispose]: () => {
  //   console.log('disposed');
  // },

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