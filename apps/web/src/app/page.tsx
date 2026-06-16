import Link from "next/link";
import { ja } from "@/i18n/ja";

export default function HomePage() {
  return (
    <main>
      <h1>{ja.common.appName}</h1>
      <p className="subheading">
        Datadog のイネーブルメント研修を、ハンズオン演習に変える MVP です。
      </p>
      <div className="panel">
        <p>
          <Link href="/admin">{ja.admin.pageTitle}</Link> からセッションを作成してください。
        </p>
      </div>
    </main>
  );
}
