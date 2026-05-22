import openaiSvg from "@assets/provider-icons/openai.svg?raw";
import anthropicSvg from "@assets/provider-icons/anthropic.svg?raw";
import googleSvg from "@assets/provider-icons/google.svg?raw";
import xaiSvg from "@assets/provider-icons/xai.svg?raw";
import mistralSvg from "@assets/provider-icons/mistral.svg?raw";
import deepseekSvg from "@assets/provider-icons/deepseek.svg?raw";
import nvidiaSvg from "@assets/provider-icons/nvidia.svg?raw";
import openrouterSvg from "@assets/provider-icons/openrouter.svg?raw";
import ollamaSvg from "@assets/provider-icons/ollama.svg?raw";
import minimaxSvg from "@assets/provider-icons/minimax.svg?raw";
import nousSvg from "@assets/provider-icons/nous.svg?raw";
import zaiSvg from "@assets/provider-icons/zai.svg?raw";
import kimiSvg from "@assets/provider-icons/kimi.svg?raw";
import alibabaSvg from "@assets/provider-icons/alibaba.svg?raw";
import huggingfaceSvg from "@assets/provider-icons/huggingface.svg?raw";
import vercelSvg from "@assets/provider-icons/vercel.svg?raw";
import githubcopilotSvg from "@assets/provider-icons/githubcopilot.svg?raw";
import xiaomiSvg from "@assets/provider-icons/xiaomi.svg?raw";
import tencentSvg from "@assets/provider-icons/tencent.svg?raw";
import lmstudioSvg from "@assets/provider-icons/lmstudio.svg?raw";
import stepfunSvg from "@assets/provider-icons/stepfun.svg?raw";
import novitaSvg from "@assets/provider-icons/novita.svg?raw";
import opencodeSvg from "@assets/provider-icons/opencode.svg?raw";

interface ProviderIconProps {
  providerName: string;
  icon?: string;
  size?: number;
}

const SVG_ICONS: Record<string, string> = {
  openai: openaiSvg,
  anthropic: anthropicSvg,
  google: googleSvg,
  xai: xaiSvg,
  mistral: mistralSvg,
  deepseek: deepseekSvg,
  nvidia: nvidiaSvg,
  openrouter: openrouterSvg,
  ollama: ollamaSvg,
  minimax: minimaxSvg,
  nous: nousSvg,
  zai: zaiSvg,
  kimi: kimiSvg,
  alibaba: alibabaSvg,
  huggingface: huggingfaceSvg,
  vercel: vercelSvg,
  githubcopilot: githubcopilotSvg,
  xiaomi: xiaomiSvg,
  tencent: tencentSvg,
  lmstudio: lmstudioSvg,
  stepfun: stepfunSvg,
  novita: novitaSvg,
  opencode: opencodeSvg,
};

const BRAND_COLORS: Record<string, string> = {
  openai: "#10A37F",
  anthropic: "#d97757",
  google: "#4285F4",
  xai: "#000000",
  mistral: "#EB3232",
  deepseek: "#4d6bfe",
  nvidia: "#76B900",
  openrouter: "#FF5204",
  ollama: "#000000",
  minimax: "#005AFF",
  nous: "#2D6376",
  zai: "#3859FF",
  kimi: "#000000",
  alibaba: "#FF6A00",
  huggingface: "#FFD21E",
  vercel: "#000000",
  githubcopilot: "#38BDF8",
  xiaomi: "#FF6900",
  tencent: "#1AAD19",
  lmstudio: "#4338CA",
  stepfun: "#005AFF",
  novita: "#7C3AED",
  opencode: "#10B981",
  kilogateway: "#F59E0B",
  ollamacloud: "#000000",
};

function colorizeSvg(svg: string, color: string): string {
  let result = svg;
  result = result.replace(/fill="currentColor"/g, `fill="${color}"`);
  result = result.replace(/<svg/, `<svg fill="${color}"`);
  return result;
}

export default function ProviderIcon({ providerName, icon, size = 36 }: ProviderIconProps) {
  const iconKey = icon || providerName.toLowerCase();
  const svg = SVG_ICONS[iconKey];

  if (svg) {
    const brandColor = BRAND_COLORS[iconKey];
    const coloredSvg = brandColor ? colorizeSvg(svg, brandColor) : svg;
    const sizedSvg = coloredSvg.replace("<svg", `<svg width="${size}" height="${size}"`);
    return (
      <span
        dangerouslySetInnerHTML={{ __html: sizedSvg }}
        style={{
          width: size,
          height: size,
          flexShrink: 0,
          display: "inline-block",
        }}
      />
    );
  }

  const letter = providerName.charAt(0).toUpperCase();
  const bg = BRAND_COLORS[iconKey] || "#6366F1";

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 10,
        backgroundColor: bg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#fff",
        fontSize: size * 0.4,
        fontWeight: 600,
        flexShrink: 0,
      }}
    >
      {letter}
    </div>
  );
}
