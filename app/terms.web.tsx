"use client";

import { motion } from "framer-motion";
import {
  Mic,
  ArrowLeft,
  FileText,
  AlertCircle,
  CheckCircle,
  XCircle,
  Github,
} from "lucide-react";

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-medium text-foreground">{title}</h2>
      <div className="text-muted space-y-3">{children}</div>
    </section>
  );
}

function HighlightBox({
  type,
  children,
}: {
  type: "info" | "warning" | "success";
  children: React.ReactNode;
}) {
  const styles = {
    info: {
      bg: "bg-blue-100 dark:bg-blue-900/30",
      border: "border-blue-200 dark:border-blue-800",
      text: "text-blue-800 dark:text-blue-200",
      icon: AlertCircle,
    },
    warning: {
      bg: "bg-amber-100 dark:bg-amber-900/30",
      border: "border-amber-200 dark:border-amber-800",
      text: "text-amber-800 dark:text-amber-200",
      icon: AlertCircle,
    },
    success: {
      bg: "bg-green-100 dark:bg-green-900/30",
      border: "border-green-200 dark:border-green-800",
      text: "text-green-800 dark:text-green-200",
      icon: CheckCircle,
    },
  };

  const style = styles[type];
  const Icon = style.icon;

  return (
    <div
      className={`rounded-lg ${style.bg} border ${style.border} p-4 flex items-start gap-3`}
    >
      <Icon className={`h-5 w-5 ${style.text} flex-shrink-0 mt-0.5`} />
      <div className={`${style.text} text-sm`}>{children}</div>
    </div>
  );
}

function ListItem({
  allowed,
  children,
}: {
  allowed: boolean;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-start gap-3">
      {allowed ? (
        <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
      ) : (
        <XCircle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
      )}
      <span>{children}</span>
    </li>
  );
}

export default function TermsPage() {
  const lastUpdated = "2025年1月11日";

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="border-b border-border">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <a href="/pleno-live/" className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-primary flex items-center justify-center">
                <Mic className="w-4 h-4 text-white" />
              </div>
              <span className="font-medium text-foreground">
                Pleno Live
              </span>
            </a>
            <div className="flex items-center gap-4">
              <a
                href="https://github.com/plenoai/pleno-live"
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 rounded-lg hover:bg-surface transition-colors"
                aria-label="GitHub"
              >
                <Github className="h-5 w-5 text-muted hover:text-foreground" />
              </a>
              <a
                href="/pleno-live/"
                className="flex items-center gap-2 text-sm text-muted hover:text-foreground transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>ホームに戻る</span>
              </a>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 max-w-4xl mx-auto px-6 py-12 w-full">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="space-y-12"
        >
          {/* Title */}
          <div className="space-y-4">
            <h1 className="text-3xl font-medium text-foreground">利用規約</h1>
            <p className="text-muted">最終更新日: {lastUpdated}</p>
          </div>

          {/* Introduction */}
          <div className="rounded-xl border border-border bg-surface p-6">
            <div className="flex items-start gap-4">
              <FileText className="h-6 w-6 text-foreground flex-shrink-0" />
              <p className="text-muted">
                本利用規約（以下「本規約」）は、Pleno
                Transcribe（以下「本アプリ」）の利用条件を定めるものです。
                本アプリをインストールまたは使用することにより、ユーザーは本規約に同意したものとみなされます。
              </p>
            </div>
          </div>

          {/* Sections */}
          <Section title="第1条（定義）">
            <p>本規約において使用する用語の定義は以下のとおりです：</p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>
                <strong>「本アプリ」:</strong> Pleno
                Transcribeモバイルアプリケーションおよびその関連サービス
              </li>
              <li>
                <strong>「ユーザー」:</strong>{" "}
                本アプリをインストールまたは使用する個人または法人
              </li>
              <li>
                <strong>「サービス」:</strong>{" "}
                本アプリが提供する音声録音・文字起こし機能
              </li>
            </ul>
          </Section>

          <Section title="第2条（サービスの内容）">
            <p>本アプリは、以下のサービスを提供します：</p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>音声の録音および再生</li>
              <li>リアルタイム音声認識（Speech-to-Text）</li>
              <li>話者分離（Speaker Diarization）</li>
              <li>AIによるメモの要約・整理</li>
              <li>メモの保存・管理・検索</li>
            </ul>
            <HighlightBox type="info">
              本アプリはオープンソースソフトウェア（OSS）として提供されています。
            </HighlightBox>
          </Section>

          <Section title="第3条（利用条件）">
            <p>
              ユーザーは、以下の条件に同意の上、本アプリを利用するものとします：
            </p>
            <div className="space-y-4 mt-4">
              <div>
                <h4 className="font-medium text-foreground mb-2">
                  許可される利用
                </h4>
                <ul className="space-y-2">
                  <ListItem allowed={true}>
                    個人的なボイスメモ・議事録作成目的での利用
                  </ListItem>
                  <ListItem allowed={true}>
                    業務における音声メモ・文字起こし目的での利用
                  </ListItem>
                  <ListItem allowed={true}>
                    学習・研究目的での利用
                  </ListItem>
                </ul>
              </div>
              <div>
                <h4 className="font-medium text-foreground mb-2">
                  禁止される利用
                </h4>
                <ul className="space-y-2">
                  <ListItem allowed={false}>
                    他者の同意なく会話を録音する目的での利用
                  </ListItem>
                  <ListItem allowed={false}>
                    違法行為の証拠収集を目的とした利用
                  </ListItem>
                  <ListItem allowed={false}>
                    本アプリを改変し、マルウェアとして配布する行為
                  </ListItem>
                </ul>
              </div>
            </div>
          </Section>

          <Section title="第4条（免責事項）">
            <HighlightBox type="warning">
              <strong>重要:</strong> 以下の免責事項をご確認ください。
            </HighlightBox>
            <div className="mt-4 space-y-3">
              <p>
                1. 本アプリは「現状有姿」で提供されます。
                開発者は、本アプリの完全性、正確性、信頼性について保証しません。
              </p>
              <p>
                2.
                本アプリの使用によって生じたいかなる損害についても、開発者は責任を負いません。
              </p>
              <p>
                3.
                音声認識の精度は100%ではありません。重要な内容については、必ず録音データを確認してください。
              </p>
              <p>
                4.
                本アプリの使用に関する判断や行動は、ユーザー自身の責任において行ってください。
              </p>
            </div>
          </Section>

          <Section title="第5条（ライセンス）">
            <p>
              本アプリは、GNU Affero General Public License
              v3.0（AGPL-3.0）の下で提供されています。
              ユーザーは、AGPL-3.0の条件に従い、本アプリのソースコードの閲覧、改変、再配布を行うことができます。
            </p>
            <HighlightBox type="info">
              AGPL-3.0ライセンスの全文は、GitHubリポジトリのLICENSEファイルをご確認ください。
            </HighlightBox>
          </Section>

          <Section title="第6条（外部サービス）">
            <p>
              本アプリは、以下の外部サービスを利用する場合があります。
              各サービスの利用規約・プライバシーポリシーについては、それぞれのサービス提供元をご確認ください：
            </p>
            <ul className="list-disc list-inside space-y-2 ml-4 mt-4">
              <li>
                <strong>ElevenLabs:</strong> 音声認識サービス
              </li>
              <li>
                <strong>Google Gemini:</strong> AI要約サービス
              </li>
            </ul>
          </Section>

          <Section title="第7条（サービスの変更・終了）">
            <p>
              開発者は、事前の通知なく、本アプリの内容を変更、または提供を終了することができます。
              サービスの変更・終了によってユーザーに生じた損害について、開発者は責任を負いません。
            </p>
          </Section>

          <Section title="第8条（プライバシー）">
            <p>
              ユーザーの個人情報および音声データの取り扱いについては、別途定める
              <a
                href="/pleno-live/privacy"
                className="text-primary hover:underline mx-1"
              >
                プライバシーポリシー
              </a>
              に従います。
            </p>
            <HighlightBox type="success">
              本アプリはプライバシーファーストで設計されており、
              録音データはユーザーの端末内に保存されます。
            </HighlightBox>
          </Section>

          <Section title="第9条（規約の変更）">
            <p>
              開発者は、必要に応じて本規約を変更することができます。
              変更後の規約は、本アプリ内または関連ウェブサイトで公開された時点で効力を生じます。
            </p>
          </Section>

          <Section title="第10条（準拠法・管轄）">
            <p>
              本規約は、日本法に準拠し解釈されます。
              本規約に関する紛争については、東京地方裁判所を第一審の専属的合意管轄裁判所とします。
            </p>
          </Section>

          <Section title="第11条（お問い合わせ）">
            <p>
              本規約に関するお問い合わせは、GitHubの
              <a
                href="https://github.com/plenoai/pleno-live/issues"
                className="text-primary hover:underline ml-1"
                target="_blank"
                rel="noopener noreferrer"
              >
                Issues
              </a>
              をご利用ください。
            </p>
          </Section>

          {/* Agreement Notice */}
          <div className="rounded-xl border border-border bg-surface p-6">
            <p className="text-muted text-center">
              本アプリをインストールまたは使用することにより、
              <br className="hidden md:block" />
              ユーザーは本利用規約および
              <a href="/pleno-live/privacy" className="text-primary hover:underline mx-1">
                プライバシーポリシー
              </a>
              に同意したものとみなされます。
            </p>
          </div>
        </motion.div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-8">
        <div className="max-w-4xl mx-auto px-6 text-center text-sm text-muted">
          © 2026 Pleno Live
        </div>
      </footer>
    </div>
  );
}
