# WBS L4-L5 展开提示词（v2.16 精简版）

> 单个 L3 → L4-L5 子节点树
> 每次只处理 1 个 L3，输出 ≤ 1.5K tokens
> v2.16 优化：删除冗余示例 + 合并表格 + few-shot 替换规则描述（5.9KB → 3.0KB，-49%）

---

## 0. 任务

将以下 L3 工作包展开为 L4-L5：

```
L3 代码: {{L3_CODE}}
L3 名称: {{L3_NAME}}
L3 工时: {{L3_HOURS}}h
SOW 章节: {{SOW_SECTION}}
L3 交付物: {{L3_DELIVERABLE}}
责任角色: {{L3_OWNER}}
```

参考 SOW 原文：
```
{{SOW_CONTEXT}}
```

---

## 1. 输出（只输出单个 JSON 对象，无 markdown 围栏）

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
      "children": []
    }
  ]
}
```

---

## 2. 规则（精简）

### 2.1 L4 数量

| L3 工时 | L4 数 | 每 L4 的 L5 数 |
|---|---|---|
| 8-24h | 2-3 | 多数可不拆 |
| 24-64h | 3-4 | 2-3 |
| 64-120h | 4-6 | 2-4 |
| 120-200h | 5-8 | 3-5 |

### 2.2 守恒 + 命名

- **L4 工时总和 = L3**；每个 L4 的 L5 工时总和 = 父 L4（允许 ±2h 误差）
- 叶子必须是 L4 或 L5
- L4 作为叶子：8-40h；L5 作为叶子：4-40h
- 中文名词短语；L4 模板「对象+修饰」（如「访谈提纲设计」）；L5 模板「动作+成果」（如「客户清单整理」）
- ❌ 禁止动词开头、禁止空泛（"相关工作"）；name ≤ 20 字

### 2.3 字段

每个叶子节点必填：`code`(点分式) / `name` / `level`(4或5) / `estimatedHours`(正整数) / `owner`(PM/BA/SA/Dev/QA/TL) / `deliverable`(≤15字) / `sowEvidence`(SOW章节号) / `children`(`[]`)

### 2.4 严禁

- ❌ Markdown 围栏（```）、JSON 外的任何文字
- ❌ 输出 description/raci/parentId/id
- ❌ 超出 L3 工时的子节点
- ❌ 重复 L3 名称作为 L4

---

## 3. 输出预算

**总字符 ≤ 4000 字（≈ 1000 tokens）**：L4 数 2-8、单节点 ≤ 150 字、严禁任何额外解释

---

## 4. 示例（v2.16 精简：只保留 1 个 few-shot）

**输入**：L3 "账户查询服务" / 章节 "3.4" / 40h / Dev

**输出**（4 个 L4，每个含 2 个 L5）：

```json
{
  "code": "2.1.1", "name": "账户查询服务", "level": 3, "estimatedHours": 40,
  "owner": "Dev", "deliverable": "查询服务", "sowEvidence": "3.4",
  "children": [
    {"code": "2.1.1.1", "name": "查询接口开发", "level": 4, "estimatedHours": 16, "owner": "Dev", "deliverable": "查询API", "sowEvidence": "3.4",
     "children": [
       {"code": "2.1.1.1.1", "name": "REST 接口", "level": 5, "estimatedHours": 8, "owner": "Dev", "deliverable": "API代码", "sowEvidence": "3.4", "children": []},
       {"code": "2.1.1.1.2", "name": "接口文档", "level": 5, "estimatedHours": 8, "owner": "Dev", "deliverable": "API文档", "sowEvidence": "3.4", "children": []}
     ]},
    {"code": "2.1.1.2", "name": "查询页面开发", "level": 4, "estimatedHours": 16, "owner": "Dev", "deliverable": "查询页面", "sowEvidence": "3.4", "children": []},
    {"code": "2.1.1.3", "name": "查询测试", "level": 4, "estimatedHours": 8, "owner": "QA", "deliverable": "测试报告", "sowEvidence": "3.4", "children": []}
  ]
}
```

---

**只输出单个 L3 展开结果的 JSON**，不要任何解释。