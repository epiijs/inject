const assert = require('assert');
const { createInjector, Symbols } = require('../build');

describe('injector', () => {
  it('create and dispose injector', () => {
    const injector = createInjector();
    const service1 = {};
    injector.provide('s1', service1);
    injector.dispose();
    const instance = injector.service('s1');
    assert.deepEqual(instance, null);
  });

  it('provide nothing', () => {
    const injector = createInjector();
    const service1 = {};
    injector.provide('', service1);
    injector.provide('s1', '');
    const instance1 = injector.service('');
    const instance2 = injector.service('s1');
    assert.deepEqual(instance1, null);
    assert.deepEqual(instance2, null);
  });

  it('provide simple service', () => {
    const injector = createInjector();
    const service1 = {};
    injector.provide('s1', service1);
    const instance = injector.service('s1');
    assert.deepEqual(instance, service1);
  });

  it('provide more than once', () => {
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
    assert.deepEqual(instance1, oldValue);
    assert.deepEqual(instance2, newValue);
  });

  it('provide callable service', () => {
    const injector = createInjector();
    const testValue1 = '1';
    const testValue2 = '2';
    const serviceFn = (options) => options?.value || testValue1;
    injector.provide('s1', serviceFn);
    injector.provide('s2', serviceFn);
    const instance1 = injector.service('s1');
    const instance2 = injector.service('s2', { value: testValue2 });
    assert.deepEqual(instance1, testValue1);
    assert.deepEqual(instance2, testValue2);
  });

  it('provide callable service with injector args', () => {
    const injector = createInjector();
    const testValue1 = '1';
    const testValue2 = '2';
    const serviceFn0 = () => testValue1;
    const serviceFn1 = (options) => {
      const injector = options[Symbols.injector];
      const instance = injector.service('s0');
      return instance;
    };
    const serviceFn2 = (options) => {
      const injector = options[Symbols.injector];
      const instance = injector.service('s1');
      return [instance, options.value];
    };
    injector.provide('s0', serviceFn0);
    injector.provide('s1', serviceFn1);
    injector.provide('s2', serviceFn2);
    const instance1 = injector.service('s1');
    const instance2 = injector.service('s2', { value: testValue2 });
    assert.deepEqual(instance1, testValue1);
    assert.deepStrictEqual(instance2, [testValue1, testValue2]);
  });

  it('dispose service', () => {
    const injector = createInjector();
    const disposed = { s1: false, s2: false };
    const service1 = {
      dispose: () => {
        disposed.s1 = true;
      }
    };
    const service2 = {
      [Symbols.disposer]: () => {
        disposed.s2 = true;
      },
      dispose: () => {
        disposed.s2 = false;
      }
    };
    injector.provide('s1', service1);
    injector.provide('s2', service2);
    injector.service('s1');
    injector.service('s2');
    injector.dispose();
    const instance1 = injector.service('s1');
    const instance2 = injector.service('s2');
    assert.deepEqual(instance1, null);
    assert.deepEqual(disposed.s1, true);
    assert.deepEqual(instance2, null);
    assert.deepEqual(disposed.s2, true);
  });

  it('inherit injector', () => {
    const injector1 = createInjector();
    const injector2 = createInjector();
    const testValue = '1';
    injector2.inherit(injector1);
    injector1.provide('s1', testValue);
    const instance1 = injector1.service('s1');
    const instance2 = injector2.service('s1');
    assert.deepEqual(instance1, testValue);
    assert.deepEqual(instance2, testValue);
  });

  it('inherit circular injector', () => {
    const injector1 = createInjector();
    const injector2 = createInjector();
    assert.throws(() => {
      injector1.inherit(injector1);
    })
    assert.throws(() => {
      injector1.inherit(injector2);
      injector2.inherit(injector1);
    })
  });
});
