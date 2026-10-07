# @epiijs/inject

[English](https://github.com/epiijs/inject/blob/main/README.en.md)

提供一种简单的依赖注入容器。
服务提供方可以把工厂函数或服务实例注册到容器，使用方使用注册的名字获取实例（用时初始化、实例化后缓存）。
容器的宿主可在需要的时机销毁容器。实例的生产与释放都托管在容器，使用方不需要关注。

## 安装

```bash
npm i --save @epiijs/inject
```

## 用法

```typescript
import { createInjector } from '@epiijs/inject';

const injector = createInjector();

injector.provide('UserService', () => ({
  connect: () => {},
  dispose: () => {}
}));

// 可选：使用方声明服务名和服务类型映射，这样查询结果会按声明匹配类型
declare module '@epiijs/inject' {
  interface IServiceLocator {
    UserService: {
      connect: () => void;
      dispose: () => void;
    };
  }
}

const userService = injector.service('UserService');
userService.connect();

injector.dispose();
```

## API

```typescript
export function createInjector(): IInjector;

export interface IInjector {
  provide: (name: string, service: ServiceFactoryFn | unknown) => void;
  service<K extends string>(name: K): IServiceLocator[K];
  service(): IServiceLocator;
  inherit: (injector?: IInjector) => IInjector | undefined;
  dispose: (name?: string) => void;
}

export type ServiceFactoryFn = (services: IServiceLocator) => unknown;

export interface IServiceLocator {
  [key: string]: unknown;
}
```

### injector.provide

`provide(name, service)` 注册服务，无返回值。

- 传入函数视为服务实例的工厂函数，首次查询时求值并缓存。工厂的第一个参数是服务访问器，可以用它获取其他服务
- 传入非函数值视为服务实例本身，查询时原样返回
- `name` 或 `service` 为假值时静默忽略，视为未发生调用
- 重复注册同名服务，会直接跳过，销毁该注册项后可以重新注册

```typescript
export interface IUserService {
  connect: () => void;
  dispose: () => void;
}

export const userService: IUserService = {
  connect: () => {},
  dispose: () => {}
};

// 注册实例
injector.provide('UserService', userService);

// 注册工厂，第一个参数是服务访问器
injector.provide('PlanService', (services) => {
  return { user: services.UserService };
});
```

### injector.service

`service(name)` 根据名字查询服务，返回实例。

- 查询未匹配到结果会抛出错误 `service "<name>" not found`，容器不提供存在性探测入口，也不提供无异常的返回 `undefined` 的查询行为
- 首次查询到服务（函数）时，会尝试调用（工厂）函数求值并缓存值作为服务实例
- 工厂函数内部触发其他服务的工厂函数成环时，会抛出错误 `circular dependency on "<name>"`，不会返回不完整的实例
- 工厂函数自身抛出错误时，下次查询会重新求值，失败的结果不会被缓存
- 服务实例为假值时不缓存，每次查询重新求值

```typescript
const userService = injector.service('UserService'); // IUserService
```

`service()` 不传名字时返回服务访问器，见下节。

查询结果的类型来自 `IServiceLocator` 的合并声明。
如果使用方没有合并注册服务的类型声明，匹配到的服务实例类型为 `unknown`。

### IServiceLocator

服务访问器，`service()` 的返回值，也是工厂第一个参数的类型。
它是容器的服务查询能力的 Proxy 视图，同时也是使用方 `declare module` 的类型声明合并预埋类型。

- 访问其字符串属性等价于调用 `service(name)`
- 非字符串 key（例如 Symbol）视为未发生查询操作，返回 `undefined`
- 多方关于 `IServiceLocator` 的类型声明，按 TypeScript 行为发生合并：成员名不同或同名同型则共存，同名异型则编译报错
- 旧名 `ServiceLocator` 保留为 `@deprecated` 别名，请尽快换用 `IServiceLocator`

```typescript
declare module '@epiijs/inject' {
  interface IServiceLocator {
    UserService: IUserService;
  }
}

// IUserService
injector.service('UserService');

const services = injector.service();
// IUserService，等价于一次按名查询
services.UserService;
```

### injector.inherit

`inherit(another)` 把另一个容器链接为祖先，返回当前祖先。
`inherit()` 不带参数只读取当前祖先。

从当前容器发起的服务查询先从当前容器匹配，未匹配到会沿着继承链逐层回溯。
常用于区分作用域，并让更细粒度的作用域能够有机会访问到更宽泛的作用域的容器。

```typescript
const injector = createInjector();
const ancestor = createInjector();
ancestor.provide('UserService', userService);

// 返回 ancestor
injector.inherit(ancestor);

// 回溯到祖先容器后匹配到
injector.service('UserService');

// 读回 ancestor
injector.inherit();
```

继承链禁止循环引用，检测到指向自身时抛出 `circular dependency`。

### injector.dispose

`dispose(name)` 销毁指定名字的服务实例并移除注册项。
`dispose()` 销毁全部实例、清空所有注册项、断开继承关系。

- 未注册的名字不触发实际操作
- 销毁只对已实例化的服务生效；值注册的服务在首次查询前，没有实例，销毁时不会调用它的销毁句柄，容器也不会为了销毁而强制实例化
- 销毁句柄优先取 `Symbol.dispose`，其次取 `dispose`
- 销毁过程中的异常会被忽略，不阻断其他实例的销毁

```typescript
const disposable = {
  [Symbol.dispose]: () => console.log('disposed'),
  // 没有 Symbol.dispose 时才取 dispose
  dispose: () => console.log('disposed')
};

injector.provide('UserService', disposable);

// 实例化，此后销毁才有对象
injector.service('UserService');
// console output: disposed
injector.dispose('UserService');
// 销毁整个容器
injector.dispose();
```

## 不在职责内的能力

- 不提供服务发现：不从文件系统或网络隐式加载服务。这是因为容器缺少来自业务的约束信息，给不出通用安全设计，服务发现是上层框架的业务行为
- 不处理工厂的异步语义：总是透传第一层返回值。上层框架如果关心异步，应自行包装
- 不提供带参查询：查询的唯一匹配特征是服务名字，工厂函数不应该根据参数表现出多态性
- 不提供缓存策略定制：如果需要更短的生命周期，就实例化一个更短命周期的容器

机制细节见 `docs/design-v1.md`。
