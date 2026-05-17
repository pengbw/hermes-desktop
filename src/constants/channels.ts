export type ChannelSetupMode = "qr" | "token" | "server" | "both";

export interface ChannelCapability {
  voice: boolean;
  image: boolean;
  file: boolean;
  groupChat: boolean;
  streamOutput: boolean;
  topic: boolean;
  reaction: boolean;
  typingIndicator: boolean;
}

export interface ChannelConfigField {
  key: string;
  label: string;
  labelEn: string;
  type: "text" | "password" | "number" | "url";
  required: boolean;
  placeholder?: string;
  helpText?: string;
  helpTextEn?: string;
}

export interface ChannelMeta {
  id: string;
  name: string;
  nameEn: string;
  icon: string;
  group: "domestic" | "international" | "other";
  setupMode: ChannelSetupMode;
  capability: ChannelCapability;
  configFields: ChannelConfigField[];
  setupGuide?: string;
  setupGuideEn?: string;
  envPrefix: string;
  sortOrder: number;
}

export interface ChannelStatus {
  id: string;
  channelType: string;
  displayName: string;
  status: "disconnected" | "connecting" | "connected" | "error";
  isHome: boolean;
  errorMessage?: string;
  connectedAt?: number;
  configJson: string;
  createdAt: number;
  updatedAt: number;
}

export const CHANNEL_GROUPS = {
  domestic: "国内平台",
  international: "国际平台",
  other: "其他通道",
} as const;

export const CHANNEL_LIST: ChannelMeta[] = [
  {
    id: "weixin",
    name: "微信",
    nameEn: "WeChat",
    icon: "💬",
    group: "domestic",
    setupMode: "qr",
    capability: {
      voice: true,
      image: true,
      file: true,
      groupChat: false,
      streamOutput: true,
      topic: false,
      reaction: false,
      typingIndicator: true,
    },
    configFields: [],
    setupGuide:
      "1. 点击「扫码接入」生成二维码\n2. 使用微信扫描二维码\n3. 在手机上确认授权\n4. 连接成功后即可在微信中与 Agent 对话",
    setupGuideEn:
      "1. Click 'Scan to Connect' to generate QR code\n2. Scan with WeChat\n3. Confirm authorization on phone\n4. Start chatting with Agent in WeChat",
    envPrefix: "WEIXIN",
    sortOrder: 1,
  },
  {
    id: "qqbot",
    name: "QQ Bot",
    nameEn: "QQ Bot",
    icon: "🐧",
    group: "domestic",
    setupMode: "both",
    capability: {
      voice: true,
      image: true,
      file: true,
      groupChat: true,
      streamOutput: false,
      topic: false,
      reaction: false,
      typingIndicator: true,
    },
    configFields: [
      {
        key: "app_id",
        label: "App ID",
        labelEn: "App ID",
        type: "text",
        required: true,
        placeholder: "QQ机器人AppID",
        helpText: "在 QQ 开放平台创建机器人后获取",
        helpTextEn: "Get from QQ Open Platform after creating a bot",
      },
      {
        key: "client_secret",
        label: "Client Secret",
        labelEn: "Client Secret",
        type: "password",
        required: true,
        placeholder: "QQ机器人ClientSecret",
        helpText: "在 QQ 开放平台创建机器人后获取",
        helpTextEn: "Get from QQ Open Platform after creating a bot",
      },
    ],
    setupGuide:
      "1. 前往 QQ 开放平台 (q.qq.com) 创建机器人\n2. 获取 AppID 和 AppSecret\n3. 点击「配置接入」填入凭证\n4. 在 QQ 中 @机器人 即可对话",
    setupGuideEn:
      "1. Go to QQ Open Platform (q.qq.com) to create a bot\n2. Get AppID and AppSecret\n3. Click 'Configure' and fill in credentials\n4. @bot in QQ to chat",
    envPrefix: "QQ",
    sortOrder: 2,
  },
  {
    id: "wecom",
    name: "企业微信",
    nameEn: "WeCom",
    icon: "🏢",
    group: "domestic",
    setupMode: "both",
    capability: {
      voice: true,
      image: true,
      file: true,
      groupChat: true,
      streamOutput: true,
      topic: false,
      reaction: false,
      typingIndicator: true,
    },
    configFields: [
      {
        key: "bot_id",
        label: "Bot ID",
        labelEn: "Bot ID",
        type: "text",
        required: true,
        placeholder: "wwxxxxxxxx",
        helpText: "在企业微信管理后台创建智能机器人后获取",
        helpTextEn: "Get from WeCom Admin Console after creating a bot",
      },
      {
        key: "secret",
        label: "Bot Secret",
        labelEn: "Bot Secret",
        type: "password",
        required: true,
        placeholder: "机器人密钥",
        helpText: "在企业微信管理后台创建智能机器人后获取",
        helpTextEn: "Get from WeCom Admin Console after creating a bot",
      },
    ],
    setupGuide:
      "1. 登录企业微信管理后台\n2. 进入「管理工具」→「智能机器人」→「创建机器人」\n3. 选择 API 模式创建，获取 Bot ID 和 Bot Secret\n4. 点击「配置接入」填入凭证",
    setupGuideEn:
      "1. Login to WeCom Admin Console\n2. Go to 'Manage Tools' → 'Smart Bot' → 'Create Bot'\n3. Select API mode, get Bot ID and Bot Secret\n4. Click 'Configure' and fill in credentials",
    envPrefix: "WECOM",
    sortOrder: 3,
  },
  {
    id: "dingtalk",
    name: "钉钉",
    nameEn: "DingTalk",
    icon: "🔵",
    group: "domestic",
    setupMode: "token",
    capability: {
      voice: false,
      image: true,
      file: true,
      groupChat: true,
      streamOutput: true,
      topic: false,
      reaction: true,
      typingIndicator: false,
    },
    configFields: [
      {
        key: "client_id",
        label: "Client ID (AppKey)",
        labelEn: "Client ID (AppKey)",
        type: "text",
        required: true,
        placeholder: "dingxxxxxxxxxx",
        helpText: "在钉钉开放平台创建应用后获取",
        helpTextEn: "Get from DingTalk Open Platform after creating an app",
      },
      {
        key: "client_secret",
        label: "Client Secret (AppSecret)",
        labelEn: "Client Secret (AppSecret)",
        type: "password",
        required: true,
        placeholder: "钉钉应用密钥",
        helpText: "在钉钉开放平台创建应用后获取",
        helpTextEn: "Get from DingTalk Open Platform after creating an app",
      },
    ],
    setupGuide:
      "1. 前往钉钉开放平台 (open.dingtalk.com) 创建应用\n2. 添加机器人能力并发布\n3. 获取 AppKey 和 AppSecret\n4. 点击「配置接入」填入凭证",
    setupGuideEn:
      "1. Go to DingTalk Open Platform to create an app\n2. Add bot capability and publish\n3. Get AppKey and AppSecret\n4. Click 'Configure' and fill in credentials",
    envPrefix: "DINGTALK",
    sortOrder: 4,
  },
  {
    id: "feishu",
    name: "飞书",
    nameEn: "Feishu / Lark",
    icon: "🐦",
    group: "domestic",
    setupMode: "both",
    capability: {
      voice: true,
      image: true,
      file: true,
      groupChat: true,
      streamOutput: true,
      topic: true,
      reaction: true,
      typingIndicator: true,
    },
    configFields: [
      {
        key: "app_id",
        label: "App ID",
        labelEn: "App ID",
        type: "text",
        required: true,
        placeholder: "cli_xxxxxxxxxx",
        helpText: "在飞书开放平台创建应用后获取",
        helpTextEn: "Get from Feishu Open Platform after creating an app",
      },
      {
        key: "app_secret",
        label: "App Secret",
        labelEn: "App Secret",
        type: "password",
        required: true,
        placeholder: "应用密钥",
        helpText: "在飞书开放平台创建应用后获取",
        helpTextEn: "Get from Feishu Open Platform after creating an app",
      },
    ],
    setupGuide:
      "1. 前往飞书开放平台创建企业自建应用\n2. 添加「机器人」能力\n3. 获取 App ID 和 App Secret\n4. 点击「配置接入」填入凭证\n5. 在飞书中搜索机器人发消息测试",
    setupGuideEn:
      "1. Go to Feishu Open Platform to create an app\n2. Add 'Bot' capability\n3. Get App ID and App Secret\n4. Click 'Configure' and fill in credentials\n5. Search bot in Feishu and send a test message",
    envPrefix: "FEISHU",
    sortOrder: 5,
  },
  {
    id: "yuanbao",
    name: "元宝",
    nameEn: "Yuanbao",
    icon: "💎",
    group: "domestic",
    setupMode: "token",
    capability: {
      voice: true,
      image: true,
      file: true,
      groupChat: false,
      streamOutput: true,
      topic: false,
      reaction: false,
      typingIndicator: true,
    },
    configFields: [
      {
        key: "app_id",
        label: "App ID",
        labelEn: "App ID",
        type: "text",
        required: true,
        placeholder: "元宝 App ID",
        helpText: "在元宝开放平台获取",
        helpTextEn: "Get from Yuanbao Open Platform",
      },
      {
        key: "app_secret",
        label: "App Secret",
        labelEn: "App Secret",
        type: "password",
        required: true,
        placeholder: "元宝 App Secret",
        helpText: "在元宝开放平台获取",
        helpTextEn: "Get from Yuanbao Open Platform",
      },
    ],
    setupGuide:
      "1. 前往元宝开放平台创建应用\n2. 获取 App ID 和 App Secret\n3. 点击「配置接入」填入凭证",
    setupGuideEn:
      "1. Go to Yuanbao Open Platform to create an app\n2. Get App ID and App Secret\n3. Click 'Configure' and fill in credentials",
    envPrefix: "YUANBAO",
    sortOrder: 6,
  },
  {
    id: "telegram",
    name: "Telegram",
    nameEn: "Telegram",
    icon: "✈️",
    group: "international",
    setupMode: "token",
    capability: {
      voice: true,
      image: true,
      file: true,
      groupChat: true,
      streamOutput: true,
      topic: true,
      reaction: false,
      typingIndicator: true,
    },
    configFields: [
      {
        key: "bot_token",
        label: "Bot Token",
        labelEn: "Bot Token",
        type: "password",
        required: true,
        placeholder: "123456789:ABCdefGHI...",
        helpText: "在 Telegram 中通过 @BotFather 创建 Bot 后获取",
        helpTextEn: "Get from @BotFather in Telegram after creating a bot",
      },
      {
        key: "allowed_users",
        label: "允许的用户 ID",
        labelEn: "Allowed User IDs",
        type: "text",
        required: false,
        placeholder: "user_id_1, user_id_2",
        helpText: "逗号分隔的 Telegram 用户 ID，留空则允许所有人",
        helpTextEn: "Comma-separated Telegram user IDs, leave empty to allow all",
      },
    ],
    setupGuide:
      "1. 在 Telegram 中搜索 @BotFather\n2. 发送 /newbot 创建新 Bot\n3. 按提示操作获取 Bot Token\n4. 点击「配置接入」填入 Token",
    setupGuideEn:
      "1. Search @BotFather in Telegram\n2. Send /newbot to create a new bot\n3. Follow instructions to get Bot Token\n4. Click 'Configure' and fill in Token",
    envPrefix: "TELEGRAM",
    sortOrder: 10,
  },
  {
    id: "discord",
    name: "Discord",
    nameEn: "Discord",
    icon: "🎮",
    group: "international",
    setupMode: "token",
    capability: {
      voice: true,
      image: true,
      file: true,
      groupChat: true,
      streamOutput: true,
      topic: true,
      reaction: true,
      typingIndicator: true,
    },
    configFields: [
      {
        key: "bot_token",
        label: "Bot Token",
        labelEn: "Bot Token",
        type: "password",
        required: true,
        placeholder: "Discord Bot Token",
        helpText: "在 Discord Developer Portal 创建 Bot 后获取",
        helpTextEn: "Get from Discord Developer Portal after creating a bot",
      },
      {
        key: "allowed_guilds",
        label: "允许的服务器 ID",
        labelEn: "Allowed Guild IDs",
        type: "text",
        required: false,
        placeholder: "guild_id_1, guild_id_2",
        helpText: "逗号分隔的 Discord 服务器 ID",
        helpTextEn: "Comma-separated Discord guild IDs",
      },
    ],
    setupGuide:
      "1. 前往 Discord Developer Portal 创建应用\n2. 在 Bot 页面获取 Token\n3. 开启 MESSAGE CONTENT INTENT\n4. 点击「配置接入」填入 Token",
    setupGuideEn:
      "1. Go to Discord Developer Portal to create an app\n2. Get Token from Bot page\n3. Enable MESSAGE CONTENT INTENT\n4. Click 'Configure' and fill in Token",
    envPrefix: "DISCORD",
    sortOrder: 11,
  },
  {
    id: "slack",
    name: "Slack",
    nameEn: "Slack",
    icon: "📱",
    group: "international",
    setupMode: "token",
    capability: {
      voice: true,
      image: true,
      file: true,
      groupChat: true,
      streamOutput: true,
      topic: true,
      reaction: true,
      typingIndicator: true,
    },
    configFields: [
      {
        key: "bot_token",
        label: "Bot Token",
        labelEn: "Bot Token (xoxb-)",
        type: "password",
        required: true,
        placeholder: "xoxb-xxxxxxxxxx-...",
        helpText: "在 Slack API 创建 Bot 后获取",
        helpTextEn: "Get from Slack API after creating a bot",
      },
      {
        key: "app_token",
        label: "App Token",
        labelEn: "App Token (xapp-)",
        type: "password",
        required: true,
        placeholder: "xapp-xxxxxxxxxx-...",
        helpText: "Socket Mode 需要的 App-Level Token",
        helpTextEn: "App-Level Token for Socket Mode",
      },
    ],
    setupGuide:
      "1. 前往 Slack API 创建应用\n2. 启用 Socket Mode\n3. 获取 Bot Token (xoxb-) 和 App Token (xapp-)\n4. 点击「配置接入」填入凭证",
    setupGuideEn:
      "1. Go to Slack API to create an app\n2. Enable Socket Mode\n3. Get Bot Token (xoxb-) and App Token (xapp-)\n4. Click 'Configure' and fill in credentials",
    envPrefix: "SLACK",
    sortOrder: 12,
  },
  {
    id: "whatsapp",
    name: "WhatsApp",
    nameEn: "WhatsApp",
    icon: "📲",
    group: "international",
    setupMode: "both",
    capability: {
      voice: false,
      image: true,
      file: true,
      groupChat: false,
      streamOutput: true,
      topic: false,
      reaction: false,
      typingIndicator: true,
    },
    configFields: [
      {
        key: "enabled",
        label: "已连接确认",
        labelEn: "Connection Confirmed",
        type: "text",
        required: true,
        placeholder: "输入 yes 确认已通过命令行完成连接",
        helpText: "先在终端运行 hermes whatsapp 完成扫码连接，然后在此输入 yes 确认",
        helpTextEn: "Run 'hermes whatsapp' in terminal first to scan QR, then type yes here",
      },
    ],
    setupGuide:
      "1. 在终端中运行: hermes whatsapp\n2. 扫描终端中显示的二维码\n3. 扫码成功后，点击「配置接入」输入 yes 确认",
    setupGuideEn:
      "1. Run in terminal: hermes whatsapp\n2. Scan the QR code shown in terminal\n3. After successful scan, click 'Configure' and type yes to confirm",
    envPrefix: "WHATSAPP",
    sortOrder: 13,
  },
  {
    id: "signal",
    name: "Signal",
    nameEn: "Signal",
    icon: "🔒",
    group: "international",
    setupMode: "token",
    capability: {
      voice: false,
      image: true,
      file: true,
      groupChat: false,
      streamOutput: true,
      topic: false,
      reaction: false,
      typingIndicator: true,
    },
    configFields: [
      {
        key: "account",
        label: "Signal 号码",
        labelEn: "Signal Phone Number",
        type: "text",
        required: true,
        placeholder: "+1234567890",
        helpText: "关联的 Signal 电话号码",
        helpTextEn: "Linked Signal phone number",
      },
      {
        key: "http_url",
        label: "signal-cli HTTP URL",
        labelEn: "signal-cli HTTP URL",
        type: "url",
        required: true,
        placeholder: "http://localhost:8080",
        helpText: "signal-cli HTTP 模式 URL",
        helpTextEn: "signal-cli HTTP mode URL",
      },
    ],
    setupGuide: "1. 安装 signal-cli\n2. 注册或关联 Signal 号码\n3. 点击「配置接入」填入号码",
    setupGuideEn:
      "1. Install signal-cli\n2. Register or link a Signal number\n3. Click 'Configure' and fill in number",
    envPrefix: "SIGNAL",
    sortOrder: 14,
  },
  {
    id: "email",
    name: "电子邮件",
    nameEn: "Email",
    icon: "📧",
    group: "other",
    setupMode: "server",
    capability: {
      voice: false,
      image: true,
      file: true,
      groupChat: false,
      streamOutput: false,
      topic: true,
      reaction: false,
      typingIndicator: false,
    },
    configFields: [
      {
        key: "smtp_host",
        label: "SMTP 服务器",
        labelEn: "SMTP Host",
        type: "text",
        required: true,
        placeholder: "smtp.gmail.com",
      },
      {
        key: "smtp_port",
        label: "SMTP 端口",
        labelEn: "SMTP Port",
        type: "number",
        required: true,
        placeholder: "587",
      },
      {
        key: "imap_host",
        label: "IMAP 服务器",
        labelEn: "IMAP Host",
        type: "text",
        required: true,
        placeholder: "imap.gmail.com",
      },
      {
        key: "imap_port",
        label: "IMAP 端口",
        labelEn: "IMAP Port",
        type: "number",
        required: true,
        placeholder: "993",
      },
      {
        key: "address",
        label: "邮箱地址",
        labelEn: "Email Address",
        type: "text",
        required: true,
        placeholder: "your@gmail.com",
      },
      {
        key: "password",
        label: "密码 / App Password",
        labelEn: "Password / App Password",
        type: "password",
        required: true,
        placeholder: "应用专用密码",
      },
    ],
    setupGuide:
      "1. 准备支持 SMTP/IMAP 的邮箱\n2. 如使用 Gmail，需生成应用专用密码\n3. 点击「配置接入」填入服务器信息",
    setupGuideEn:
      "1. Prepare an email with SMTP/IMAP support\n2. For Gmail, generate an App Password\n3. Click 'Configure' and fill in server info",
    envPrefix: "EMAIL",
    sortOrder: 20,
  },
  {
    id: "sms",
    name: "SMS (Twilio)",
    nameEn: "SMS (Twilio)",
    icon: "📩",
    group: "other",
    setupMode: "token",
    capability: {
      voice: false,
      image: false,
      file: false,
      groupChat: false,
      streamOutput: false,
      topic: false,
      reaction: false,
      typingIndicator: false,
    },
    configFields: [
      {
        key: "account_sid",
        label: "Account SID",
        labelEn: "Account SID",
        type: "text",
        required: true,
        placeholder: "ACxxxxxxxxxx",
        helpText: "在 Twilio 控制台获取",
        helpTextEn: "Get from Twilio Console",
      },
      {
        key: "auth_token",
        label: "Auth Token",
        labelEn: "Auth Token",
        type: "password",
        required: true,
        placeholder: "Twilio Auth Token",
        helpText: "在 Twilio 控制台获取",
        helpTextEn: "Get from Twilio Console",
      },
      {
        key: "phone_number",
        label: "发送号码",
        labelEn: "From Number",
        type: "text",
        required: true,
        placeholder: "+1234567890",
        helpText: "Twilio 提供的电话号码",
        helpTextEn: "Phone number provided by Twilio",
      },
    ],
    setupGuide:
      "1. 注册 Twilio 账号\n2. 获取 Account SID、Auth Token 和电话号码\n3. 点击「配置接入」填入凭证",
    setupGuideEn:
      "1. Register a Twilio account\n2. Get Account SID, Auth Token and phone number\n3. Click 'Configure' and fill in credentials",
    envPrefix: "TWILIO",
    sortOrder: 21,
  },
  {
    id: "matrix",
    name: "Matrix",
    nameEn: "Matrix",
    icon: "🟢",
    group: "other",
    setupMode: "token",
    capability: {
      voice: true,
      image: true,
      file: true,
      groupChat: true,
      streamOutput: true,
      topic: true,
      reaction: true,
      typingIndicator: true,
    },
    configFields: [
      {
        key: "homeserver",
        label: "Homeserver URL",
        labelEn: "Homeserver URL",
        type: "url",
        required: true,
        placeholder: "https://matrix.org",
      },
      {
        key: "access_token",
        label: "Access Token",
        labelEn: "Access Token",
        type: "password",
        required: true,
        placeholder: "Matrix Access Token",
      },
      {
        key: "allowed_users",
        label: "允许的用户",
        labelEn: "Allowed Users",
        type: "text",
        required: false,
        placeholder: "@user:matrix.org",
        helpText: "逗号分隔的 Matrix 用户 ID",
        helpTextEn: "Comma-separated Matrix user IDs",
      },
    ],
    setupGuide: "1. 在 Matrix 服务器上创建账号\n2. 获取 Access Token\n3. 点击「配置接入」填入凭证",
    setupGuideEn:
      "1. Create an account on a Matrix server\n2. Get Access Token\n3. Click 'Configure' and fill in credentials",
    envPrefix: "MATRIX",
    sortOrder: 22,
  },
  {
    id: "mattermost",
    name: "Mattermost",
    nameEn: "Mattermost",
    icon: "🔷",
    group: "other",
    setupMode: "token",
    capability: {
      voice: true,
      image: true,
      file: true,
      groupChat: true,
      streamOutput: true,
      topic: true,
      reaction: false,
      typingIndicator: true,
    },
    configFields: [
      {
        key: "url",
        label: "服务器 URL",
        labelEn: "Server URL",
        type: "url",
        required: true,
        placeholder: "https://mattermost.example.com",
      },
      {
        key: "token",
        label: "Access Token",
        labelEn: "Access Token",
        type: "password",
        required: true,
        placeholder: "Mattermost Bot Token",
      },
    ],
    setupGuide:
      "1. 在 Mattermost 中创建 Bot 账号\n2. 获取 Access Token\n3. 点击「配置接入」填入凭证",
    setupGuideEn:
      "1. Create a Bot account in Mattermost\n2. Get Access Token\n3. Click 'Configure' and fill in credentials",
    envPrefix: "MATTERMOST",
    sortOrder: 23,
  },
  {
    id: "homeassistant",
    name: "Home Assistant",
    nameEn: "Home Assistant",
    icon: "🏠",
    group: "other",
    setupMode: "token",
    capability: {
      voice: false,
      image: false,
      file: false,
      groupChat: false,
      streamOutput: false,
      topic: false,
      reaction: false,
      typingIndicator: false,
    },
    configFields: [
      {
        key: "url",
        label: "HA URL",
        labelEn: "HA URL",
        type: "url",
        required: true,
        placeholder: "http://homeassistant.local:8123",
      },
      {
        key: "token",
        label: "Long-Lived Access Token",
        labelEn: "Long-Lived Access Token",
        type: "password",
        required: true,
        placeholder: "HA Access Token",
      },
    ],
    setupGuide:
      "1. 在 Home Assistant 中生成 Long-Lived Access Token\n2. 点击「配置接入」填入 URL 和 Token",
    setupGuideEn:
      "1. Generate a Long-Lived Access Token in Home Assistant\n2. Click 'Configure' and fill in URL and Token",
    envPrefix: "HASS",
    sortOrder: 24,
  },
  {
    id: "bluebubbles",
    name: "iMessage (BlueBubbles)",
    nameEn: "iMessage (BlueBubbles)",
    icon: "🍎",
    group: "other",
    setupMode: "token",
    capability: {
      voice: false,
      image: true,
      file: true,
      groupChat: false,
      streamOutput: false,
      topic: false,
      reaction: true,
      typingIndicator: true,
    },
    configFields: [
      {
        key: "server_url",
        label: "BlueBubbles 服务器 URL",
        labelEn: "BlueBubbles Server URL",
        type: "url",
        required: true,
        placeholder: "http://localhost:1234",
      },
      {
        key: "password",
        label: "密码",
        labelEn: "Password",
        type: "password",
        required: true,
        placeholder: "BlueBubbles Password",
      },
    ],
    setupGuide:
      "1. 安装 BlueBubbles 服务器 (macOS)\n2. 设置密码并启动服务器\n3. 点击「配置接入」填入 URL 和密码",
    setupGuideEn:
      "1. Install BlueBubbles server (macOS)\n2. Set password and start server\n3. Click 'Configure' and fill in URL and password",
    envPrefix: "BLUEBUBBLES",
    sortOrder: 25,
  },
  {
    id: "open-webui",
    name: "Open WebUI",
    nameEn: "Open WebUI",
    icon: "🌐",
    group: "other",
    setupMode: "token",
    capability: {
      voice: false,
      image: false,
      file: false,
      groupChat: false,
      streamOutput: false,
      topic: false,
      reaction: false,
      typingIndicator: false,
    },
    configFields: [
      {
        key: "server_url",
        label: "服务器 URL",
        labelEn: "Server URL",
        type: "url",
        required: true,
        placeholder: "http://localhost:3000",
      },
      {
        key: "api_key",
        label: "API Key",
        labelEn: "API Key",
        type: "password",
        required: true,
        placeholder: "Open WebUI API Key",
      },
    ],
    setupGuide: "1. 部署 Open WebUI 实例\n2. 获取 API Key\n3. 点击「配置接入」填入凭证",
    setupGuideEn:
      "1. Deploy Open WebUI instance\n2. Get API Key\n3. Click 'Configure' and fill in credentials",
    envPrefix: "OPENWEBUI",
    sortOrder: 26,
  },
  {
    id: "webhooks",
    name: "Webhooks",
    nameEn: "Webhooks",
    icon: "🪝",
    group: "other",
    setupMode: "server",
    capability: {
      voice: false,
      image: false,
      file: false,
      groupChat: false,
      streamOutput: false,
      topic: false,
      reaction: false,
      typingIndicator: false,
    },
    configFields: [
      {
        key: "url",
        label: "Webhook URL",
        labelEn: "Webhook URL",
        type: "url",
        required: true,
        placeholder: "https://your-server.com/webhook",
      },
      {
        key: "secret",
        label: "签名密钥",
        labelEn: "Signing Secret",
        type: "password",
        required: false,
        placeholder: "可选的签名密钥",
      },
    ],
    setupGuide: "1. 准备一个可接收 HTTP POST 的 Webhook 端点\n2. 点击「配置接入」填入 URL",
    setupGuideEn: "1. Prepare an HTTP POST webhook endpoint\n2. Click 'Configure' and fill in URL",
    envPrefix: "WEBHOOK",
    sortOrder: 27,
  },
];

export function getChannelMeta(channelType: string): ChannelMeta | undefined {
  return CHANNEL_LIST.find((c) => c.id === channelType);
}

export function getChannelsByGroup(group: ChannelMeta["group"]): ChannelMeta[] {
  return CHANNEL_LIST.filter((c) => c.group === group).sort((a, b) => a.sortOrder - b.sortOrder);
}
