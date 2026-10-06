import { describe, expect, test } from 'vitest';

import { createInjector } from '../build/index.js';

describe('injector', () => {
  test('create and dispose injector', () => {
    const injector = createInjector();
    const service1 = {};
    injector.provide('s1', service1);
    injector.dispose();
    expect(() => injector.service('s1')).toThrow('not found');
  });

  test('provide empty name or empty value is ignored', () => {
    const injector = createInjector();
    const service1 = {};
    injector.provide('', service1);
    injector.provide('s1', '');
    expect(() => injector.service('')).toThrow('not found');
    expect(() => injector.service('s1')).toThrow('not found');
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

  test('provide circular service throws', () => {
    const injector = createInjector();
    const evaluated = { s0: false, s1: false, s2: false };
    const serviceFn0 = (services) => { evaluated.s0 = true; return services.s0; };
    const serviceFn1 = (services) => { evaluated.s1 = true; return services.s2; };
    const serviceFn2 = (services) => { evaluated.s2 = true; return services.s1; };
    injector.provide('s0', serviceFn0);
    injector.provide('s1', serviceFn1);
    injector.provide('s2', serviceFn2);
    expect(() => injector.service('s0')).toThrow('circular dependency on "s0"');
    expect(() => injector.service('s1')).toThrow('circular dependency on "s1"');
    expect(() => injector.service('s2')).toThrow('circular dependency on "s2"');
    expect(evaluated).toEqual({ s0: true, s1: true, s2: true });
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
    expect(() => injector.service('s1')).toThrow('not found');
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

  test('service without name returns service locator', () => {
    const injector = createInjector();
    injector.provide('s1', 'v1');
    const services = injector.service();
    expect(services.s1).toBe('v1');
    expect(() => services.s2).toThrow('not found');
    expect(services[Symbol.toStringTag]).toBeUndefined();
  });

  test('service locator is passed to service factory', () => {
    const injector = createInjector();
    injector.provide('s1', 'v1');
    let locator;
    injector.provide('s2', (services) => {
      locator = services;
      return `${services.s1}/s2`;
    });
    expect(injector.service('s2')).toBe('v1/s2');
    expect(locator.s1).toBe('v1');
    // locator resolves names only, injector methods are not exposed
    expect(() => locator.service).toThrow('not found');
  });

  test('cache instance from service factory', () => {
    const injector = createInjector();
    let calls = 0;
    injector.provide('s1', () => {
      calls += 1;
      return { calls };
    });
    const instance1 = injector.service('s1');
    const instance2 = injector.service('s1');
    expect(instance1).toBe(instance2);
    expect(calls).toBe(1);
  });

  test('inherit returns current ancestor', () => {
    const injector1 = createInjector();
    const injector2 = createInjector();
    expect(injector2.inherit()).toBeUndefined();
    expect(injector2.inherit(injector1)).toBe(injector1);
    expect(injector2.inherit()).toBe(injector1);
  });

  test('resolve dependency through ancestor chain', () => {
    const injector1 = createInjector();
    const injector2 = createInjector();
    injector1.provide('db', () => ({ name: 'pg' }));
    injector2.inherit(injector1);
    injector2.provide('repo', (services) => ({ db: services.db }));
    expect(injector2.service('repo').db).toBe(injector1.service('db'));
  });

  test('dispose without name clears providers and ancestor', () => {
    const injector1 = createInjector();
    const injector2 = createInjector();
    injector1.provide('s1', 'v1');
    injector2.inherit(injector1);
    expect(injector2.service('s1')).toBe('v1');
    injector2.dispose();
    expect(() => injector2.service('s1')).toThrow('not found');
    expect(injector2.inherit()).toBeUndefined();
    expect(injector1.service('s1')).toBe('v1');
  });

  test('dispose service that was never resolved', () => {
    const injector = createInjector();
    let calls = 0;
    injector.provide('s1', () => {
      calls += 1;
      return {};
    });
    injector.dispose('s1');
    expect(calls).toBe(0);
    expect(() => injector.service('s1')).toThrow('not found');
    injector.provide('s1', 'v1');
    expect(injector.service('s1')).toBe('v1');
  });

  test('prefer Symbol.dispose over dispose', () => {
    const injector = createInjector();
    const calls = [];
    injector.provide('s1', {
      dispose: () => calls.push('dispose'),
      [Symbol.dispose]: () => calls.push('symbol')
    });
    injector.service('s1');
    injector.dispose('s1');
    expect(calls).toEqual(['symbol']);
  });

  test('dispose failure does not block the rest', () => {
    const injector = createInjector();
    const calls = [];
    injector.provide('s1', {
      dispose: () => {
        calls.push('s1');
        throw new Error('boom');
      }
    });
    injector.provide('s2', {
      dispose: () => calls.push('s2')
    });
    injector.service('s1');
    injector.service('s2');
    expect(() => injector.dispose()).not.toThrow();
    expect(calls).toEqual(['s1', 's2']);
  });

  test('dispose unknown name is a no-op', () => {
    const injector = createInjector();
    injector.provide('s1', 'v1');
    expect(() => injector.dispose('missing')).not.toThrow();
    expect(injector.service('s1')).toBe('v1');
  });

  test('dispose empty name does not clear the container', () => {
    const injector = createInjector();
    injector.provide('s1', 'v1');
    injector.dispose('');
    expect(injector.service('s1')).toBe('v1');
  });

  test('throwing service factory can be retried', () => {
    const injector = createInjector();
    let calls = 0;
    injector.provide('s1', () => {
      calls += 1;
      if (calls === 1) {
        throw new Error('boom');
      }
      return 'recovered';
    });
    expect(() => injector.service('s1')).toThrow('boom');
    expect(injector.service('s1')).toBe('recovered');
    expect(calls).toBe(2);
  });

  test('factory returning null is a registered instance', () => {
    const injector = createInjector();
    injector.provide('s1', () => null);
    expect(injector.service('s1')).toBeNull();
    injector.dispose('s1');
    expect(() => injector.service('s1')).toThrow('not found');
  });

  test('falsy instance is re-evaluated on every lookup, current behavior', () => {
    const injector = createInjector();
    let calls = 0;
    injector.provide('s1', () => {
      calls += 1;
      return 0;
    });
    expect(injector.service('s1')).toBe(0);
    expect(injector.service('s1')).toBe(0);
    expect(calls).toBe(2);
  });
});
