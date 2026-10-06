---
title: DI 类型化调研与决策
description: TypeScript 依赖注入类型化的业界机制调研、本仓取舍与最终路线
last_updated: 2026-10-07
---

# 背景

server 提出 inject 应当支持类型发现，诉求是让消费方解析到服务对象时不必手写断言：

```ts
const userService = this.userService as IUserService;   // 现状
this.userService.connect();                             // 期望
```

本文回答两个问题：业界用哪些机制达成，inject 采用哪一种。文中的行为判断以编译器诊断与运行时实测为依据，实测环境为 TypeScript 5.9.3、Node v24.14.0。

## 术语约定

| 术语 | 指代 |
|---|---|
| 容器 | inject 提供的 `IInjector` 实例 |
| 服务名 | 容器注册与解析所用的字符串键 |
| 类型注册表 | 服务名到实例类型的映射，由库预先声明一份供各方扩充。业界多以独立接口承载，本仓的扩充落点是服务访问器 `ServiceLocator` 本身 |
| 封闭注册表 / 开放注册表 | 类型注册表不带索引签名 / 带索引签名 |
| 服务访问器 | `service()` 无参返回的 Proxy 视图，即 `ServiceLocator` |
| 工厂函数 | `ServiceFactoryFn`，注册进容器的函数形态服务 |
| 消费方 / 提供方 | 解析依赖的一方 / 注册服务的一方 |
| 框架侧 / 应用侧 | `@epiijs/server` / 使用 server 的业务代码 |
| 调用点 | 消费方发起解析的代码位置 |
| token | 携带泛型参数的运行时句柄，取代字符串服务名的标识对象 |
| 模块扩充 | TypeScript 的 module augmentation，配合声明合并向既有接口追加成员 |
| 编译期 / 构建期 | `tsc` 的类型检查与代码发射阶段 / 项目构建流程，含 bundler 与外部工具步骤 |
| 发射 | 编译器写出额外运行时数据，如 `design:paramtypes` |
| 名义性 | 类型不可互相替换的性质，与「同一标识只对应一个对象」的身份唯一性相区分 |
| 编译期防护 | 拼写错误、未注册名等由编译器报错拦截 |
| 兜底入口 | 与类型化解析入口并存的、接受任意字符串服务名的解析入口 |
| 类型承诺失真 | 类型声称非空而运行时可得 `undefined` |

## 前提：类型信息只有三条传递通道

TypeScript 的类型在编译后被擦除，运行时不存在可被查探的类型信息。要让容器知道消费方需要什么类型，类型信息必须经以下三条通道之一到达：

```
编译期物化为运行时数据   →  类型元数据
构建期改写或生成代码     →  编译器插件、代码生成
声明处由消费方显式绑定   →  token、注册点类型累加、可扩充的类型注册表
```

业界所说「类型发现」混用了两件事：运行时按类型解析依赖（需前两条通道），与编译期推导解析返回的类型（第三条通道即可，零运行时开销）。server 的诉求属于后者。

# 业界机制

## 1 类型元数据

代表：NestJS、tsyringe、TypeScript legacy 装饰器模式下的 Angular。

原理：开启 `experimentalDecorators` 与 `emitDecoratorMetadata` 后，编译器为被装饰的类发射 `Reflect.metadata('design:paramtypes', [...])`，容器在运行时用 `Reflect.getMetadata` 读出构造参数类型。

实测发射值：20 种声明类型中只有 2 种产出可辨识引用，且都是值导入的具体 class。

| 声明类型 | 发射值 |
|---|---|
| `interface`、`type` 别名、泛型、联合、交叉、`unknown`、`any` | `Object` |
| 仅类型导入的 class | `Function` |
| 函数类型 | `Function` |
| 元组 | `Array` |
| `enum` | `Number` |
| 字符串字面量类型 | `String` |
| `null` / `never` | `void 0` |
| 值导入的 class | 该 class 引用 |

发射只覆盖被装饰的声明；缺 `reflect-metadata` 时发射出的 helper 静默空转，类型信息无声消失。

该通道的现状：`emitDecoratorMetadata` 不与 `experimentalDecorators` 同用即为配置错误（TS5052）；TC39 标准装饰器路径不发射类型元数据；`Symbol.metadata` 在 Node 24.14 未实现；esbuild 官方文档声明不支持该选项；Angular CLI 的工作区 tsconfig 模板仅保留 `experimentalDecorators`，已无 `emitDecoratorMetadata`，其依赖元数据改由 ngtsc 在编译期产出。

## 2 编译器改写调用点

代表：NovaDI、Clawject。

原理：构建期接入 transformer，读取构造参数类型注解，改写调用点补入解析代码。NovaDI 的产物形如 `.autoWire({ mapResolvers: [(c) => c.resolveType('IEventBus'), undefined] })`，数组按参数位置排布，基本类型位置为空，需手工补映射。

代价：绑定专属构建管线，`tsc` 直接编译与 Node 类型剥离两种场景均无接入点。脱离 transformer 时 `.as<ILogger>()` 无法取得注入的字符串，token 退化为随机标识，解析全部落空；其 bundler 插件在改写报错时仅打印日志并返回原代码，报错被吞没。项目规模小（v0.6.1，月下载量百级）。

## 3 构建期代码生成

原理：在主编译流程之外增设构建步骤，读取真源（类型声明、目录、schema），生成实现代码或类型声明文件。

**生成实现**，代表 dipstick。消费方把容器声明为类型别名，在绑定表中给出实现与生命周期：

```ts
export type AppContainer = Container<{
  bindings: {
    database: Reusable<Database>;
    userService: Transient<UserService, IUserService>;
    userHandler: Reusable<typeof createUserHandler>;   // 工厂函数，类型取 ReturnType
  };
}>;
// npx dipstick generate ./tsconfig.json  →  AppContainerImpl
const container = new AppContainerImpl();
container.userService();                                // IUserService
```

生成器经 ts-morph 读取每个实现的参数类型，在绑定表内按类型匹配，将结果展开为直接调用，运行时不做反射与字符串查找。约束是同容器内两个绑定不得返回同一类型；产物为 class，消费方使用 `new`。

**生成类型声明**，代表 Astro Content Collections、SvelteKit `$env/static/*`、Prisma、Sanity typegen：把运行期或外部真源固化为生成的 `.d.ts`，使 `keyof` 可用。对本仓的对应形态是 server 扫描 `services/` 目录后生成对 `ServiceLocator` 的模块扩充声明。该形态消费侧类型精确且零运行时开销，代价是新增构建步骤与构建排序，以及生成文件缺失导致的陈旧状态：实测此时 `keyof` 退化为 `never`，诊断信息不具指向性。

## 4 token（声明处泛型绑定）

代表：Angular `InjectionToken`、Effect `Context`、VS Code `createDecorator`、InversifyJS。

原理：把类型冻结在运行时句柄的泛型参数上，解析时由编译器做类型级查表。

```ts
const userToken = new InjectionToken<IUserService>('UserService');
injector.get(userToken);                    // IUserService
```

实测与源码核对到的名义性与身份唯一性来源：

- Angular `InjectionToken<T>` 无 brand 字段，`T` 不参与类型区分，同类型的两个 token 在编译期可互相替换；身份唯一性纯靠对象身份维持，失配只在运行时以错误暴露。
- 在 TypeScript 中加 brand 也不能获得名义性：可选幻影 `__type?: T` 与必填 `readonly brand: T` 在同一 `T` 下仍是结构类型，可互相赋值；只有 `unique symbol` 构成真名义类型。
- VS Code 用字符串标识的记忆化取得身份唯一性：`createDecorator<T>(serviceId)` 以全局 `Map<string, ServiceIdentifier<any>>` 保证同一 serviceId 恒得同一对象，名义性来自标识而非泛型参数。
- Effect 的 tag 同时携带幻影类型与 `key: string`，运行时以 `key` 作身份，同 `key` 即同槽位。其独有能力是让依赖随产出的值携带：`Layer.provide` 的类型为 `Layer<ROut2, E | E2, RIn | Exclude<RIn2, ROut>>`，未被满足的依赖留在 `RIn` 中，直到 `build` 将其消除，因而工厂函数的依赖声明无法与实现脱离。代价是工厂函数必须是 Layer，组合需经 DSL。
- InversifyJS 的 `ServiceIdentifier<T> = string | symbol | Newable<T> | AbstractNewable<T>`，字符串与 symbol 不携带类型，需调用点自行给出。

## 5 注册点类型累加

代表：typed-inject、ITI、awilix。

原理：注册函数返回类型累加后的容器类型，类型注册表以容器类型参数存在，而非全局接口。

```ts
// typed-inject@5.0.0，零运行时依赖
const injector = createInjector()
  .provideFactory('user', createUser);
injector.resolve('user');                   // 类型来自注册链

// ITI@0.8.0：服务名为字符串键，add 返回类型累加后的容器，并在类型层拒绝重复注册
container.add({ userService: (items) => ... });
container.get('userService');
```

typed-inject 另外解决了最困难的一环：工厂函数内部依赖的编译期约束。工厂函数显式声明依赖元组，参数类型由元组查表得出，与签名不符即编译错误：

```ts
function createUser(deps: IUserService) { ... }
createUser.inject = ['userService'] as const;   // 与签名逐位校验
```

同类机制的共同失效点在动态注册：循环注册时服务名被放宽为 `string`，累加类型停止增长。

```ts
for (const s of scannedModules) container.register(s.name, s.factory);  // 此后无类型可推
```

awilix 因此保留一条兜底入口 `resolve<T>(name: string | symbol): T`，其目录扫描 API `listModules()` 返回无类型描述符，走的正是这条兜底入口。实测：兜底入口若做成同名重载，拼写错误被静默接住，封闭注册表提供的编译期防护被抵除；要保住防护，兜底入口必须另起方法名。

运行时语义上，awilix 解析未命中与循环依赖都抛 `AwilixResolutionError`，错误信息指出缺哪个依赖或谁成环；要拿到 `undefined` 必须显式传 `allowUnregistered: true`。即「解析失败默认抛错，返回空值是显式选择的例外」。

## 6 可扩充的类型注册表

代表：`@inversifyjs/strongly-typed`、Fastify 的装饰器类型、Hono 的 `ContextVariableMap`。

原理：库声明一个类型注册表接口，解析签名从该接口取键与取值；各方通过模块扩充向它追加成员。

```ts
// 库侧
export interface ServiceRegistry { [key: string]: unknown }
service<K extends keyof ServiceRegistry>(name: K): ServiceRegistry[K];

// 任一方追加成员
declare module 'some-di' {
  interface ServiceRegistry { appLogger: IAppLogger }
}
```

实测该机制的两条可见性性质：一方追加的成员，对引入了该方类型声明的所有程序文件生效，因此上层框架追加的内置服务对其使用方自动可用，使用方不必重复声明；反之，追加成员所在文件未进入编译范围时，那些成员不可见，诊断表现为服务名不在类型范围内。

多方各自追加成员时表现为声明合并，是并集不是替换，实测如下：成员名不同则共存，`keyof` 取到的是各方成员的并集；同名且类型相同则静默合并，等价于一条声明；同名而类型不一致则报 TS2717，错误落在后声明的一方，先前声明的类型生效。该冲突检查在注册表类型被解析时进行，程序中没有任何文件引用该模块时不报，因此它不是无条件的保障，只在有使用方引用时兜住冲突。

InversifyJS 的实现是一个纯类型包（`dependencies: null`），不改动运行时：`TypedContainer<T extends BindingMap = any>`，并以 `IfAny<T, ServiceIdentifier, keyof T>` 在封闭与开放之间切换。其文档同时声明：动态绑定场景应改用未经类型约束的容器。实测该开关会漏出 `any`（默认类型实参为 `any` 时，返回值可赋给字面量类型），不可直接沿用。

本机制的固有弱点是类型注册表与真实注册集合之间无校验：扩充了未注册的服务名，编译器无从发现。

# 未命中的运行时语义

类型承诺能否非空，取决于运行时怎么表达「查不到」。这一节取证 .NET 与 Midway 两家成熟容器，并回看本仓自己的沿革。

## .NET

一手来源：`dotnet/runtime` 的 `Microsoft.Extensions.DependencyInjection.Abstractions/src/ServiceProviderServiceExtensions.cs`。

```csharp
public static T? GetService<T>(this IServiceProvider provider) => (T?)provider.GetService(typeof(T));   // 未注册返回 null

public static object GetRequiredService(this IServiceProvider provider, Type serviceType)
{
    object? service = provider.GetService(serviceType);
    if (service == null)
        throw new InvalidOperationException(SR.Format(SR.NoServiceRegistered, serviceType));
    return service;
}

public static T GetRequiredService<T>(this IServiceProvider provider) where T : notnull;   // 返回非空 T
```

同一个查询做成两个入口：可空的那个返回 `T?`，非空类型只挂在会抛错的入口上，两者配对出现。构造依赖在解析图中缺失同样抛错；`ServiceProvider.cs` 另有 `ValidateOnBuild`，在构建容器时逐个校验注册项、收集异常后抛 `AggregateException("Some services are not able to be constructed", ...)`，`ValidateScopes` 另行校验跨作用域捕获。即 .NET 同时提供可空查询入口、必得查询入口与启动期图校验三种机制。

## Midway

一手来源：`@midwayjs/core@4.2.5` 发布产物。

```js
// dist/error/framework.js:43-50
class MidwayDefinitionNotFoundError extends MidwayError {
  constructor(id, name, creationPath) {
    super(creationPath
      ? `Definition for "${name ?? id}" not found in current context. Detection path: "${creationPath.join(' -> ')}"`
      : `Definition for "${name ?? id}" not found in current context.`, FrameworkErrorEnum.DEFINITION_NOT_FOUND);
```

抛出点在 `dist/context/managedResolverFactory.js:59`、`:82`、`:149`，解析未命中一律抛错，第三处还带依赖创建路径，直接指出断链或成环在哪条链上。存在性判断是独立 API：`hasDefinition(identifier): boolean`（`dist/context/requestContainer.d.ts:13`、`dist/context/definitionRegistry.js:81`）。Midway 的模型是装饰器加 class，与本仓不同，但「查不到」的取向明确：抛错，另给显式探测口。

## 归纳

两家都不把「解析未命中返回空值」当作默认语义；需要空值时给一个命名清楚的可空查询入口或探测接口。业界的组合只有两种：可空返回值配可空类型，非空类型配必抛入口。不存在「运行时可空而类型非空」的第三种，那等于让类型承诺失真。

## 本仓沿革

`4eab3b2`（从 epii-server 拆出的初版）未命中分支写的是 `return null`，无抛错路径。`aef8017` 的提交名即 "throw circular inherit"：同一次提交里给循环继承加了 `throw new Error('circular dependency')`，同时把未命中的 `return null` 改成 `return undefined`。当时的划分标准是「容器结构被写错属编程错误，抛错；某个名字此刻没有属运行时状态，返回空值」。`600fec4` 又把工厂间的成环归入空值一侧，公开签名的调用点泛型也在此列被当作 confusing 移除。

这条线没有成文理由：`ref: projects/inject.md` 未规定未命中行为，框架侧只有 `ref: projects/server.md:210`「访问不存在的服务实例，返回 `undefined`，框架不全局感知这个现象」。

本轮改判：实践中取不到服务几乎都是注册与声明不一致或服务名拼写错误，属编程错误，与循环继承写错同类，应当抛错并就近暴露；「框架不全局感知」不等于消费方可以拿到一个静默的 `undefined`。本仓不采用 .NET 的可空查询入口，也不提供 Midway 式的存在性探测接口，需要判断存在性的场景由上层自行处理。

# 事实层面的两条约束

上述取证收敛出两条与设计直接相关的结论，均有本地实测与一手来源支撑：

1. **注册侧与消费侧必须分治。** 封闭注册表容不下运行时得到的服务名，查询与注册两侧同时报错，而 server 的服务名来自目录扫描。业界一致以兜底入口解决：awilix 的重载、Inversify 的 `any` 切换、Angular 直接把 `Provider.provide` 声明为 `any`。
2. **索引签名不等于类型失效。** 已知服务名与索引签名共存时，已知服务名仍保有自己的精确类型，代价仅是不拦截未知服务名。实测开放注册表下 `service('appLogger').info(...)` 与服务访问器属性均有类型，未知名解析得 `unknown`。

# 取舍

取舍前提：不改动消费方的工具链。

| 机制 | 判定 | 理由 |
|---|---|---|
| 1 类型元数据 | 弃 | 需消费方改 tsconfig 并引入 polyfill；类型信息只对 class 保真，本仓服务以 `interface` 描述、以工厂函数生产，通道前提失效 |
| 2 编译器改写调用点 | 弃 | 需消费方接入专属构建管线，与 `tsc` 直接编译、Node 直接运行冲突 |
| 3 构建期代码生成 | 弃，暂不采用 | 类型精度最高，但需新增生成步骤与构建排序；且本仓的扫描发生在运行时，须 server 配合改造，非单方可决 |
| 4 token | 弃 | 破坏 `declare()` 的字符串服务名契约与服务访问器的属性访问写法；名义性不来自泛型参数，需另建标识记忆化；与 design-v1「名字即键，不引入类型句柄」直接冲突 |
| 5 注册点类型累加 | 弃，注册侧不成立 | 循环注册即退化；`provide` 需返回新的容器类型，与容器原地变异的事实矛盾 |
| 6 可扩充的类型注册表 | 取 | 零构建侵入、零运行时开销、注册侧签名不变、既有消费方不受影响 |

机制 5 中 typed-inject 的依赖元组思路，是本轮所见唯一能约束工厂函数内部依赖的做法，但它要求把「单个服务访问器入参、按属性读取」换成「位置参数、显式依赖声明」，属核心模型变更，不纳入本轮范围，记录备查。

# 决定

采用 §6 的可扩充声明合并机制，扩充落点直接是服务访问器 `ServiceLocator`，不另立映射表接口。开放形态下独立映射表不产生任何额外能力（同名解析、未声明名退化、`keyof` 取值与直接扩充访问器逐项一致，实测），它唯一能换来的是封闭形态的退路，而该退路已判定无实用价值。机制、接口形状与声明合并行为以 `docs/design-v1.md`「API 类型化」为准，本文不复述。

与非空类型承诺配套，运行时语义同时改判：查询未命中与依赖成环一律抛错。「不存在」不再占用返回值通道，`service(name)` 的返回类型才能真的非空。本仓不采用 .NET 的双入口，也不提供 Midway 式的存在性探测口，保持单一查询语义。

判定依据见上一节的取舍表。本路线明确放弃两样东西：

- **服务名拼写的编译期防护**。`ServiceLocator` 要容纳运行时扫描得到的动态名，必须带字符串索引签名，`keyof` 因此塌缩为 `string | number`，未声明的名字照样通过编译，取不到时当场抛错。封闭形态能拿到这层防护，代价是所有查询名必须在编译期齐备，动态名场景还要另起一条接受任意字符串的入口（实测同名重载会抵除防护）。名字一经登记在带索引签名的访问器上，已声明集合在类型层不可恢复，封闭视图无从派生，这条退路是关闭而非暂缓。本轮判定封闭形态无实用价值
- **声明与真实注册集合之间的一致性校验**。采用同类机制的库一律不设此校验（InversifyJS、Fastify、Hono 均如此）；注册即声明的机制（typed-inject、dipstick）天然一致，但要求注册全部发生在字面量调用点，与本仓服务名来自运行时扫描的前提不合。抛错把这种失配的后果从「取用成员时才失败」变成「当场抛错并报出服务名」，仍不等于校验

# 待决事项

已在 `docs/design-v1.md`「API 类型化」与「服务生命周期」定案：未命中与成环抛错，解析类型不带 `| undefined`；不提供存在性探测入口与可空备用入口；`provide` 与 `dispose` 不纳入类型约束。随本次大版本落地的连带项（`invoking` 标记复位、错误信息包含服务名与继承链查找路径）记在 `docs/todo-list.md`。

# 对既有调研记录的订正

`ref: reports/202609-inject.md` 的三分法可用，以下四处经本轮取证订正。原文的机制 A、B、C 对应本文 §1、§2、§4 与 §6。

1. 原文中 ITI 的示例 API（`createInjectionToken<T>()`、`iti.register({ token, builder, teardown })`、`iti.use(token)`）在 ITI 0.8.0 的发布产物中不存在。ITI 保留字符串服务名并靠注册点类型累加推导类型，属本文 §5 而非 §4。
2. 机制 A（§1）的限制应定性为前提失效而非代价：发射值只对 class 保真，标准装饰器不发射，Node 无内建反射面，工厂函数无装饰语法位置。
3. 机制 B（§2）的失效描述不准确，且工厂函数在 NovaDI 中是一等公民，仅自动装配路径需要 class。
4. 缺构建期代码生成一类（§3）；对 InversifyJS 的负面定性与 7.x 之后的 `@inversifyjs/strongly-typed` 不符。

另记一处取证过程中的错误假设：曾按 `@matrixai/di` 检索，经 npm、组织仓库、crates.io 三处核对均无此项目。

# 参考

+ TypeScript 标准装饰器与类型元数据：<https://github.com/microsoft/TypeScript/issues/57533>
+ esbuild 对 `emitDecoratorMetadata` 的支持声明：<https://esbuild.github.io/content-types/>
+ Angular CLI 工作区 tsconfig 模板：<https://github.com/angular/angular-cli/blob/main/packages/schematics/angular/workspace/files/tsconfig.json.template>
+ Angular `InjectionToken` 与 `Provider` 类型定义：<https://github.com/angular/angular/blob/main/packages/core/src/di/injection_token.ts>
+ Effect `Layer` 依赖推导：<https://cdn.jsdelivr.net/npm/effect@3.19.0/dist/dts/Layer.d.ts>
+ VS Code 服务标识与标识记忆化：<https://github.com/microsoft/vscode/blob/main/src/vs/platform/instantiation/common/instantiation.ts>
+ typed-inject：<https://github.com/nicojs/typed-inject>
+ ITI 发布产物类型声明：<https://www.npmjs.com/package/iti>
+ awilix：<https://github.com/jeffijoe/awilix>
+ dipstick：<https://github.com/mako-taco/dipstick>
+ NovaDI：<https://github.com/janus007/novadi>
+ InversifyJS strongly-typed container：<https://inversify.github.io/docs/7.x/ecosystem/strongly-typed>
+ Fastify 装饰器的模块扩充写法：<https://fastify.dev/docs/latest/Reference/TypeScript/>
+ .NET `GetService` 与 `GetRequiredService`：<https://github.com/dotnet/runtime/blob/main/src/libraries/Microsoft.Extensions.DependencyInjection.Abstractions/src/ServiceProviderServiceExtensions.cs>
+ .NET `ValidateOnBuild` 启动期校验：<https://github.com/dotnet/runtime/blob/main/src/libraries/Microsoft.Extensions.DependencyInjection/src/ServiceProvider.cs>
+ Midway `@midwayjs/core@4.2.5` 发布产物：`dist/error/framework.js`、`dist/context/managedResolverFactory.js`、`dist/context/requestContainer.d.ts`，<https://www.npmjs.com/package/@midwayjs/core>
