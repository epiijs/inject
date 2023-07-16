const assert = require('assert');
const { Injector } = require('../build');

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

  it('provide writable service', () => {
    const injector = new Injector();
    const oldValue = '1';
    const newValue = '2';
    injector.provide('s1', oldValue, { writable: true });
    injector.provide('s2', oldValue, { writable: false });
    injector.provide('s3', oldValue);
    injector.provide('s1', newValue);
    injector.provide('s2', newValue);
    injector.provide('s3', newValue);
    const instance1 = injector.service('s1');
    const instance2 = injector.service('s2');
    const instance3 = injector.service('s3');
    assert.deepEqual(instance1, newValue);
    assert.deepEqual(instance2, oldValue);
    assert.deepEqual(instance3, newValue);
  });

  it('provide callable service', () => {
    const injector = new Injector();
    const testValue = '1';
    const serviceFn = () => testValue;
    injector.provide('s1', serviceFn, { callable: true });
    injector.provide('s2', serviceFn, { callable: false });
    injector.provide('s3', serviceFn);
    const instance1 = injector.service('s1');
    const instance2 = injector.service('s2');
    const instance3 = injector.service('s3');
    assert.deepEqual(instance1, testValue);
    assert.deepEqual(instance2, serviceFn);
    assert.deepEqual(instance3, testValue);
  });

  it('provide callable service with injector args', () => {
    const injector = new Injector();
    const testValue = '1';
    const serviceFn1 = () => testValue;
    const serviceFnX = (injector) => {
      const instance = injector.service('s1');
      return instance;
    };
    injector.provide('s1', serviceFn1, { callable: true });
    injector.provide('sX', serviceFnX, { callable: true });
    const instance1 = injector.service('s1');
    const instanceX = injector.service('sX');
    assert.deepEqual(instance1, testValue);
    assert.deepEqual(instanceX, testValue);
  });

  it('provide disposable service', () => {
    const injector = new Injector();
    const disposed = { result: false };
    const service1 = {
      dispose: () => {
        console.log('dispose');
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
});
