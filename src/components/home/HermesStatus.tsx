import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

interface HermesStatusProps {
  t: (key: string, params?: Record<string, string | number>) => string;
}

function HermesStatus({ t }: HermesStatusProps) {
  return (
    <Card className="border-none shadow-none bg-transparent">
      <CardContent className="flex flex-col items-center gap-3 pt-6">
        <Avatar className="h-24 w-24 ring-2 ring-primary/20 ring-offset-2 ring-offset-background">
          <AvatarImage src="/bot.svg" alt={t("home.welcome")} />
          <AvatarFallback className="text-2xl bg-gradient-to-br from-primary/20 to-primary/5">
            🤖
          </AvatarFallback>
        </Avatar>
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">
          {t("home.welcome")}
        </h2>
        <p className="text-sm text-muted-foreground text-center leading-relaxed whitespace-nowrap">
          {t("app.desc")}
        </p>
      </CardContent>
    </Card>
  );
}

export default HermesStatus;
