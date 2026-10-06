---
title: inject v1 机制设计
description: 依赖注入容器的服务生命周期、作用域与销毁约定
last_updated: 2026-10-07
---

# inject v1 机制设计

## 定位

@epiijs/inject 是最小可用的依赖注入容器，职责边界到服务生命周期为止。

设计原则：

- **最小职责**：只管注册、实例化、缓存、销毁，不做服务发现、不做异步编排、不做生命周期钩子
- **最少依赖**：只依赖语言运行时，不引入任何 npm 包作为直接依赖
- **名字即键**：服务以字符串名注册与查询，不引入类型句柄
- **惰性求值**：首次查询才实例化，实例化结果缓存

控制流反转：消费方只按名字取实例，实例的生产与销毁托管在容器。上层框架决定容器的粒度与作用域。

## 服务生命周期

注册 → 查询（惰性实例化并缓存）→ 销毁。

### 注册 `provide(name, service)`

- `name` 或 `service` 为空值时忽略，不记录错误
- 同名重复注册直接跳过，销毁注册项后才可重新注册
- 传入函数视为工厂函数，遵循签名 `ServiceFactoryFn = (services: ServiceLocator) => unknown`
- 传入非函数值视为实例本身，查询时原样返回

### 查询 `service(name?)`

- 不传 `name`（name 为 undefined）返回服务访问器 ServiceLocator
- 命中注册项且未实例化时执行工厂函数，结果写入缓存。是否已实例化以实例真值判定，实例为假值时不缓存，每次查询重新求值
- 未命中且存在祖先容器时，沿继承链逐层回溯查找
- 回溯查询全部层级后未命中，抛出错误，错误信息包含服务名。容器没有可标识自身的名字，查找路径写不出比「回溯了 N 层」更有用的信息，错误里不给

从 1.x 开始，查询失败行为改为抛出错误，容器不提供存在性探测入口，也不提供返回 `undefined` 的备用查询入口。
及时抛出错误，相比返回空延迟到访问时 NPE 更友好，同时这也是「查询结果类型必非空」成立的前提。

工厂函数之间的相互引用靠 `invoking` 标记阻断递归：被引用方尚在求值中，应抛出错误，错误信息给出成环的服务名。
工厂函数自身抛出错误时用 `try/finally` 复位 `invoking`，确保下次查询可重新求值。

容器不关心工厂函数是否异步，不特殊处理 `async function`，总是透传第一层返回值。上层框架若关心异步语义，应自行包装。

### 服务访问器 ServiceLocator

工厂函数第一个参数即 ServiceLocator，它是容器查询的 Proxy 视图。

- 字符串属性访问等价调用 `service(name)`，未命中同样抛出错误
- 非字符串 key（例如 Symbol）视为未发生查询，返回 undefined
- 只解析服务名，不暴露容器方法；名为 `service` 或 `provide` 的属性同样按服务名解析

### 销毁 `dispose(name?)`

- 传 `name`：销毁该实例并移除注册项，未注册的名字无操作
- 不传：销毁全部实例、清空所有注册项、断开继承关系
- 判断依据是参数缺省，`dispose('')` 按未注册名处理，不触发清空

销毁约定：优先取实例的 `Symbol.dispose` 方法，其次取 `dispose` 方法，只要其一可调用即执行。销毁过程中的异常静默忽略，不阻断其余实例的销毁。

## 容器作用域

通过容器隔离与容器继承实现作用域。容器 B 继承容器 A 后，从 B 发起的查找先看 B，未找到沿继承链回溯到 A。

- `inherit(another)` 建立继承，返回当前祖先
- `inherit()` 不带参数只读取当前祖先
- 继承链禁止循环引用，检测到回指自身时抛 `circular dependency`

@epiijs/server 场景只用两层作用域：进程级与会话级。更细粒度的请求级作用域等价于无缓存实例化，由上层自建短生命周期容器实现，本容器不提供缓存策略定制。

## API 类型化

业界有许多类型化依赖容器的机制，参考调研报告 `docs/report-typed-di.md`。

目标是让解析结果带上使用方声明的服务类型，不再需要 `as` 断言，也不需要链式判空。
类型化不引入构建步骤、tsconfig 开关与运行时依赖。
它要求「不存在」不再占用返回值，因此从 1.x 开始把查询未命中、循环初始化都改为抛出错误。

声明合并的落点是服务访问器类型本身：`ServiceLocator` 由 type alias 改为 interface，按族规范取 `I` 前缀名 `IServiceLocator`，旧名保留为 `type ServiceLocator = IServiceLocator` 并标记 `@deprecated`，既有 `import type { ServiceLocator }` 编译照过、逐步迁移即可。类型带字符串索引签名，不引入独立的名字到类型映射表。

```ts
export interface IServiceLocator {
  [key: string]: unknown;
}

export type ServiceLocator = IServiceLocator;

service<K extends string>(name: K): IServiceLocator[K];
service(): IServiceLocator;
```

使用方以 `declare module '@epiijs/inject'` 向 `IServiceLocator` 追加成员，属性访问与 `service(name)` 同时取到声明的类型。扩充必须落在 interface 上，落在别名上报 `Duplicate identifier`，且诊断指向库的声明文件，不直观。
多方追加按 TypeScript 的声明合并处理，是并集不是替换：成员名不同则共存，同名且类型相同则合并通过，同名而类型不同则报编译错误。
本容器只提供落点，不规定谁来声明、声明什么。

容器不提供服务名的拼写防护：索引签名让 `keyof ServiceLocator` 塌缩为 `string | number`，未声明的名字照样通过编译，取不到时由运行时抛错。
取舍过程见报告。

## 不在计划的能力

- **服务发现**：不内置从 IO 发现和加载服务的机制，这是上层框架的业务行为。参照 Log4J 远程执行漏洞的教训，容器缺少业务边界信息不能提供通用安全设计。
- **带参查询**：对于 ServiceLocator 来说，查询参数没有带来额外的价值。函数参数本身可以作为一种依赖注入场景自举，可能导致意外的复杂度。
- **缓存定制**：如果使用方不希望有缓存，可以自行实现生命周期更短的挂载实例关联容器。
