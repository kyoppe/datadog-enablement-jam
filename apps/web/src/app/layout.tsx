import type { Metadata } from "next";
import "./globals.css";
import { ja } from "@/i18n/ja";
import DatadogInit from "./DatadogInit";

export const metadata: Metadata = {
  title: ja.common.appName,
  description: "Datadog Enablement Jam - gamified practice for Datadog enablement",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>
        <DatadogInit />
        <header className="app-header">
          <div className="app-header-inner">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/datadog-logo.png" alt="Datadog" className="app-logo" />
            <span className="app-title">{ja.common.appName}</span>
          </div>
        </header>
        <div className="container">{children}</div>
      </body>
    </html>
  );
}
