# CodeBuddy Models Manager：用可视化界面管理 CodeBuddy 自定义模型

CodeBuddy 支持通过 `models.json` 配置自定义模型，这让我们可以接入 OpenAI Compatible 接口、代理服务、本地模型或其他第三方模型服务。

但手写 JSON 有几个明显的问题：字段多、容易写错、API Key 不适合频繁复制粘贴、`availableModels` 的语义也容易误解。于是我做了一个小工具：**CodeBuddy Models Manager**，用一个本地可视化界面来管理 CodeBuddy 的模型配置。

![CodeBuddy Models Manager 主界面](../screenshot/Xnip2026-04-17_16-58-56.png)

## 它解决什么问题

如果你已经在本地配置了：

```text
~/.codebuddy/models.json
```

工具启动后会直接读取这个文件，并把已有模型展示到列表里。它不会在启动时覆盖你的配置，也不会在刷新页面时改写文件。只有你点击“保存配置”时，才会写回 `models.json`。

写回之前，工具还会自动创建备份，避免误操作导致配置丢失。

## 核心功能

- 查看现有模型列表
- 搜索模型 ID、名称或供应商
- 添加新模型
- 删除模型
- 修改模型字段
- 刷新并重新读取本地配置
- 管理 `availableModels`
- API Key 默认掩码显示
- 未修改 API Key 时自动保留原密钥
- 保存前做基础校验
- 保存前自动备份
- 支持 Docker 一键部署

## 为什么要特别处理 API Key

模型配置里通常会包含真实 API Key。这个工具的设计原则是：**尽量不让密钥出现在界面和日志里**。

列表里只会显示“已配置密钥”，编辑表单里也只展示掩码，例如：

```text
sk-a************1234
```

如果你不填写新的 API Key，保存时会继续保留原文件里的密钥。只有当你主动输入新值时，工具才会替换它。

这让日常修改模型名称、URL、token 数量或能力开关时，不需要反复复制密钥。

## 关于 availableModels

CodeBuddy 的 `availableModels` 有一个容易误解的地方：

```json
{
  "availableModels": []
}
```

这不是“没有可用模型”，而是“显示全部模型”。

所以工具没有让用户直接手写数组，而是提供了更直观的开关：

- 勾选“显示全部模型”：保存为空数组
- 取消“显示全部模型”：只保存选中的模型 ID

![可见模型管理](../screenshot/Xnip2026-04-17_16-59-07.png)

## 本地运行

项目不依赖数据库，直接启动 Node 服务即可：

```bash
npm start
```

然后打开：

```text
http://127.0.0.1:4310/
```

默认读取：

```text
~/.codebuddy/models.json
```

如果你想指定其他配置文件，可以使用环境变量：

```bash
CODEBUDDY_MODELS_PATH=/path/to/models.json npm start
```

也可以用命令参数：

```bash
node server.js --config=/path/to/models.json
```

## Docker 部署

Docker 模式下，容器不能直接访问宿主机的 `~/.codebuddy`，所以需要挂载 volume：

```bash
docker run --rm \
  -p 4310:4310 \
  -v ~/.codebuddy:/data \
  -e CODEBUDDY_MODELS_PATH=/data/models.json \
  codebuddy-models-manager
```

也可以使用 `docker compose`：

```bash
docker compose up --build
```

## 安全边界

默认情况下，服务只监听本机：

```text
127.0.0.1:4310
```

这意味着它更适合作为本地工具使用，而不是直接暴露到公网。

如果只是想查看配置，可以开启只读模式：

```bash
READONLY=true npm start
```

只读模式下，页面可以展示和刷新配置，但不能保存。

## CodeBuddy 配置语义

这个工具遵循 CodeBuddy 官方的模型配置规则：

- 用户级配置路径：`~/.codebuddy/models.json`
- 项目级配置路径：`<workspace>/.codebuddy/models.json`
- 项目级配置优先于用户级配置
- `models` 会按 `id` 合并，同 `id` 覆盖
- `availableModels` 不合并，会整体覆盖
- `availableModels` 为空数组时表示显示全部模型

这些规则如果完全手写 JSON，需要经常回头查文档；做成界面后，常用操作就自然很多。

## 后续计划

目前第一版重点是把最常用的 CRUD 跑通，并保证不会覆盖已有配置。后面可以继续补充：

- 模型连通性测试
- 常见供应商模板
- 多配置文件 Profile
- 项目级 `.codebuddy/models.json` 管理
- 配置导入、导出和 Diff
- 更完整的 JSON Schema 校验

## 小结

CodeBuddy 的 `models.json` 很灵活，但手写维护并不舒服。CodeBuddy Models Manager 的目标不是替代配置文件，而是给它加一个更安全、更直观的管理界面。

它启动时只读取配置，不会覆盖已有内容；保存前自动备份；API Key 默认不明文展示。对于经常切换模型、维护多个 OpenAI Compatible 服务的人来说，这个小工具能省掉不少重复劳动。
