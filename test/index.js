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
    const testValue1 = 1;
    const testValue2 = 2;
    const serviceFn1 = () => testValue1;
    const serviceFn2 = (services) => services.s1 + 1;
    injector.provide('s1', serviceFn1);
    injector.provide('s2', serviceFn2);
    const instance1 = injector.service('s1');
    const instance2 = injector.service('s2');
    assert.deepEqual(instance1, testValue1);
    assert.deepEqual(instance2, testValue2);
  });

  it('provide circular service', () => {
    const injector = createInjector();
    const evaluted = { s0: false, s1: false, s2: false };
    const serviceFn0 = (services) => { evaluted.s0 = true; return services.s0; }
    const serviceFn1 = (services) => { evaluted.s1 = true; return services.s2; }
    const serviceFn2 = (services) => { evaluted.s2 = true; return services.s1; }
    injector.provide('s0', serviceFn0);
    injector.provide('s1', serviceFn1);
    injector.provide('s2', serviceFn2);
    const instance0 = injector.service('s0');
    const instance1 = injector.service('s1');
    const instance2 = injector.service('s2');
    assert.deepEqual(evaluted, { s0: true, s1: true, s2: true });
    assert.deepEqual(instance0, undefined);
    assert.deepEqual(instance1, undefined);
    assert.deepEqual(instance2, undefined);
  });

  it('dispose service', () => {
    const injector = createInjector();
    const disposed = { s1: false, s2: false };
    const service1 = {
      dispose: () => {
        disposed.s1 = true;
      }
    };
    // const service2 = {
    //   [Symbol.dispose]: () => {
    //     disposed.s2 = true;
    //   },
    //   dispose: () => {
    //     disposed.s2 = false;
    //   }
    // };
    injector.provide('s1', service1);
    // injector.provide('s2', service2);
    injector.service('s1');
    // injector.service('s2');
    injector.dispose();
    const instance1 = injector.service('s1');
    // const instance2 = injector.service('s2');
    assert.deepEqual(instance1, null);
    assert.deepEqual(disposed.s1, true);
    // assert.deepEqual(instance2, null);
    // assert.deepEqual(disposed.s2, true);
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
