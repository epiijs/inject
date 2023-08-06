# epii-inject

A simple dependency injector.

# Install

```bash
npm i @epiijs/inject --save
```

# Usage

```typescript
import { createInjector } from '@epiijs/inject';

function createUserService() {
  return {
    dispose: () => {}
  };
}

const injector = createInjector();
injector.provide('UserService', createUserService);

const service = injector.service('UserService');
service.dispose();
```

# API

## createInjector

```typescript
import { createInjector } from '@epiijs/inject';

const injector = createInjector();
```

## injector.provide

`injector.provide` can accept any value as service or function as service factory.

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

`injector.inherit` will try to find services from inherited injector if nothing found from self.

```typescript
export const userService: IUserService = {};

const anotherInjector = createInjector();
anotherInjector.provide('UserService', userService);
injector.inherit(anotherInjector);

const service = injector.service('UserService');
```

## injector.service

`injector.service` will find and create and return service instance.
You can specify options for service provider function.

```typescript
const service = injector.service('UserService');
const service = injector.service('UserService', { region: 'earth' });
```

Also you can get injector and call `injector.service` in service provider function.

```typescript
import { Symbols } from '@epiijs/inject';

injector.provide('PlanService', (options) => {
  const injector = options[Symbols.injector];
  const userService = injector.service('UserService');
  return {};
});
```

## injector.dispose

`injector.dispose` will dispose specified service or all instances and clear all providers.

```typescript
import { Symbols } from '@epiijs/inject';

export const userService: IUserService = {
  // you can use Symbols.disposer method to dispose
  [Symbols.disposer]: () => {
    console.log('disposed');
  },

  // also you can use 'dispose' method to dispose
  dispose: () => {
    console.log('disposed if Symbols.disposer method not defined');
  }
};

injector.provide('UserService', userService);

injector.dispose('UserService');
injector.dispose();

// console output: disposed
```