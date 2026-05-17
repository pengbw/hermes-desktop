import weixinSvg from "@assets/channel-icons/weixin.svg?raw";
import qqbotSvg from "@assets/channel-icons/qqbot.svg?raw";
import wecomSvg from "@assets/channel-icons/wecom.svg?raw";
import dingtalkSvg from "@assets/channel-icons/dingtalk.svg?raw";
import feishuSvg from "@assets/channel-icons/feishu.svg?raw";
import yuanbaoSvg from "@assets/channel-icons/yuanbao.svg?raw";
import telegramSvg from "@assets/channel-icons/telegram.svg?raw";
import discordSvg from "@assets/channel-icons/discord.svg?raw";
import slackSvg from "@assets/channel-icons/slack.svg?raw";
import whatsappSvg from "@assets/channel-icons/whatsapp.svg?raw";
import signalSvg from "@assets/channel-icons/signal.svg?raw";
import emailSvg from "@assets/channel-icons/email.svg?raw";
import smsSvg from "@assets/channel-icons/sms.svg?raw";
import matrixSvg from "@assets/channel-icons/matrix.svg?raw";
import mattermostSvg from "@assets/channel-icons/mattermost.svg?raw";
import homeassistantSvg from "@assets/channel-icons/homeassistant.svg?raw";
import bluebubblesSvg from "@assets/channel-icons/bluebubbles.svg?raw";
import openWebuiSvg from "@assets/channel-icons/open-webui.svg?raw";
import webhooksSvg from "@assets/channel-icons/webhooks.svg?raw";

interface PlatformIconProps {
  channelId: string;
  size?: number;
}

const SVG_ICONS: Record<string, string> = {
  weixin: weixinSvg,
  qqbot: qqbotSvg,
  wecom: wecomSvg,
  dingtalk: dingtalkSvg,
  feishu: feishuSvg,
  yuanbao: yuanbaoSvg,
  telegram: telegramSvg,
  discord: discordSvg,
  slack: slackSvg,
  whatsapp: whatsappSvg,
  signal: signalSvg,
  email: emailSvg,
  sms: smsSvg,
  matrix: matrixSvg,
  mattermost: mattermostSvg,
  homeassistant: homeassistantSvg,
  bluebubbles: bluebubblesSvg,
  "open-webui": openWebuiSvg,
  webhooks: webhooksSvg,
};

const FALLBACK_COLORS: Record<string, string> = {
  weixin: "#07C160",
  qqbot: "#12B7F5",
  wecom: "#1989FA",
  dingtalk: "#0089FF",
  feishu: "#3370FF",
  yuanbao: "#8B5CF6",
  telegram: "#26A5E4",
  discord: "#5865F2",
  slack: "#4A154B",
  whatsapp: "#25D366",
  signal: "#3A76F0",
  email: "#EA4335",
  sms: "#F22F46",
  matrix: "#0DBD8B",
  mattermost: "#0058CC",
  homeassistant: "#18BCF2",
  bluebubbles: "#007AFF",
  "open-webui": "#6366F1",
  webhooks: "#FF6B35",
  zalo: "#0068FF",
  line: "#06C755",
  kakaotalk: "#FEE500",
  teams: "#6264A7",
  imessage: "#34C759",
  messenger: "#0084FF",
  instagram: "#E1306C",
  twitter: "#1DA1F2",
  voice: "#FF3B30",
  alexa: "#00CAFF",
};

export default function PlatformIcon({ channelId, size = 40 }: PlatformIconProps) {
  const svg = SVG_ICONS[channelId];

  if (svg) {
    const sizedSvg = svg.replace("<svg", '<svg width="100%" height="100%"');
    const dataUri = `data:image/svg+xml,${encodeURIComponent(sizedSvg)}`;
    return (
      <img
        src={dataUri}
        alt={channelId}
        style={{
          width: size,
          height: size,
          flexShrink: 0,
        }}
      />
    );
  }

  const letter = channelId.charAt(0).toUpperCase();
  const bg = FALLBACK_COLORS[channelId] || "#6366F1";

  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        backgroundColor: bg,
        color: "#fff",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.45,
        fontWeight: 700,
        flexShrink: 0,
        lineHeight: 1,
      }}
    >
      {letter}
    </span>
  );
}
