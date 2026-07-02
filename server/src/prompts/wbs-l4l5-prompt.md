# WBS L4-L5 展开提示词（阶段 2 / L3 → L4-L5 Drill-Down）

> 针对单个 L3 工作包，展开为 L4 子任务 + L5 叶子节点
> 每次只处理 1 个 L3，输出体积小（≈ 1-3K tokens），彻底避免截断
> 接收上下文：SOW 全文 + L3 节点信息 + SOW 章节锚点

---

## 0. 任务

将以下 L3 工作包**展开为 L4-L5 子节点树**：

```
L3 代码: {{L3_CODE}}
L3 名称: {{L3_NAME}}
L3 工时: {{L3_HOURS}}h
SOW 章节: {{SOW_SECTION}}
L3 交付物: {{L3_DELIVERABLE}}
责任角色: {{L3_OWNER}}
```

参考的 SOW 原文片段（仅相关章节）：
```
{{SOW_CONTEXT}}
```

---

## 1. 输出格式（严格 JSON，无 markdown 围栏）

只输出一个 JSON 对象，包含单个 L3 的展开结果：

```json
{
  "code": "{{L3_CODE}}",
  "name": "{{L3_NAME}}",
  "level": 3,
  "estimatedHours": {{L3_HOURS}},
  "owner": "{{L3_OWNER}}",
  "deliverable": "{{L3_DELIVERABLE}}",
  "sowEvidence": "{{SOW_SECTION}}",
  "children": [
    {
      "code": "{{L3_CODE}}.1",
      "name": "子任务1",
      "level": 4,
      "estimatedHours": 16,
      "owner": "BA",
      "deliverable": "子任务1交付物",
      "sowEvidence": "{{SOW_SECTION}}",
      "children": [
        {
          "code": "{{L3_CODE}}.1.1",
          "name": "具体动作1",
          "level": 5,
          "estimatedHours": 8,
          "owner": "BA",
          "deliverable": "动作1成果",
          "sowEvidence": "{{SOW_SECTION}}",
          "children": []
        }
      ]
    },
    ...
  ]
}
```

---

## 2. 展开规则

### 2.1 L4 数量控制

| L3 工时 | 推荐 L4 数 | 推荐 L5 数（每个 L4） |
|---|---|---|
| 8-24h | 2-3 个 L4 | 多数可不拆 L5（保留为叶子） |
| 24-64h | 3-4 个 L4 | 2-3 个 L5（每个 L4） |
| 64-120h | 4-6 个 L4 | 2-4 个 L5（每个 L4） |
| 120-200h | 5-8 个 L4 | 3-5 个 L5（每个 L4） |

### 2.2 工时守恒（必须严格）

- **所有 L4 的 estimatedHours 之和 = L3 的 estimatedHours**
- **每个 L5 的 estimatedHours 之和 = 父 L4 的 estimatedHours**
- 允许 1-2h 误差（不要因为工时守恒而强行拼凑）

### 2.3 叶子节点要求

- **叶子节点必须是 L4 或 L5**
- L4 作为叶子时：工时应在 8-40h 之间
- L5 作为叶子时：工时应在 4-40h 之间

### 2.4 命名规范

- 中文名词短语
- L4 命名模板：「对象 + 修饰/范围」（如「访谈提纲设计」「接口定义文档」）
- L5 命名模板：「具体动作 + 成果」（如「客户清单整理」「关键用户访谈」）
- ❌ 禁止动词开头
- ❌ 禁止空泛（"相关工作"）
- name ≤ 20 字

### 2.5 字段完整性

每个叶子节点必须包含：

| 字段 | 必填 | 说明 |
|---|---|---|
| `code` | ✅ | 点分式 |
| `name` | ✅ | 中文名词短语 |
| `level` | ✅ | 4 或 5 |
| `estimatedHours` | ✅ | 正整数 |
| `owner` | ✅ | BA/SA/Dev/QA/PM/TL |
| `deliverable` | ✅ | 交付物（≤ 15 字） |
| `sowEvidence` | ✅ | SOW 章节号 |
| `children` | ✅ | 叶子 = `[]` |

### 2.6 严禁

- ❌ 输出 markdown 围栏（```）
- ❌ 在 JSON 外输出任何文字
- ❌ 输出 description/raci/parentId/id 字段（本阶段不需要）
- ❌ 输出超出 L3 工时的子节点（必须守恒）
- ❌ 重复 L3 名称作为 L4 名称

---

## 3. 输出预算

**总输出字符 ≤ 4000 字（≈ 1000 tokens）**：

- L4 数量：2-8 个
- L5 数量：每个 L4 拆 2-4 个 L5
- 单节点输出 ≤ 150 字
- 严禁任何额外解释

---

## 4. 真实场景示例

### 示例 1：项目管理模块 - 营销管理（63h）

**输入**：
- L3: "营销管理功能开发"
- SOW 章节: "2.2.1 项目管理模块 - 营销管理"
- SOW 原文: "支持分支机构、客户经理、产品经理、KPI、绩效等营销管理，支持营销视图的展示"

**输出**：
```json
{
  "code": "1.2.1.1",
  "name": "营销管理功能开发",
  "level": 3,
  "estimatedHours": 63,
  "owner": "SA",
  "deliverable": "营销管理模块",
  "sowEvidence": "2.2.1 节",
  "children": [
    {
      "code": "1.2.1.1.1",
      "name": "营销视图配置",
      "level": 4,
      "estimatedHours": 16,
      "owner": "Dev",
      "deliverable": "视图配置代码",
      "sowEvidence": "2.2.1 节",
      "children": [
        { "code": "1.2.1.1.1.1", "name": "维度定义", "level": 5, "estimatedHours": 8, "owner": "Dev", "deliverable": "维度字典", "sowEvidence": "2.2.1 节", "children": [] },
        { "code": "1.2.1.1.1.2", "name": "视图模板", "level": 5, "estimatedHours": 8, "owner": "Dev", "deliverable": "视图模板", "sowEvidence": "2.2.1 节", "children": [] }
      ]
    },
    {
      "code": "1.2.1.1.2",
      "name": "KPI 指标管理",
      "level": 4,
      "estimatedHours": 24,
      ...
    },
    ...
  ]
}
```

### 示例 2：账户查询服务（40h）

**输入**：
- L3: "账户查询服务"
- SOW 章节: "3.4 账户查询"
- 工时: 40h

**输出**（L4 = 4 个，每个含 2 个 L5）：
```json
{
  "code": "2.1.1",
  "name": "账户查询服务",
  "level": 3,
  "estimatedHours": 40,
  ...
  "children": [
    {
      "code": "2.1.1.1",
      "name": "查询接口开发",
      "level": 4,
      "estimatedHours": 16,
      "owner": "Dev",
      "deliverable": "查询API",
      "sowEvidence": "3.4 节",
      "children": [
        { "code": "2.1.1.1.1", "name": "REST 接口", "level": 5, "estimatedHours": 8, ... },
        { "code": "2.1.1.1.2", "name": "接口文档", "level": 5, "estimatedHours": 8, ... }
      ]
    },
    {
      "code": "2.1.1.2",
      "name": "查询页面开发",
      "level": 4,
      "estimatedHours": 16,
      ...
    },
    {
      "code": "2.1.1.3",
      "name": "查询测试",
      "level": 4,
      "estimatedHours": 8,
      ...
    }
  ]
}
```

---

**只输出单个 L3 展开结果的 JSON**，不要任何解释。