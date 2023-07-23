const assert = require('assert');
const { Injector, SymbolInjector } = require('../build');

describe('injector', () => {
  it('new and dispose injector', () => {
    const injector = new Injector();
    const service1 = {};
    injector.provide('s1', service1);
    injector.dispose();
    const instance = injector.service('s1');
    assert.deepEqual(instance, null);
  });

  it('provide nothing', () => {
    const injector = new Injector();
    const service1 = {};
    injector.provide('', service1);
    injector.provide('s1', '');
    const instance1 = injector.service('');
    const instance2 = injector.service('s1');
    assert.deepEqual(instance1, null);
    assert.deepEqual(instance2, null);
  });

  it('provide simple service', () => {
    const injector = new Injector();
    const service1 = {};
    injector.provide('s1', service1);
    const instance = injector.service('s1');
    assert.deepEqual(instance, service1);
  });

  it('provide more than once', () => {
    const injector = new Injector();
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
    const injector = new Injector();
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
    const injector = new Injector();
    const testValue1 = '1';
    const testValue2 = '2';
    const serviceFn0 = () => testValue1;
    const serviceFn1 = (options) => {
      const injector = options[SymbolInjector];
      const instance = injector.service('s0');
      return instance;
    };
    const serviceFn2 = (options) => {
      const injector = options[SymbolInjector];
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
    const injector = new Injector();
    const disposed = { result: false };
    const service1 = {
      dispose: () => {
        disposed.result = true;
      }
    };
    injector.provide('s1', service1);
    injector.service('s1');
    injector.dispose();
    const instance1 = injector.service('s1');
    assert.deepEqual(instance1, null);
    assert.deepEqual(disposed.result, true);
  });

  it('inherit injector', () => {
    const injector1 = new Injector();
    const injector2 = new Injector();
    const testValue = '1';
    injector2.inherit(injector1);
    injector1.provide('s1', testValue);
    const instance1 = injector1.service('s1');
    const instance2 = injector2.service('s1');
    assert.deepEqual(instance1, testValue);
    assert.deepEqual(instance2, testValue);
  });

  it('inherit circular injector', () => {
    const injector1 = new Injector();
    const injector2 = new Injector();
    assert.throws(() => {
      injector1.inherit(injector1);
    })
    assert.throws(() => {
      injector1.inherit(injector2);
      injector2.inherit(injector1);
    })
  });
});
