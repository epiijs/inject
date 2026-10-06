---
title: 任务台账
description: @epiijs/inject 工作台账，记终态与交付物清单
last_updated: 2026-10-07
---

# TODO List

@epiijs/inject 工作台账，记终态与交付物清单（做没做、被什么卡、细节在哪）。

上游指令与具体任务直接投入以下列表；无法自行解决的问题记入「需要外部协同的工作」节，由上游主动读取收集，不写入上游日志。

## 需要外部协同的工作

> 人工 Review 提出的问题高优插入本节顶部（标注「高优」）。本节是永久结构槽位，无待处理条目时不得删除。

- [ ] 修订 `ref: projects/inject.md`：`Symbol.dispose` 已具备却仍记 TODO，「API 类型化」仍是 WIP 且未吸收本仓定案的 `IServiceLocator` 声明合并路线。请统一口径并补交叉引用（等待方：reference 修订）（来源：本仓 2026-09-30 对照 reference）
- [ ] server 侧跟进 1.0.0：实测 `../server/package.json` 依赖 `@epiijs/inject` `^0.9.1`，本仓发布后要升依赖范围；server 需处理查询未命中改为抛错的连带影响，并把它自己公开类型面里的 `ServiceLocator`（`ref: harness/todo-list.md:28` 记为已补齐的 server 公开类型）改用 `IServiceLocator`。上游台账原先记的 `^0.8.0` 偏差已查无出处，不再作为待办内容（等待方：server 侧改造 + reference 巡检）（来源：本仓 2026-10-07 对照 ../server 与上游台账）
- [ ] 回改 `ref: reports/202609-inject.md`：其中四处失实（ITI 示例 API 在 0.8.0 发布产物中不存在等）已由本仓 `docs/report-typed-di.md`「对既有调研记录的订正」记录，请上游按该节修订（等待方：reference 修订）（来源：本仓 2026-10-06 类型化调研）

## 待办

> **统计**：已完成 10 / 总计 12（计全文档全部 checkbox，不含外部协同节，已完成节计入终态条目）

已知缺陷的现状固化在 `test/index.test.js`（用例名带 `current behavior`），修复须经人工 Review，修复后同步改写断言。目标语义见 `docs/design-v1.md`「服务生命周期」与「容器作用域」。

- [ ] 假值实例无法直接注册：`provide(name, service)` 对 `service` 用真值判断，`provide('x', 0)` / `''` / `false` 静默不登记，与 `docs/design-v1.md`「传入非函数值视为实例本身」矛盾。现状按 2026-10-06 人工 Review 保持，待定的是口径：改文档承认这一限制，还是放开注册（等待方：人工 Review）
- [ ] 发布 1.0.0：`package.json` 版本号已定为 `1.0.0`，属破坏性变更（查询未命中与依赖成环改为抛错、`service()` 与 `dispose()` 按参数缺省判断、`service(name)` 返回类型按声明推导、旧名 `ServiceLocator` 转 deprecated 别名）。`engines` 收紧 Node ≥24 对使用方同样是约束。npm 发布归人工（等待方：人工 Review）

## 已完成

> 简要记录，只留终态与交付物清单，不叙述过程。

### 0.9.1（2026/06/20）

- [x] 测试框架迁移 vitest，coverage 用 `@vitest/coverage-v8`，eslint-config 升级
- [x] `Symbol.dispose` 支持，`provide` / `service` / `dispose` / `inherit` 公开面稳定
- [x] ESM 化，发布产物改用 `files: ["build"]` 取代 `.npmignore`

### 工具链与文档基线（2026-09-30 至 2026-10-06）

- [x] 工具链对齐族基线：Node ≥24、`typescript` 与 `@epiijs/eslint-config` 入位、`build` 与 `lint` 解耦、vitest 带 coverage 且只统计 `build/`、tsconfig 终态化、`.gitignore` 精简
- [x] harness 文件齐备：`AGENTS.md`、`CLAUDE.md` 指针、`docs/development.md`、本台账
- [x] 文档分工就位：`docs/design-v1.md` 记现行机制，`docs/report-typed-di.md` 记类型化的业界取证与取舍，README 只描述现行对外 API，与实现的差异一律记本台账

### 1.0.0（2026-10-07）

- [x] 查询与销毁语义收敛：未命中与依赖成环改为抛错，求值失败的服务可重试，`service()` 与 `dispose()` 按参数缺省判断，`dispose` 对未注册名无操作
- [x] 类型化落地：`IServiceLocator` 作声明合并落点，`service(name)` 返回按声明推导的类型，旧名转 `@deprecated` 别名；销毁句柄以实例为接收者调用，本仓 lint 归零
- [x] 测试与文档同步：用例 24 项通过、`build/` 全覆盖，README 补声明合并用法与抛错口径
- [x] 假值实例不缓存定为不修：不存在需要缓存假值的工厂产物，口径记 `docs/design-v1.md`，用例继续固化现状
