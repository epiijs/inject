import { describe, expect, test } from 'vitest';

import { createInjector } from '../build/index.js';

describe('injector', () => {
  test('create and dispose injector', () => {
    const injector = createInjector();
    const service1 = {};
    injector.provide('s1', service1);
    injector.dispose();
    const instance = injector.service('s1');
    expect(instance).toBeUndefined();
  });

  test('provide nothing', () => {
    const injector = createInjector();
    const service1 = {};
    injector.provide('', service1);
    injector.provide('s1', '');
    const instance1 = injector.service('');
    const instance2 = injector.service('s1');
    expect(instance1).toBeUndefined();
    expect(instance2).toBeUndefined();
  });

  test('provide simple service', () => {
    const injector = createInjector();
    const service1 = {};
    injector.provide('s1', service1);
    const instance = injector.service('s1');
    expect(instance).toBe(service1);
  });

  test('provide more than once', () => {
    const injector = createInjector();
    const oldValue = '1';
    const newValue = '2';
    injector.provide('s1', oldValue);
    injector.provide('s2', oldValue);
    injector.provide('s1', newValue);
    injector.dispose('s2');
    injector.provide('s2', newValue);
    const instance1 = injector.service('s1');
    const instance2 = injector.service('s2');
    expect(instance1).toBe(oldValue);
    expect(instance2).toBe(newValue);
  });

  test('provide callable service', () => {
    const injector = createInjector();
    const testValue1 = 1;
    const testValue2 = 2;
    const serviceFn1 = () => testValue1;
    const serviceFn2 = (services) => services.s1 + 1;
    injector.provide('s1', serviceFn1);
    injector.provide('s2', serviceFn2);
    const instance1 = injector.service('s1');
    const instance2 = injector.service('s2');
    expect(instance1).toBe(testValue1);
    expect(instance2).toBe(testValue2);
  });

  test('provide circular service', () => {
    const injector = createInjector();
    const evaluated = { s0: false, s1: false, s2: false };
    const serviceFn0 = (services) => { evaluated.s0 = true; return services.s0; };
    const serviceFn1 = (services) => { evaluated.s1 = true; return services.s2; };
    const serviceFn2 = (services) => { evaluated.s2 = true; return services.s1; };
    injector.provide('s0', serviceFn0);
    injector.provide('s1', serviceFn1);
    injector.provide('s2', serviceFn2);
    const instance0 = injector.service('s0');
    const instance1 = injector.service('s1');
    const instance2 = injector.service('s2');
    expect(evaluated).toEqual({ s0: true, s1: true, s2: true });
    expect(instance0).toBeUndefined();
    expect(instance1).toBeUndefined();
    expect(instance2).toBeUndefined();
  });

  test('dispose service', () => {
    const injector = createInjector();
    const disposed = { s1: false };
    const service1 = {
      dispose: () => {
        disposed.s1 = true;
      }
    };
    injector.provide('s1', service1);
    injector.service('s1');
    injector.dispose();
    const instance1 = injector.service('s1');
    expect(instance1).toBeUndefined();
    expect(disposed.s1).toBe(true);
  });

  test('dispose service with Symbol.dispose', () => {
    const injector = createInjector();
    const disposed = { s1: false };
    const service1 = {
      [Symbol.dispose]: () => {
        disposed.s1 = true;
      }
    };
    injector.provide('s1', service1);
    injector.service('s1');
    injector.dispose();
    expect(disposed.s1).toBe(true);
  });

  test('inherit injector', () => {
    const injector1 = createInjector();
    const injector2 = createInjector();
    const testValue = '1';
    injector2.inherit(injector1);
    injector1.provide('s1', testValue);
    const instance1 = injector1.service('s1');
    const instance2 = injector2.service('s1');
    expect(instance1).toBe(testValue);
    expect(instance2).toBe(testValue);
  });

  test('inherit circular injector', () => {
    const injector1 = createInjector();
    const injector2 = createInjector();
    expect(() => {
      injector1.inherit(injector1);
    }).toThrow();
    expect(() => {
      injector1.inherit(injector2);
      injector2.inherit(injector1);
    }).toThrow();
  });
});
