"use client";

import { Link } from "expo-router";
import { WebIcon } from "@/packages/components/web-icon";
import { useState, useEffect } from "react";
import { cn } from "@/packages/lib/cn";

// Hydration-safe client detection (SSR placeholder + animated shapes)
function useIsClient() {
  const [isClient, setIsClient] = useState(false);
  useEffect(() => {
    setIsClient(true);
  }, []);
  return isClient;
}


function ElegantShape({
  className,
  delay = 0,
  width = 400,
  height = 100,
  rotate = 0,
  gradient = "from-indigo-500/[0.08]",
}: {
  className?: string;
  delay?: number;
  width?: number;
  height?: number;
  rotate?: number;
  gradient?: string;
}) {
  return (
    <div
      className={cn("pl-shape-in absolute", className)}
      style={
        {
          width,
          height,
          "--pl-delay": delay + "s",
          "--pl-rotate": rotate + "deg",
          "--pl-rotate-from": (rotate - 15) + "deg",
        } as React.CSSProperties
      }
    >
      <div className="pl-float relative" style={{ width, height }}>
        <div
          className={cn(
            "absolute inset-0 rounded-full",
            "bg-gradient-to-r to-transparent",
            gradient,
            "backdrop-blur-[2px] border border-indigo-500/[0.1]",
            "shadow-[0_8px_32px_0_rgba(99,102,241,0.1)]"
          )}
        />
      </div>
    </div>
  );
}

interface VoiceVisualizerProps {
  isActive: boolean;
  bars?: number;
}

function VoiceVisualizer({ isActive, bars = 24 }: VoiceVisualizerProps) {
  const [barHeights, setBarHeights] = useState<number[]>([]);

  useEffect(() => {
    // Generate random heights only on client side to avoid hydration mismatch
    setBarHeights(Array.from({ length: bars }, () => 20 + Math.random() * 80));
  }, [bars]);

  useEffect(() => {
    if (!isActive || barHeights.length === 0) return;
    // Animate bar heights when recording
    const interval = setInterval(() => {
      setBarHeights(Array.from({ length: bars }, () => 20 + Math.random() * 80));
    }, 150);
    return () => clearInterval(interval);
  }, [isActive, bars, barHeights.length]);

  return (
    <div className="h-16 w-full flex items-center justify-center gap-1">
      {[...Array(bars)].map((_, i) => (
        <div
          key={i}
          className={cn(
            "w-1 rounded-full transition-all duration-150",
            isActive ? "bg-primary" : "bg-primary/20 h-2"
          )}
          style={
            isActive && barHeights.length > 0
              ? {
                  height: `${barHeights[i] ?? 50}%`,
                }
              : undefined
          }
        />
      ))}
    </div>
  );
}

function Button({
  className,
  variant = "default",
  size = "default",
  children,
  ...props
}: React.ComponentProps<"button"> & {
  variant?: "default" | "outline";
  size?: "default" | "lg";
}) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-all",
        "disabled:pointer-events-none disabled:opacity-50",
        "outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
        variant === "default" &&
          "bg-primary text-white shadow-lg shadow-primary/20 hover:bg-primary/90",
        variant === "outline" &&
          "border border-border bg-background hover:bg-surface text-foreground",
        size === "default" && "h-10 px-4 py-2",
        size === "lg" && "h-12 px-8 text-base",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

const features = [
  {
    icon: "bolt",
    title: "Instant Launch",
    description:
      "アプリを開いてすぐに録音開始。待ち時間なしで素早くメモを取れます",
  },
  {
    icon: "mic",
    title: "Realtime STT",
    description: "Scribe v2 Realtime SSTによるリアルタイム文字起こしと話者分離",
  },
  {
    icon: "shield",
    title: "Local & Private",
    description: "全てはこの端末上に保存。運営会社のサーバーには送信されず、AIモデルの学習にも使用されません",
  },
];

function VoiceMemoLanding() {
  const isClient = useIsClient();
  const [isRecording, setIsRecording] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setIsRecording((prev) => !prev);
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  // SSR placeholder to avoid hydration mismatch
  if (!isClient) {
    return (
      <div className="relative min-h-screen w-full bg-background flex items-center justify-center" style={{ height: '100vh' }}>
        <div className="text-muted">Loading...</div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen w-full bg-background overflow-y-auto" style={{ height: '100vh' }}>
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/3 pointer-events-none" />

      {/* Only render animated shapes on client to avoid hydration mismatch */}
      {isClient && (
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <ElegantShape
            delay={0.3}
            width={500}
            height={120}
            rotate={12}
            gradient="from-indigo-500/[0.08]"
            className="left-[-10%] top-[15%]"
          />

          <ElegantShape
            delay={0.5}
            width={400}
            height={100}
            rotate={-15}
            gradient="from-indigo-500/[0.08]"
            className="right-[-5%] top-[70%]"
          />

          <ElegantShape
            delay={0.4}
            width={250}
            height={70}
            rotate={-8}
            gradient="from-indigo-500/[0.08]"
            className="left-[10%] bottom-[10%]"
          />
        </div>
      )}

      <div className="relative z-10">
        {/* Header */}
        <header className="container mx-auto px-6 py-6">
          <nav className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                <WebIcon name="mic" size={20} className="text-white" />
              </div>
              <span className="text-xl font-semibold text-foreground">
                Pleno Live
              </span>
            </div>
            <div className="hidden md:flex items-center gap-8">
              <a href="#features" className="text-muted hover:text-foreground transition-colors">
                Features
              </a>
              <a
                href="https://github.com/plenoai/pleno-live/releases"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button variant="outline" size="default">
                  Download App
                </Button>
              </a>
              <a
                href="https://github.com/plenoai/pleno-live"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted hover:text-foreground transition-colors"
              >
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
              </a>
            </div>
          </nav>
        </header>

        {/* Hero Section */}
        <section className="container mx-auto px-6 pt-12 pb-16 md:pt-24 md:pb-24">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-16">
              <div
                className="pl-fade-up inline-flex items-center gap-2 px-4 py-2 rounded-full bg-surface border border-primary/10 mb-8"
                style={{ "--pl-delay": "0.2s" } as React.CSSProperties}
              >
                <div className="h-2 w-2 rounded-full bg-primary" />
                <span className="text-sm text-muted font-medium">
                  AI-Powered Transcription
                </span>
              </div>

              <h1
                className="pl-fade-up text-5xl sm:text-6xl md:text-7xl font-bold mb-6 tracking-tight text-foreground"
                style={{ "--pl-delay": "0.35s" } as React.CSSProperties}
              >
                Turn Voice into{" "}
                <span className="text-primary">Knowledge</span>
              </h1>

              <p
                className="pl-fade-up text-lg md:text-xl text-muted mb-10 max-w-2xl mx-auto leading-relaxed"
                style={{ "--pl-delay": "0.5s" } as React.CSSProperties}
              >
                ボイスメモをAIで瞬時にテキスト化。
                OSSのリアルタイム文字起こしアプリです。
              </p>

              <div
                className="pl-fade-up flex flex-col sm:flex-row items-center justify-center gap-4 mb-16"
                style={{ "--pl-delay": "0.65s" } as React.CSSProperties}
              >
                <a href="https://github.com/plenoai/pleno-live/releases">
                  <Button size="lg">Download App</Button>
                </a>
                <Link href="/record">
                  <Button size="lg" variant="outline">
                    ブラウザで使う
                  </Button>
                </Link>
              </div>

              <div
                className="pl-fade-up max-w-2xl mx-auto"
                style={{ "--pl-delay": "0.8s" } as React.CSSProperties}
              >
                <div className="bg-surface border border-border rounded-2xl p-8 shadow-sm">
                  <div className="flex flex-col items-center gap-4">
                    <button
                      className={cn(
                        "w-16 h-16 rounded-full flex items-center justify-center transition-all duration-300",
                        isRecording
                          ? "bg-primary shadow-lg shadow-primary/30"
                          : "bg-background border-2 border-primary hover:bg-primary/5"
                      )}
                      onClick={() => setIsRecording(!isRecording)}
                    >
                      {isRecording ? (
                        <div className="pl-spin w-6 h-6 rounded-sm bg-white" />
                      ) : (
                        <WebIcon name="mic" size={28} className="text-primary" />
                      )}
                    </button>

                    <VoiceVisualizer isActive={isRecording} />

                    <p className="text-sm text-muted font-medium">
                      {isRecording
                        ? "Recording..."
                        : "タップして録音開始"}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section id="features" className="container mx-auto px-6 py-16 md:py-24">
          <div className="max-w-5xl mx-auto">
            <div className="pl-fade-up text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
                Features
              </h2>
              <p className="text-lg text-muted">
                よりスマートに仕事をこなすための機能を搭載
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
              {features.map((feature, index) => (
                <div
                  key={index}
                  className="pl-fade-up bg-surface border border-border rounded-2xl p-8 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300"
                  style={{ "--pl-delay": (0.1 + index * 0.1) + "s" } as React.CSSProperties}
                >
                  <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                    <WebIcon name={feature.icon} size={24} className="text-primary" />
                  </div>
                  <h3 className="text-xl font-semibold text-foreground mb-2">
                    {feature.title}
                  </h3>
                  <p className="text-muted leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="container mx-auto px-6 py-16 md:py-24">
          <div className="pl-fade-up max-w-3xl mx-auto text-center">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              Get Started
            </h2>
            <p className="text-lg text-muted mb-8">
              アプリをダウンロードして、声をナレッジに変換しましょう
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <a href="https://github.com/plenoai/pleno-live/releases">
                <Button size="lg">Download Now</Button>
              </a>
              <Link href="/record">
                <Button size="lg" variant="outline">
                  ブラウザで使う
                </Button>
              </Link>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="container mx-auto px-6 py-12 border-t border-border">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-primary flex items-center justify-center">
                <WebIcon name="mic" size={16} className="text-white" />
              </div>
              <span className="text-sm font-medium text-foreground">
                Pleno Live
              </span>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-muted">
              <a
                href="https://github.com/plenoai/pleno-live"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-foreground transition-colors"
              >
                GitHub
              </a>
              <a
                href="https://natbee.pages.dev/"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-foreground transition-colors"
              >
                運営会社
              </a>
              <a
                href="/pleno-live/privacy"
                className="hover:text-foreground transition-colors"
              >
                プライバシーポリシー
              </a>
              <a
                href="/pleno-live/terms"
                className="hover:text-foreground transition-colors"
              >
                利用規約
              </a>
              <span>© 2026 Pleno Live</span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}

export default VoiceMemoLanding;
