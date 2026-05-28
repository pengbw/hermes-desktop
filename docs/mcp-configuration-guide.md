# MCP 服务配置说明

MCP（Model Context Protocol）服务允许你将外部工具和数据源接入 Hermes，扩展 AI 的能力范围。本文档介绍如何在设置页面中添加和管理 MCP 服务器。

---

## 添加 MCP 服务器

1. 打开 **设置** → **MCP 服务器管理**
2. 点击 **+ 添加服务器** 按钮
3. 填写服务器配置信息
4. 点击 **保存**

---

## 传输类型

MCP 支持三种传输类型，根据服务器的运行方式选择对应的类型：

### Stdio（标准输入/输出）

通过标准输入/输出与本地进程通信，适用于本地安装的 MCP 服务器。

**配置字段：**

| 字段     | 说明                   | 示例                                                              |
| -------- | ---------------------- | ----------------------------------------------------------------- |
| 名称     | 服务器唯一标识         | `filesystem-server`                                               |
| 传输类型 | 选择 `Stdio`           | —                                                                 |
| 命令     | 启动服务器的可执行命令 | `npx`                                                             |
| 参数     | 以空格分隔的命令行参数 | `-y @modelcontextprotocol/server-filesystem /home/user/documents` |

**典型示例：**

```
名称：filesystem-server
命令：npx
参数：-y @modelcontextprotocol/server-filesystem /home/user/documents
```

```
名称：python-server
命令：python
参数：-m mcp_server
```

```
名称：uvx-server
命令：uvx
参数：mcp-server-sqlite --db-path /path/to/database.db
```

### HTTP（Streamable HTTP）

通过 HTTP 协议与远程服务通信，支持流式响应。适用于支持 StreamableHTTP 协议的远程 MCP 服务器。

**配置字段：**

| 字段     | 说明           | 示例                        |
| -------- | -------------- | --------------------------- |
| 名称     | 服务器唯一标识 | `remote-api`                |
| 传输类型 | 选择 `HTTP`    | —                           |
| URL      | 服务器地址     | `http://localhost:3000/mcp` |

**典型示例：**

```
名称：remote-api
URL：http://localhost:3000/mcp
```

```
名称：cloud-service
URL：https://api.example.com/mcp/v1
```

### SSE（Server-Sent Events）

通过 Server-Sent Events 与远程服务通信，适用于旧版 SSE 协议的 MCP 服务器。

**配置字段：**

| 字段     | 说明           | 示例                        |
| -------- | -------------- | --------------------------- |
| 名称     | 服务器唯一标识 | `sse-server`                |
| 传输类型 | 选择 `SSE`     | —                           |
| URL      | SSE 端点地址   | `http://localhost:3000/sse` |

**典型示例：**

```
名称：sse-server
URL：http://localhost:3000/sse
```

---

## 通用配置

以下配置项适用于所有传输类型：

### 认证（Auth）

用于配置访问服务器所需的认证信息，支持 Bearer Token 或 API Key。

**示例：**

```
Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 环境变量（Env）

为服务器进程设置环境变量，每行一个，格式为 `KEY=VALUE`。这些变量会在启动 MCP 服务器进程时自动注入，**无需在电脑系统上单独配置**。

> 也就是说，这里配置的环境变量仅对该 MCP 服务器进程生效，不会影响系统或其他程序的环境变量。

**示例：**

```
API_KEY=sk-abc123def456
DB_HOST=localhost
DB_PORT=5432
DEBUG=true
```

### 请求头（Headers）

为 HTTP/SSE 类型的服务器设置自定义请求头，每行一个，格式为 `KEY=VALUE`。

> 注意：Headers 仅在选择 HTTP 或 SSE 传输类型时显示。

**示例：**

```
Authorization=Bearer token123
X-Custom-Header=custom-value
```

---

## 管理服务器

### 启用/禁用

点击服务器卡片上的 **已启用/已禁用** 按钮切换状态。禁用的服务器不会被加载，但配置会保留。

### 测试连接

点击 **测试** 按钮验证服务器是否可以正常连接。测试结果会显示在页面底部。

### 编辑

点击 **编辑** 按钮修改服务器配置。注意：服务器名称创建后不可修改。

### 删除

点击 **删除** 按钮移除服务器，删除前会弹出确认提示。

---

## 配置文件

MCP 服务器配置存储在 `~/.hermes/mcp_servers.yaml` 文件中，也可以直接编辑该文件。

**YAML 配置示例：**

```yaml
mcp_servers:
  filesystem-server:
    transport: stdio
    command: npx
    args:
      - "-y"
      - "@modelcontextprotocol/server-filesystem"
      - "/home/user/documents"
    enabled: true

  remote-api:
    transport: http
    url: http://localhost:3000/mcp
    enabled: true
    auth: "Bearer token123"
    headers:
      X-Custom-Header: custom-value

  sse-server:
    transport: sse
    url: http://localhost:3000/sse
    enabled: true
    env:
      API_KEY: sk-abc123def456
```

---

## 常见问题

### 添加服务器后没有生效？

- 检查服务器是否处于 **已启用** 状态
- 点击 **测试** 按钮确认连接是否正常
- 检查命令路径是否正确（Stdio 类型）
- 检查 URL 是否可访问（HTTP/SSE 类型）

### Stdio 类型的命令找不到？

确保命令已在系统 PATH 中可用。可以使用完整路径替代，例如：

```
命令：/usr/local/bin/python3
参数：-m mcp_server
```

### 环境变量中的值包含特殊字符？

如果值中包含 `=` 等特殊字符，第一个 `=` 之前的部分作为键名，之后的所有内容作为值。例如：

```
CONNECTION_STRING=host=localhost port=5432 dbname=mydb
```

解析结果为：键 `CONNECTION_STRING`，值 `host=localhost port=5432 dbname=mydb`。

### HTTP 和 SSE 如何选择？

- 如果服务器支持 **StreamableHTTP** 协议（较新的标准），选择 **HTTP**
- 如果服务器仅支持旧版 **SSE** 协议，选择 **SSE**
- 不确定时，可先尝试 HTTP，如果连接失败再切换为 SSE
