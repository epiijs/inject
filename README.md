# epii-inject

A simple dependency injector.

# Install

```bash
npm i @epiijs/inject --save
```

# Usage

```typescript
import { Injector } from '@epiijs/inject';

function createUserService() {
  return {
    dispose: () => {}
  };
}

const injector = new Injector();
injector.provide('UserService', createUserService);

const service = injector.service('UserService');
service.dispose();
```

# API

## Injector()

```typescript
import { Injector } from '@epiijs/inject';

const injector = new Injector();
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
injector.provide('UserService', createUserService);

// default service options
injector.provide('UserService', createUserService, { writable: false, callable: true });
```

## injector.inherit

`injector.inherit` will try to find services from inherited injector if nothing found from self.

```typescript
export const userService: IUserService = {};

const globalInjector = new Injector();
globalInjector.provide('UserService', userService);
injector.inherit(globalInjector);

const service = injector.service('UserService');
```

## injector.service

`injector.service` will find and create and return service instance.
Also you can specify options for service factory function.

```typescript
const service = injector.service('UserService');
const service = injector.service('UserService', { region: 'earth' });
```

## injector.dispose

`injector.dispose` will dispose all instances and clear all providers.

```typescript
export const userService: IUserService = {
  dispose: () => {
    console.log('disposed');
  }
};

injector.provide('UserService', userService);
injector.dispose();

// console output: disposed
```