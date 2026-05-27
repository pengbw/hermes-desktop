# Agency Agents 完整角色清单 & 提示词汇总

> 来源：[agency-agents](https://github.com/msitarzewski/agency-agents) (52k Stars) + [agency-agents-zh](https://github.com/jnMetaCode/agency-agents-zh) 中文社区版
>
> 总计：**215 个 AI 专家角色**，覆盖 17 个部门，支持 16 种 AI 工具

---

## 统计概览

| 部门                              | 数量   | 占比    |
| --------------------------------- | ------ | ------- |
| 专项部 (Specialized)              | 46     | 21.4%   |
| 营销部 (Marketing)                | 36     | 16.7%   |
| 工程部 (Engineering)              | 35     | 16.3%   |
| 游戏开发部 (Game Development)     | 20     | 9.3%    |
| 测试部 (Testing)                  | 9      | 4.2%    |
| 设计部 (Design)                   | 8      | 3.7%    |
| 销售/金融/支持部                  | 各 7-8 | 各 3-4% |
| 付费媒体/项目管理/空间计算/学术部 | 各 6   | 各 2.8% |
| 产品部                            | 5      | 2.3%    |
| 供应链/HR/法务部                  | 各 2-4 | 各 1-2% |

**来源：** 英文版翻译 165 个 + 中国市场原创 50 个

---

## 一、工程部 (Engineering) — 35 个

构建未来，一个 commit 一个脚印。

| Agent ID                                        | 中文名                   | 描述                                                                                |
| ----------------------------------------------- | ------------------------ | ----------------------------------------------------------------------------------- |
| `engineering-frontend-developer`                | 前端开发者               | 精通 React/Vue/Angular 的前端工程专家，擅长 UI 实现、性能优化、组件架构设计         |
| `engineering-backend-architect`                 | 后端架构师               | 精通可扩展系统设计、数据库架构、API 开发和云基础设施的后端专家                      |
| `engineering-ai-engineer`                       | AI 工程师                | 精通机器学习模型开发与部署的 AI 工程专家，擅长从数据处理到模型上线的全链路工程化    |
| `engineering-devops-automator`                  | DevOps 自动化师          | 精通 CI/CD 流水线和云基础设施的 DevOps 专家，擅长自动化一切可自动化的流程           |
| `engineering-security-engineer`                 | 安全工程师               | 专注威胁建模、代码审计和安全架构的安全工程专家，在开发流程中嵌入安全基因            |
| `engineering-rapid-prototyper`                  | 快速原型师               | 擅长在极短时间内构建可运行 MVP 的全栈快枪手，用最小成本验证产品假设                 |
| `engineering-senior-developer`                  | 高级开发者               | 精通 Laravel/Livewire/FluxUI 的高级全栈开发者，擅长高端 CSS 效果、Three.js 集成     |
| `engineering-mobile-app-builder`                | 移动应用开发者           | 精通 iOS/Android 原生开发和跨平台框架的移动端专家                                   |
| `engineering-data-engineer`                     | 数据工程师               | 专注于构建可靠数据管线、湖仓架构和可扩展数据基础设施的数据工程专家                  |
| `engineering-technical-writer`                  | 技术文档工程师           | 专精于开发者文档、API 参考、README 和教程的技术写作专家                             |
| `engineering-autonomous-optimization-architect` | 自主优化架构师           | 智能系统治理专家，持续对 API 进行影子测试以优化性能，同时严格执行财务和安全护栏     |
| `engineering-embedded-firmware-engineer`        | 嵌入式固件工程师         | 裸机和 RTOS 固件开发专家——精通 ESP32/ESP-IDF、ARM Cortex-M、STM32                   |
| `engineering-embedded-linux-driver-engineer`    | 嵌入式 Linux 驱动工程师  | 嵌入式 Linux 内核驱动与 BSP 开发专家——精通 Linux 内核模块、设备树                   |
| `engineering-fpga-digital-design-engineer`      | FPGA/ASIC 数字设计工程师 | FPGA 与 ASIC 数字前端设计专家——精通 Verilog/SystemVerilog、Vivado/Quartus           |
| `engineering-iot-solution-architect`            | IoT 方案架构师           | 物联网端到端方案设计专家——精通设备接入、边缘计算、云平台、OTA                       |
| `engineering-incident-response-commander`       | 故障响应指挥官           | 专精于生产环境故障管理、结构化响应协调、事后复盘、SLO/SLI 跟踪                      |
| `engineering-threat-detection-engineer`         | 威胁检测工程师           | 专精于 SIEM 规则开发、MITRE ATT&CK 覆盖度映射、威胁狩猎                             |
| `engineering-solidity-smart-contract-engineer`  | Solidity 智能合约工程师  | 精通 EVM 智能合约架构、Gas 优化、可升级代理模式、DeFi 协议开发                      |
| `engineering-wechat-mini-program-developer`     | 微信小程序开发者         | 专注微信小程序全栈开发的工程专家，精通 WXML/WXSS、微信原生API、微信支付             |
| `engineering-code-reviewer`                     | 代码审查员               | 专业代码审查专家，提供建设性、可操作的反馈，聚焦正确性、可维护性、安全性和性能      |
| `engineering-database-optimizer`                | 数据库优化师             | 数据库性能专家，专注于 Schema 设计、查询优化、索引策略和性能调优                    |
| `engineering-git-workflow-master`               | Git 工作流大师           | Git 工作流专家，精通分支策略、约定式提交、变基、工作流                              |
| `engineering-software-architect`                | 软件架构师               | 软件架构专家，精通系统设计、领域驱动设计、架构模式和技术决策                        |
| `engineering-sre`                               | SRE 站点可靠性工程师     | 站点可靠性工程专家，精通 SLO、错误预算、可观测性、混沌工程                          |
| `engineering-ai-data-remediation-engineer`      | AI 数据修复工程师        | 自愈数据管道专家——使用气隙隔离的本地 SLM 和语义聚类，自动检测和修复大规模数据异常   |
| `engineering-feishu-integration-developer`      | 飞书集成开发工程师       | 专注飞书开放平台全栈集成开发，精通飞书机器人、审批流、多维表格、工作流自动化        |
| `engineering-dingtalk-integration-developer`    | 钉钉集成开发工程师       | 专注钉钉开放平台全栈集成开发，精通钉钉机器人、酷应用、审批流自动化                  |
| `engineering-cms-developer`                     | CMS 开发者               | Drupal 与 WordPress 专家，精通主题开发、自定义插件/模块、内容架构                   |
| `engineering-email-intelligence-engineer`       | 邮件智能工程师           | 专精从原始邮件线程中提取结构化数据，服务于智能体和自动化系统                        |
| `engineering-filament-optimization-specialist`  | Filament 优化专家        | 专精于重构和优化 Filament PHP 后台管理界面，专注高影响力的结构性改造                |
| `engineering-codebase-onboarding-engineer`      | 代码库入职引导工程师     | 帮助新工程师快速理解陌生代码库，只陈述基于代码的事实                                |
| `engineering-minimal-change-engineer`           | 最小变更工程师           | 专注最小可行差异——只修需要修的，拒绝范围蔓延，宁要三行相似代码不要过早抽象          |
| `engineering-voice-ai-integration-engineer`     | 语音 AI 集成工程师       | 构建端到端语音转录流水线的专家，精通 Whisper 模型和云端 ASR 服务                    |
| `engineering-pc-host-engineer`                  | 上位机工程师             | Qt/QML 桌面上位机开发专家，精通 QSerialPort、Modbus/CAN 工业协议、QChart 实时可视化 |
| `engineering-mechanical-design-engineer`        | 机械设计工程师           | 通用机械产品设计专家，精通传动/机构/结构件设计、DFMA 与标准件选型                   |

---

## 二、设计部 (Design) — 8 个

让产品好看、好用、有惊喜。

| Agent ID                              | 中文名           | 描述                                                   |
| ------------------------------------- | ---------------- | ------------------------------------------------------ |
| `design-ui-designer`                  | UI 设计师        | 精通视觉设计系统、组件库和像素级界面创建的 UI 设计专家 |
| `design-ux-researcher`                | UX 研究员        | 专精用户行为分析、可用性测试和数据驱动设计洞察         |
| `design-ux-architect`                 | UX 架构师        | 技术架构与 UX 专家，给开发者提供扎实的基础设施         |
| `design-brand-guardian`               | 品牌守护者       | 专精品牌形象开发、一致性维护和战略品牌定位             |
| `design-image-prompt-engineer`        | 图像提示词工程师 | 精通摄影美学和 AI 图像生成的提示词专家                 |
| `design-visual-storyteller`           | 视觉叙事师       | 视觉传达专家，擅长把复杂信息转化成有吸引力的视觉故事   |
| `design-whimsy-injector`              | 趣味注入师       | 创意专家，专门给品牌体验注入个性、惊喜和趣味元素       |
| `design-inclusive-visuals-specialist` | 包容性视觉专家   | 专注于消除 AI 生成图像中的系统性偏见                   |

---

## 三、营销部 (Marketing) — 36 个

### 国内平台（22 个）

| Agent ID                                         | 中文名               | 描述                                                         |
| ------------------------------------------------ | -------------------- | ------------------------------------------------------------ |
| `marketing-xiaohongshu-operator`                 | 小红书运营专家       | 专注小红书平台的内容运营专家，擅长种草笔记创作、达人合作策略 |
| `marketing-douyin-strategist`                    | 抖音策略师           | 专注抖音平台的短视频营销专家，精通算法推荐机制、直播带货     |
| `marketing-wechat-operator`                      | 微信公众号运营       | 专注微信生态的内容运营专家，精通公众号内容策略、社群运营     |
| `marketing-bilibili-strategist`                  | B站内容策略师        | 精通 UP主运营、弹幕文化、社区生态、品牌合作                  |
| `marketing-kuaishou-strategist`                  | 快手策略师           | 专注快手平台的短视频与直播电商，精通下沉市场                 |
| `marketing-china-ecommerce-operator`             | 中国电商运营专家     | 覆盖淘宝、天猫、拼多多、京东生态的全平台电商运营             |
| `marketing-baidu-seo-specialist`                 | 百度 SEO 专家        | 专注百度搜索生态的 SEO 优化，精通百度算法规则                |
| `marketing-private-domain-operator`              | 私域流量运营师       | 专注企业微信私域体系搭建，精通企微 SCRM、社群精细化运营      |
| `marketing-livestream-commerce-coach`            | 直播电商主播教练     | 专注直播电商全链路的主播培训与直播间运营                     |
| `marketing-cross-border-ecommerce`               | 跨境电商运营专家     | 精通 Amazon/Shopee/Lazada 等海外平台运营                     |
| `marketing-short-video-editing-coach`            | 短视频剪辑指导师     | 精通剪映/PR/达芬奇/Final Cut Pro                             |
| `marketing-weibo-strategist`                     | 微博运营策略师       | 精通热搜机制、超话运营、舆情管理                             |
| `marketing-podcast-strategist`                   | 播客内容策略师       | 精通小宇宙、喜马拉雅等主流平台生态                           |
| `marketing-weixin-channels-strategist`           | 微信视频号运营策略师 | 专注微信视频号生态的内容策略与增长运营                       |
| `marketing-knowledge-commerce-strategist`        | 知识付费产品策划师   | 专注中国知识付费生态的产品设计与商业化                       |
| `marketing-china-market-localization-strategist` | 中国市场本地化策略师 | 全栈中国市场本地化专家，覆盖抖音、小红书、微信、B站等全平台  |
| `marketing-daily-news-briefing`                  | 新闻情报官           | 国内外多源新闻实时采集与结构化简报生成                       |
| `marketing-xiaohongshu-specialist`               | 小红书专家           | 精通生活方式内容创作、趋势驱动策略和真实社区互动             |
| `marketing-wechat-official-account`              | 微信公众号管理       | 精通内容营销、用户互动和转化优化                             |
| `marketing-zhihu-strategist`                     | 知乎策略师           | 擅长思想领袖建设、社区公信力打造和知识驱动型互动             |

### 出海营销（6 个）

| Agent ID                                  | 中文名           | 描述                                            |
| ----------------------------------------- | ---------------- | ----------------------------------------------- |
| `marketing-tiktok-strategist`             | TikTok 策略师    | 擅长病毒式内容创作、算法优化和社区运营          |
| `marketing-twitter-engager`               | Twitter 互动官   | 擅长实时互动、思想领袖建设和社区驱动增长        |
| `marketing-instagram-curator`             | Instagram 策展师 | 擅长视觉叙事、社区运营和多格式内容优化          |
| `marketing-reddit-community-builder`      | Reddit 社区运营  | 深谙 Reddit 社区文化                            |
| `marketing-app-store-optimizer`           | 应用商店优化师   | 专注 ASO、转化率提升和应用曝光度                |
| `marketing-video-optimization-specialist` | 视频优化专家     | 精通 YouTube 算法优化、观众留存、跨平台视频分发 |

### 通用营销（10 个）

| Agent ID                             | 中文名                | 描述                                                           |
| ------------------------------------ | --------------------- | -------------------------------------------------------------- |
| `marketing-growth-hacker`            | 增长黑客              | 数据驱动的用户增长专家，擅长设计和执行低成本高回报的获客实验   |
| `marketing-content-creator`          | 内容创作者            | 擅长多平台内容策划与创作，能在不同渠道用不同语言讲同一个好故事 |
| `marketing-social-media-strategist`  | 社交媒体策略师        | 跨平台社交媒体策略专家，专注 LinkedIn、Twitter                 |
| `marketing-seo-specialist`           | SEO专家               | 搜索引擎优化策略师，精通技术 SEO、内容优化、外链建设           |
| `marketing-carousel-growth-engine`   | 轮播图增长引擎        | 自动化短视频轮播图生成，通过 Gemini 生成病毒式轮播图           |
| `marketing-linkedin-content-creator` | LinkedIn 内容创作专家 | 专注于 LinkedIn 个人品牌打造和专业内容创作                     |
| `marketing-book-co-author`           | 图书联合作者          | 为创始人、专家和实操者提供战略性思想领袖力图书协作             |
| `marketing-agentic-search-optimizer` | 智能搜索优化师        | 审计 AI 代理能否在你的网站上完成预订、购买等任务               |
| `marketing-ai-citation-strategist`   | AI 引文策略师         | 审计品牌在 ChatGPT、Claude、Gemini 等平台的可见性              |

---

## 四、付费媒体部 (Paid Media) — 7 个

精准投放，每一分预算都花在刀刃上。

| Agent ID                            | 中文名             | 描述                                                             |
| ----------------------------------- | ------------------ | ---------------------------------------------------------------- |
| `paid-media-auditor`                | 付费媒体审计师     | 系统化评估 Google Ads、Microsoft Ads 和 Meta 广告账户            |
| `paid-media-creative-strategist`    | 广告创意策略师     | 专注广告文案、RSA 优化、素材组设计和创意测试                     |
| `paid-media-paid-social-strategist` | 社交广告策略师     | 跨平台社交广告，覆盖 Meta、LinkedIn、TikTok、Pinterest、X        |
| `paid-media-ppc-strategist`         | PPC 竞价策略师     | 资深付费搜索，擅长 Google Ads、Microsoft Advertising、Amazon Ads |
| `paid-media-programmatic-buyer`     | 程序化广告采买专家 | 展示广告与程序化媒介采买，覆盖 Google Display Network、DV360     |
| `paid-media-search-query-analyst`   | 搜索词分析师       | 搜索词分析、否定关键词架构和查询意图映射                         |
| `paid-media-tracking-specialist`    | 追踪与归因专家     | 转化追踪架构、代码管理和归因模型，精通 GTM、GA4                  |

---

## 五、销售部 (Sales) — 8 个

从线索到成交，让每一单都有章法。

| Agent ID                    | 中文名          | 描述                                                          |
| --------------------------- | --------------- | ------------------------------------------------------------- |
| `sales-account-strategist`  | 客户拓展策略师  | 售后客户拓展专家，擅长 Land-and-Expand、干系人关系图谱、QBR   |
| `sales-coach`               | 销售教练        | 专注销售团队能力提升，擅长 Pipeline Review、通话辅导          |
| `sales-deal-strategist`     | 赢单策略师      | 专精 MEDDPICC 资质审查、竞争定位和复杂 B2B 销售周期的赢单规划 |
| `sales-discovery-coach`     | Discovery 教练  | 辅导团队掌握高阶 Discovery 技巧——问题设计、现状诊断、差距量化 |
| `sales-engineer`            | 售前工程师      | 专精技术 Discovery、Demo 设计、POC 执行、竞争技术定位         |
| `sales-outbound-strategist` | Outbound 策略师 | 基于信号的 Outbound 专家，设计多渠道触达序列                  |
| `sales-pipeline-analyst`    | Pipeline 分析师 | 专精 Pipeline 健康诊断、单子速度分析、Forecast 准确度         |
| `sales-proposal-strategist` | 投标策略师      | 资深投标与方案策略师，将 RFP 转化为有说服力的赢标叙事         |

---

## 六、金融部 (Finance) — 8 个

让每一笔钱都清清楚楚。

| Agent ID                        | 中文名         | 描述                                                 |
| ------------------------------- | -------------- | ---------------------------------------------------- |
| `finance-bookkeeper-controller` | 簿记与财务总监 | 全面的簿记与财务控制，从日常记账到月末结账、财务报告 |
| `finance-financial-analyst`     | 财务分析师     | 数据驱动的财务分析，精通财务建模、估值、报表分析     |
| `finance-financial-forecaster`  | 财务预测分析师 | 专注企业财务预测与场景建模，精通收入预测、现金流管理 |
| `finance-fpa-analyst`           | FP&A 分析师    | 财务规划与分析专家，精通预算编制、滚动预测、差异分析 |
| `finance-fraud-detector`        | 金融风控分析师 | 专注交易欺诈检测，精通支付宝/微信支付/银联渠道风控   |
| `finance-investment-researcher` | 投资研究员     | 精通行业分析、公司估值、投资论文撰写                 |
| `finance-invoice-manager`       | 发票管理专家   | 精通中国企业发票全生命周期管理、金税系统操作         |
| `finance-tax-strategist`        | 税务策略师     | 全面的税务规划与合规，精通跨境税务结构               |

---

## 七、人力资源部 (HR) — 2 个

| Agent ID                  | 中文名       | 描述                                             |
| ------------------------- | ------------ | ------------------------------------------------ |
| `hr-recruiter`            | 招聘专家     | 全流程招聘专家，精通 Boss 直聘、猎聘、拉勾等渠道 |
| `hr-performance-reviewer` | 绩效管理专家 | 精通 OKR/KPI 双轨制、360 度反馈                  |

---

## 八、法务部 (Legal) — 2 个

| Agent ID                  | 中文名           | 描述                                                 |
| ------------------------- | ---------------- | ---------------------------------------------------- |
| `legal-contract-reviewer` | 合同审查专家     | 精通中国《民法典》合同编，擅长合同风险识别、条款审查 |
| `legal-policy-writer`     | 制度文件撰写专家 | 深谙《个人信息保护法》等三法合规要求                 |

---

## 九、供应链部 (Supply Chain) — 4 个

| Agent ID                            | 中文名           | 描述                                               |
| ----------------------------------- | ---------------- | -------------------------------------------------- |
| `supply-chain-inventory-forecaster` | 库存预测专家     | 专注需求预测与库存管理，精准需求预测、安全库存计算 |
| `supply-chain-vendor-evaluator`     | 供应商评估专家   | 擅长供应商筛选与评分、验厂审核                     |
| `supply-chain-route-optimizer`      | 物流路线优化师   | 精通中国快递物流体系                               |
| `supply-chain-strategist`           | 供应链采购策略师 | 精通供应商开发与管理、战略采购、质量管控           |

---

## 十、产品部 (Product) — 5 个

在正确的时间做正确的事。

| Agent ID                          | 中文名        | 描述                                       |
| --------------------------------- | ------------- | ------------------------------------------ |
| `product-sprint-prioritizer`      | Sprint 排序师 | 精通需求优先级排序，用框架和数据替代拍脑袋 |
| `product-trend-researcher`        | 趋势研究员    | 专注行业趋势分析和技术前瞻                 |
| `product-feedback-synthesizer`    | 反馈分析师    | 专注用户反馈收集、分类和洞察提炼           |
| `product-behavioral-nudge-engine` | 行为助推引擎  | 行为心理学专家，最大化用户动力和成功率     |
| `product-manager`                 | 产品经理      | 全局型产品负责人，掌控产品全生命周期       |

---

## 十一、项目管理部 (Project Management) — 6 个

让项目按时按质交付。

| Agent ID                                   | 中文名         | 描述                                                     |
| ------------------------------------------ | -------------- | -------------------------------------------------------- |
| `project-manager-senior`                   | 高级项目经理   | 把规格说明书拆成可执行任务的资深 PM                      |
| `project-management-project-shepherd`      | 项目牧羊人     | 专注跨部门项目协调、时间线管理和利益方对齐               |
| `project-management-experiment-tracker`    | 实验追踪员     | 专注实验设计、执行追踪和数据驱动决策                     |
| `project-management-studio-producer`       | 工作室制片人   | 高级战略领导者，擅长多项目组合管理                       |
| `project-management-studio-operations`     | 工作室运营     | 专注日常效率、流程优化和资源协调                         |
| `project-management-jira-workflow-steward` | Jira工作流管家 | 执行 Jira 关联的 Git 工作流，确保提交可追溯、PR 结构规范 |

---

## 十二、测试部 (Testing) — 9 个

打破一切，让用户不必承受。

| Agent ID                          | 中文名           | 描述                                           |
| --------------------------------- | ---------------- | ---------------------------------------------- |
| `testing-evidence-collector`      | 证据收集者       | 确保每一个测试结论都有充分的证据支撑           |
| `testing-reality-checker`         | 现实检验者       | 阻止幻想式审批，基于证据的认证                 |
| `testing-api-tester`              | API 测试员       | 专注全面 API 验证、性能测试和质量保证          |
| `testing-performance-benchmarker` | 性能基准师       | 用数据找到性能瓶颈                             |
| `testing-accessibility-auditor`   | 无障碍审核员     | 按 WCAG 标准审查界面、用辅助技术实测           |
| `testing-test-results-analyzer`   | 测试结果分析师   | 专注测试结果评估和质量度量分析                 |
| `testing-tool-evaluator`          | 工具评估师       | 通过全面的功能对比、性能测试和成本分析         |
| `testing-workflow-optimizer`      | 工作流优化师     | 通过消除瓶颈、精简流程和引入自动化             |
| `testing-embedded-qa-engineer`    | 嵌入式测试工程师 | 精通硬件在环测试、固件自动化测试、EMC/ESD 测试 |

---

## 十三、支持部 (Support) — 7 个

运营的中流砥柱。

| Agent ID                              | 中文名         | 描述                                         |
| ------------------------------------- | -------------- | -------------------------------------------- |
| `support-support-responder`           | 客服响应者     | 专业的客户支持专家，提供卓越的客户服务       |
| `support-analytics-reporter`          | 数据分析师     | 擅长将原始数据转化为可操作的业务洞察         |
| `support-legal-compliance-checker`    | 法务合规员     | 确保业务运营符合相关法律法规                 |
| `support-executive-summary-generator` | 高管摘要师     | 把复杂的业务信息压缩成简洁、可执行的高管摘要 |
| `support-finance-tracker`             | 财务追踪员     | 擅长财务规划、预算管理和经营绩效分析         |
| `support-infrastructure-maintainer`   | 基础设施运维师 | 专注系统可靠性、性能优化和技术运营管理       |
| `support-recruitment-specialist`      | 招聘运营专家   | 精通中国主流招聘渠道运营、人才评估体系       |

---

## 十四、专项部 (Specialized) — 46 个

不走寻常路的专家。

### 核心智能体

| Agent ID                      | 中文名         | 描述                                                |
| ----------------------------- | -------------- | --------------------------------------------------- |
| `agents-orchestrator`         | 智能体编排者   | 自主流水线管理者，负责编排整个开发工作流            |
| `prompt-engineer`             | 提示词工程师   | 专注大语言模型提示词设计与优化                      |
| `agentic-identity-trust`      | 身份信任架构师 | 为自主运行的 AI 智能体设计身份认证和信任验证体系    |
| `data-consolidation-agent`    | 数据整合师     | 把提取出的销售数据整合到实时报告仪表盘              |
| `lsp-index-engineer`          | LSP 索引工程师 | 通过 LSP 客户端编排和语义索引构建统一的代码智能系统 |
| `report-distribution-agent`   | 报告分发师     | 自动把整合好的销售报告按区域分发给对应的销售代表    |
| `sales-data-extraction-agent` | 销售数据提取师 | 监控 Excel 文件并提取关键销售指标                   |
| `compliance-auditor`          | 合规审计师     | 擅长 SOC 2、ISO 27001、HIPAA 和 PCI-DSS 审计        |

### 中国市场原创

| Agent ID                                 | 中文名             | 描述                                                  |
| ---------------------------------------- | ------------------ | ----------------------------------------------------- |
| `livestock-archive-auditor`              | 养殖档案核对员     | 畜禽养殖档案 Excel 与生产日报核对，按子表独立审计     |
| `study-abroad-advisor`                   | 留学规划顾问       | 覆盖美英加澳欧港新的全阶段留学规划                    |
| `government-digital-presales-consultant` | 政务数字化售前顾问 | 面向中国政务市场的数字化项目售前                      |
| `corporate-training-designer`            | 企业培训课程设计师 | 专注企业培训体系搭建与课程开发                        |
| `specialized-mcp-builder`                | MCP 构建器         | Model Context Protocol 开发专家                       |
| `specialized-document-generator`         | 文档生成器         | 通过代码化方式生成专业的 PDF、PPTX、DOCX 和 XLSX 文件 |
| `specialized-workflow-architect`         | 工作流架构师       | 为每个系统、用户旅程和智能体交互绘制完整的工作流树    |
| `automation-governance-architect`        | 自动化治理架构师   | 以治理为先的业务自动化架构师（n8n 优先）              |
| `specialized-salesforce-architect`       | Salesforce 架构师  | Salesforce 平台的解决方案架构                         |
| `healthcare-marketing-compliance`        | 医疗健康营销合规师 | 深耕中国医疗健康行业营销合规                          |
| `gaokao-college-advisor`                 | 高考志愿填报顾问   | 中国高考志愿填报策略专家                              |
| `specialized-pricing-optimizer`          | 动态定价策略师     | 专注电商动态定价与促销策略                            |
| `specialized-ai-policy-writer`           | AI 治理政策专家    | 面向中国企业和机构的 AI 治理与合规                    |
| `specialized-risk-assessor`              | 企业风险评估师     | 面向中国企业的全面风险管理                            |
| `specialized-meeting-assistant`          | 会议效率专家       | 面向中国企业的会议管理与效率提升                      |
| `recruitment-specialist`                 | 招聘专家           | 精通国内主流招聘平台、人才评估体系                    |

### 技术类专项

| Agent ID                                | 中文名             | 描述                                             |
| --------------------------------------- | ------------------ | ------------------------------------------------ |
| `zk-steward`                            | ZK 管家            | 秉承 Niklas Luhmann 卡片盒笔记法精神的知识库管家 |
| `blockchain-security-auditor`           | 区块链安全审计师   | 专注智能合约漏洞检测、形式化验证                 |
| `specialized-civil-engineer`            | 土木工程师         | 精通 Eurocode、DIN、ACI、AISC 等多国标准         |
| `specialized-french-consulting-market`  | 法国咨询市场专家   | 法国 ESN/SI 自由职业生态导航                     |
| `specialized-korean-business-navigator` | 韩国商务专家       | 精通 KakaoTalk 商务礼仪                          |
| `technical-translator-agent`            | 技术翻译专家       | 专注于技术领域的中英文双向翻译                   |
| `healthcare-customer-service`           | 医疗客服专家       | 处理预约、保险、处方和紧急分诊                   |
| `hospitality-guest-services`            | 酒店宾客服务专家   | 处理预订、客房服务、礼宾和投诉                   |
| `hr-onboarding`                         | HR 入职管理专家    | 从入职文档到合规追踪、文化融入                   |
| `language-translator`                   | 语言翻译专家       | 实时语言翻译，具备文化语境理解和方言意识         |
| `legal-billing-time-tracking`           | 律所计费与工时专家 | 从工时录入到账单生成和客户沟通                   |
| `legal-client-intake`                   | 律所客户接案专家   | 从初步咨询到利益冲突检查和委托协议签署           |
| `legal-document-review`                 | 法律文书审查专家   | 合同摘要、风险条款标记、版本对比                 |
| `loan-officer-assistant`                | 信贷经理助手       | 从申请预审到合规检查、利率锁定和贷后管理         |
| `real-estate-buyer-seller`              | 房地产经纪助手     | 从市场分析到报价策略、谈判和成交                 |
| `retail-customer-returns`               | 零售退货专家       | 退货受理、退款处理、欺诈检测和客户挽留           |
| `specialized-chief-of-staff`            | 幕僚长             | 战略运营与跨部门协调，会议管理、OKR 追踪         |

---

## 十五、空间计算部 (Spatial Computing) — 6 个

构建下一代空间交互体验。

| Agent ID                            | 中文名                 | 描述                                             |
| ----------------------------------- | ---------------------- | ------------------------------------------------ |
| `visionos-spatial-engineer`         | visionOS 空间工程师    | 原生 visionOS 空间计算、SwiftUI 体积式界面       |
| `macos-spatial-metal-engineer`      | macOS Metal 空间工程师 | 原生 Swift 和 Metal 专家，构建高性能 3D 渲染系统 |
| `xr-interface-architect`            | XR 界面架构师          | 空间交互设计师，专注 AR/VR/XR 环境               |
| `xr-immersive-developer`            | XR 沉浸式开发者        | WebXR 和沉浸式技术专家                           |
| `xr-cockpit-interaction-specialist` | XR 座舱交互专家        | 专注设计和开发 XR 环境中沉浸式座舱控制系统       |
| `terminal-integration-specialist`   | 终端集成专家           | 终端模拟、文本渲染优化和 SwiftTerm 集成          |

---

## 十六、游戏开发部 (Game Development) — 20 个

从独立游戏到 3A 大作，全引擎覆盖。

| Agent ID              | 中文名         | 描述                                                  |
| --------------------- | -------------- | ----------------------------------------------------- |
| `game-designer`       | 游戏设计师     | 系统与机制架构师，精通 GDD 编写、玩家心理学、经济平衡 |
| `level-designer`      | 关卡设计师     | 空间叙事与节奏流程专家，精通布局理论、遭遇战设计      |
| `narrative-designer`  | 叙事设计师     | 故事系统与对话架构师，精通分支对话、世界观架构        |
| `technical-artist`    | 技术美术       | 美术到引擎管线专家，精通 shader、VFX 系统、LOD        |
| `game-audio-engineer` | 游戏音频工程师 | 交互音频专家，精通 FMOD/Wwise 集成、自适应音乐        |

### Unity

| Agent ID                      | 中文名                    | 描述                                                |
| ----------------------------- | ------------------------- | --------------------------------------------------- |
| `unity-architect`             | Unity 架构师              | 数据驱动模块化专家，精通 ScriptableObject、解耦系统 |
| `unity-editor-tool-developer` | Unity 编辑器工具开发者    | Unity 编辑器自动化专家，精通自定义 EditorWindow     |
| `unity-multiplayer-engineer`  | Unity 多人游戏工程师      | 联网游戏专家，精通 Netcode for GameObjects          |
| `unity-shader-graph-artist`   | Unity Shader Graph 美术师 | 视觉效果与材质专家，精通 HLSL、URP/HDRP             |

### Unreal Engine

| Agent ID                       | 中文名                | 描述                                                |
| ------------------------------ | --------------------- | --------------------------------------------------- |
| `unreal-multiplayer-architect` | Unreal 多人游戏架构师 | Unreal Engine 网络专家，精通 Actor 复制             |
| `unreal-systems-engineer`      | Unreal 系统工程师     | 性能与混合架构专家，精通 C++/Blueprint 边界         |
| `unreal-technical-artist`      | Unreal 技术美术       | Unreal Engine 视觉管线专家，精通材质编辑器、Niagara |
| `unreal-world-builder`         | Unreal 世界构建师     | 开放世界与环境专家，精通 UE5 World Partition        |

### 其他引擎

| Agent ID                     | 中文名                | 描述                                   |
| ---------------------------- | --------------------- | -------------------------------------- |
| `blender-addon-engineer`     | Blender 插件工程师    | 构建 Python 插件、资源验证器、导出工具 |
| `godot-gameplay-scripter`    | Godot 游戏脚本开发者  | 精通 GDScript 2.0、C# 集成、节点式架构 |
| `godot-multiplayer-engineer` | Godot 多人游戏工程师  | Godot 4 网络专家，精通 MultiplayerAPI  |
| `godot-shader-developer`     | Godot Shader 开发者   | Godot 4 视觉效果专家                   |
| `roblox-systems-scripter`    | Roblox 系统脚本工程师 | 精通 Luau、客户端-服务端安全模型       |
| `roblox-experience-designer` | Roblox 体验设计师     | 精通参与循环设计、Roblox 变现系统      |
| `roblox-avatar-creator`      | Roblox 虚拟形象创作者 | 精通 Roblox 虚拟形象系统、UGC 物品制作 |

---

## 十七、学术部 (Academic) — 6 个

为叙事设计、世界构建和文化研究提供学术级支撑。

| Agent ID                  | 中文名     | 描述                                           |
| ------------------------- | ---------- | ---------------------------------------------- |
| `academic-anthropologist` | 人类学家   | 文化体系、仪式、亲属关系、信仰系统和民族志方法 |
| `academic-geographer`     | 地理学家   | 自然地理与人文地理、气候系统、制图学           |
| `academic-historian`      | 历史学家   | 历史分析、分期、物质文化和史学方法             |
| `academic-narratologist`  | 叙事学家   | 叙事理论、故事结构、人物弧线                   |
| `academic-psychologist`   | 心理学家   | 人类行为、人格理论、动机和认知模式             |
| `academic-study-planner`  | 学习规划师 | 精通考研、考公、司法考试等备考策略             |

---

## 使用方式

每个 Agent 对应一个 `.mdc` 文件（Markdown + YAML frontmatter），包含：

- **role**: 角色定义（系统提示词）
- **processes**: 工作流程
- **deliverables**: 可交付成果
- **tools**: 使用的工具

**支持的 AI 工具（16 种）：**
Claude Code / Cursor / Copilot / OpenClaw / RooCode / Aider / Gemini Code / LlamaCode / Windsurf / Cline / Raggy / Continue / Devin / Tabnine / CodeBuddy / Sourcegraph

---

> 文档生成时间：2026-05-26
> 基于 [jnMetaCode/agency-agents-zh](https://github.com/jnMetaCode/agency-agents-zh)
