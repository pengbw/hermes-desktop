# Hermes Desktop - 测试套件

本目录包含项目所有功能的自动化测试。

## 目录结构

```
test/
├── setup.ts              # 全局 mock 与测试环境
├── utils/                # 测试工具
│   ├── tauri-mock.ts     # Tauri API mock 工具
│   ├── render-helpers.tsx # 包含 Provider 的 render 辅助
│   └── fixtures.ts       # 共享 mock 数据
├── unit/                 # 单元测试
│   ├── core/             # 核心层 (errors, types, agent)
│   ├── stores/           # Zustand 状态管理
│   ├── hooks/            # 自定义 React Hooks
│   ├── contexts/         # React Contexts
│   ├── services/         # Tauri Services
│   ├── utils/            # 工具函数
│   ├── themes/           # 主题配置
│   └── i18n/             # 多语言文案
├── components/           # 组件测试
│   ├── common/           # 通用组件
│   ├── chat/             # 聊天组件
│   ├── home/             # 首页组件
│   ├── knowledge/        # 知识库组件
│   ├── settings/         # 设置组件
│   ├── studio/           # 工作室组件
│   └── ui/               # shadcn/ui 原子组件
├── pages/                # 页面集成测试
└── integration/          # 跨模块集成测试
```

## 运行

```bash
# 运行所有 test/ 下的测试
npm run test

# 运行指定文件
npx vitest run test/unit/core/errors

# 监视模式
npx vitest watch test
```

## 编写规范

1. **每个测试文件** 顶部用 `describe('模块名', () => { ... })` 包裹
2. **每个测试用例** 命名格式 `it('应该 xxx', () => { ... })`
3. **使用 fixtures** 而不是内联硬编码数据
4. **异步等待** 使用 `waitFor` 或 `findBy*` 查询
5. **Tauri mock** 使用 `test/utils/tauri-mock.ts` 中的辅助函数
6. **Provider 包裹** 使用 `test/utils/render-helpers.tsx` 中的 `render`

## 覆盖率

- **核心层** (core/stores/hooks/contexts) 目标 ≥ 90%
- **业务组件** 目标 ≥ 70%
- **页面** 目标 ≥ 50%
