# web-chat-widget 仕様書

> Version: draft-1 / 最終更新: 2026-04-23

本ドキュメントは、Web ページに埋め込み可能な AI チャット UI パッケージ `web-chat-widget` の設計仕様書である。実装着手の前段に合意しておくべき事項を一式まとめる。

---

## 1. 概要 / スコープ

### 1.1 プロダクト

`web-chat-widget` は、任意の Web ページにフローティング型の AI チャット UI を導入するための配布可能パッケージ。

- ページ右下（既定）に常駐するフローティングアクションボタン (FAB) をクリックするとチャットパネルが開く
- ユーザーが入力した文字列をバックエンド API に送信し、アシスタント応答をストリーミング表示する
- バックエンド API の形式は差し替え可能（アダプタ設計）

### 1.2 実装方針

- **ランタイム依存ゼロ**。Web 標準（Custom Elements, Shadow DOM, `fetch`, `ReadableStream`, `EventTarget`, `AbortController` など）のみで構成する
- v1 は**バニラ JS/TS 版**のみリリース。v2 以降で React / Vue などのラッパーを追加
- ビルドツールは Vite の library mode、テストは Vitest + happy-dom

### 1.3 想定利用シーン

- 自社 Web アプリに npm 経由で組み込むケース
- 既存サイト・CMS に `<script>` タグ 1 行で埋め込むケース

両者を同一パッケージ・同一コードベースでサポートする。

---

## 2. ゴール / 非ゴール

### 2.1 ゴール (v1)

- Web 標準のみで動作し、外部ページの CSS に干渉されずレンダリングされる
- 宣言的 (`<chat-widget>` カスタム要素) と命令的 (`new ChatWidget()`) の両 API を提供する
- OpenAI 互換 SSE を既定のレスポンス形式とし、かつユーザーが独自バックエンドに差し替えられる
- テーマ (色、角丸、フォント、位置) を CSS Custom Properties から上書きできる
- 基本的なアクセシビリティ (キーボード操作、`aria-live`, 十分なコントラスト) を満たす
- 日本語 / 英語の UI 文言を持ち、任意の文言に上書きできる

### 2.2 非ゴール (v1)

以下は将来対応。v1 には含めない。

- 会話履歴の永続化（`localStorage` / `IndexedDB`）
- 複数会話（スレッド）管理
- 添付ファイル、画像、音声入出力
- Tool calling / Function calling の可視化
- コードブロックのシンタックスハイライト（依存ゼロ方針と緊張する）
- `postMessage` を使ったクロスフレーム連携
- IE 系・旧 Edge のサポート（Chromium, Firefox, Safari の現行 2 世代）

---

## 3. 配布形態とエントリポイント

### 3.1 配布物

| 配布物 | 用途 | フォーマット |
| --- | --- | --- |
| `dist/index.js` | npm import 用 | ESM |
| `dist/index.d.ts` | 型定義 | TypeScript declaration |
| `dist/element.js` | `<chat-widget>` 自動登録（副作用あり） | ESM |
| `dist/adapters.js` | アダプタ群 (OpenAI SSE / JSON) | ESM |
| `dist/chat-widget.iife.js` | `<script>` タグ埋め込み用 | IIFE (`window.ChatWidget`) |

- CSS は別ファイルとしては配布しない。JS バンドルに文字列として埋め込み、Shadow DOM 内で `<style>` ノードとして注入する
- UMD は提供しない（ESM + IIFE で要件を満たす）
- ピア依存・ランタイム依存ともになし

### 3.2 `package.json` exports

```jsonc
{
  "name": "web-chat-widget",      // 公開時に確定（未定）
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "files": ["dist"],
  "exports": {
    ".":          { "import": "./dist/index.js",    "types": "./dist/index.d.ts" },
    "./element":  { "import": "./dist/element.js",  "types": "./dist/element.d.ts" },
    "./adapters": { "import": "./dist/adapters.js", "types": "./dist/adapters.d.ts" },
    "./react":    { "import": "./dist/react.js",    "types": "./dist/react.d.ts" }  // v2 予約
  }
}
```

- `"."` は `ChatWidget` クラスと各 API 型を export する（副作用なし = import しただけでは何も起きない）
- `"./element"` は import するだけで `customElements.define('chat-widget', …)` を実行する
- `"./adapters"` は `createOpenAISseAdapter` / `createJsonAdapter` を export
- `"./react"` は v2 以降のためのプレースホルダ

### 3.3 CDN 埋め込みの使用例

```html
<script src="https://cdn.example.com/web-chat-widget.iife.js"></script>
<script>
  ChatWidget.mount({
    adapter: ChatWidget.adapters.createOpenAISseAdapter({
      url: "/api/chat"
    })
  });
</script>
```

IIFE ビルドでは `window.ChatWidget` にクラス本体と `ChatWidget.adapters` が同梱される。さらに副作用で `<chat-widget>` カスタム要素も登録される（IIFE では "./element" 相当を内包）。

---

## 4. 公開 API

### 4.1 宣言的 API（カスタム要素）

`<chat-widget>` は Shadow DOM 付きの Custom Element。

#### 4.1.1 属性

| 属性 | 型 | 既定値 | 説明 |
| --- | --- | --- | --- |
| `open` | boolean (presence) | なし | 属性が存在すると開いた状態で初期化 |
| `position` | `"bottom-right" \| "bottom-left" \| "top-right" \| "top-left"` | `"bottom-right"` | FAB とパネルの配置 |
| `locale` | `"ja" \| "en"` | `navigator.language` 由来 | UI 言語 |
| `theme` | `"light" \| "dark" \| "auto"` | `"auto"` | テーマ |
| `api-url` | string | なし | 既定アダプタを使う場合のエンドポイント |
| `api-mode` | `"openai-sse" \| "json"` | `"openai-sse"` | 既定アダプタの種別 |

- `api-url` / `api-mode` を指定すると、内部で `createOpenAISseAdapter` または `createJsonAdapter` を自動構築する
- より高度な制御（ヘッダー付与・完全な差し替え）は JS API 経由で行う
- `api-url` / `api-mode` は **mount 後の属性変更を反映しない**。再設定したい場合は JS API で adapter を差し替えるか、要素を一度 detach して作り直す。他の属性 (`open` / `position` / `locale` / `theme`) は実行時変更に追随する

#### 4.1.2 使用例

```html
<chat-widget api-url="/api/chat" theme="auto" locale="ja" position="bottom-right"></chat-widget>
```

### 4.2 命令的 API

#### 4.2.1 コンストラクタ

```ts
import { ChatWidget } from "web-chat-widget";
import { createOpenAISseAdapter } from "web-chat-widget/adapters";

const widget = new ChatWidget({
  target: document.body,                // 省略時 document.body
  adapter: createOpenAISseAdapter({ url: "/api/chat" }),
  position: "bottom-right",
  theme: "auto",
  locale: "ja",
  initialMessages: [],                  // 初期表示するメッセージ（省略可）
  messages: { placeholder: "質問をどうぞ" }  // UI 文言の部分上書き
});
```

#### 4.2.2 ショートハンド

```ts
ChatWidget.mount({ adapter, ... });  // target 省略で document.body に append
```

`mount` は `new ChatWidget(options)` 相当のインスタンスを返す。複数インスタンス化を許容する（ただし z-index が衝突するので同時に複数 FAB を置く運用は非推奨）。

#### 4.2.3 メソッド

| メソッド | 説明 |
| --- | --- |
| `open(): void` | パネルを開く |
| `close(): void` | パネルを閉じる |
| `toggle(): void` | 開閉を反転 |
| `sendMessage(text: string): Promise<void>` | プログラム的にユーザー発言を送信 |
| `clear(): void` | 会話履歴をクリア（UI と内部状態ともに） |
| `destroy(): void` | DOM とリスナーをすべて破棄 |
| `getMessages(): readonly Message[]` | 現在の履歴のスナップショットを取得 |

### 4.3 イベント

`ChatWidget` は `EventTarget` を継承する。フレームワーク中立、かつ将来の React ラッパーでも素直に `useEffect` でリスナー登録できる形式。

| イベント | `detail` の型 | 説明 |
| --- | --- | --- |
| `ready` | `void` | 初期化完了（DOM 挿入とスタイル適用が済んだ時点） |
| `open` | `void` | パネルが開いた |
| `close` | `void` | パネルが閉じた |
| `message` | `{ role: "user" \| "assistant"; content: string }` | 新しいメッセージが確定（ストリーミング完了時点で 1 回） |
| `error` | `{ error: Error }` | アダプタからエラーが返った / 通信失敗 |

使用例:

```ts
widget.addEventListener("message", (e) => {
  console.log(e.detail.role, e.detail.content);
});
```

### 4.4 型定義

```ts
export interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;        // 内部表現は Markdown ソース文字列
  createdAt: number;      // epoch ms
  status?: "streaming" | "done" | "error";
}

export interface ChatWidgetOptions {
  target?: HTMLElement;
  adapter: ChatAdapter;
  position?: "bottom-right" | "bottom-left" | "top-right" | "top-left";
  theme?: "light" | "dark" | "auto";
  locale?: "ja" | "en";
  initialMessages?: Message[];
  messages?: Partial<LabelDictionary>;  // §10.2
}
```

---

## 5. フローティング UI の挙動仕様

### 5.1 状態

- **閉状態**: ページ隅に FAB（56px の円形ボタン）だけが表示される
- **開状態**: FAB の近傍にパネル (幅 380px × 高さ min(600px, calc(100vh - 120px))) が展開される。FAB はパネルのヘッダーに吸収されるか、パネルの下に残る（`position` 別に見た目微調整）

### 5.2 初期状態

- `open` 属性 / オプション未指定時は**閉**で初期化
- `open` 指定時は開いて初期化

### 5.3 位置

- `position` オプションで 4 隅から選択
- 画面端からのオフセット (既定 20px) は CSS 変数 `--cw-offset` で調整可

### 5.4 レスポンシブ

- ブレークポイント: ビューポート幅 < 640px
- モバイル時はパネルをフルスクリーン表示（`width: 100vw; height: 100dvh`）
- **フルスクリーン時も非モーダル方針は維持**：背景のタブ移動は塞がないが、視覚的には背面は隠れる

### 5.5 アニメーション

- 開閉は `transform: translateY()` + `opacity` の組合せ、`transition: 160ms ease-out`
- `@media (prefers-reduced-motion: reduce)` ではトランジションを無効化し、即座に切り替える

### 5.6 z-index

- 既定 `z-index: 2147483000`
  - 最大値 (2147483647) は既存サイトとの衝突を避けるため使わない
- CSS 変数 `--cw-z-index` で上書き可能

### 5.7 スクロール挙動

- メッセージリストは内部でのみスクロールする
- 新規メッセージ（アシスタントのストリーミング更新含む）到着時、**スクロール位置が最下端から 48px 以内にある場合のみ**自動追従する
- ユーザーが上方向へスクロールして履歴を読んでいる場合は追従しない

---

## 6. メッセージモデル

### 6.1 role

- `user`: 利用者入力
- `assistant`: バックエンド応答
- `system`: システム注入（`initialMessages` などで使用可能、UI では淡色の注記として描画）

### 6.2 最小 Markdown の対応範囲

依存ゼロ方針に沿って自前パーサを実装する。対応する記法は以下に**限定**する。

| 記法 | 対応 |
| --- | --- |
| 段落（空行区切り） | ○ |
| 改行（行末 2 スペース or `\n`） | ○ |
| `**bold**` | ○ |
| `*italic*` / `_italic_` | ○ |
| `` `inline code` `` | ○ |
| トリプルバッククォートのコードブロック | ○ (言語指定は無視、`<pre><code>` でそのまま描画) |
| `[text](url)` | ○ (§6.4 の制約付き) |
| `- ` / `* ` による箇条書きリスト | ○ |
| `1.` による番号付きリスト | ○ |
| 見出し `#` | ×（チャット UI に過剰） |
| 表 | × |
| 画像 `![](...)` | × |
| 生 HTML | × |
| シンタックスハイライト | × |

- Markdown パイプラインは **`assistant` および `system` ロールのメッセージにのみ適用**する
- `user` ロールはプレーンテキストとして描画する（`textContent` のみ）。利用者入力を Markdown 解釈することで生じるエスケープ不一致や UX 上の驚きを避けるため

### 6.3 サニタイズ方針

- **`innerHTML` に生の文字列は渡さない**。パーサはトークン列を生成し、`document.createElement` + `textContent` で DOM を組み立てる
- 上記対応外の記法はすべてエスケープ済みテキストとして描画
- アシスタント応答も同様にサニタイズする（LLM が不正リンクや HTML を吐く可能性を想定）

### 6.4 リンクの制約

- `href` は `^https?://` にマッチするもののみ許可。それ以外はプレーンテキストに降格
- `target="_blank"`, `rel="noopener noreferrer"` を強制

### 6.5 ストリーミングと in-place 更新

- アダプタから `text-delta` チャンクが届くたび、直近の assistant メッセージの `content` に追記し、Markdown レンダリングを再実行して差し替える
- `done` チャンクを受けたらそのメッセージの `status` を `"done"` に遷移
- ストリーミング中のメッセージは `status: "streaming"` で、末尾にキャレット風の点滅を表示する

### 6.6 タイピングインジケータ

- ユーザー送信から最初の `text-delta` が届くまでの間、空の assistant バブル内に「●●●」の点滅アニメーションを表示
- 最初のチャンク到着時に点滅を消してテキストに切り替え

### 6.7 エラーとリトライ

- アダプタの `error` チャンクまたは例外発生時、該当 assistant メッセージの行内に赤いエラー表示と「再試行」ボタンを表示する
- 再試行は直前の user メッセージをもとに同じ adapter でもう一度 send を呼ぶ
- ネットワークエラーと HTTP エラーを区別せず、文言は §10 で定義

---

## 7. スタイルカスタマイズ

### 7.1 方針

- CSS Custom Properties（CSS 変数）を主軸とする
- Shadow DOM 内でも CSS 変数は外部から継承されるため、親ページ側で `--cw-color-primary: #f00` を書けばそのまま反映される
- より詳細な DOM 単位のスタイル上書きは `::part()` 経由で行う

### 7.2 公開する CSS Custom Properties

| プロパティ | 既定値 (light) | 既定値 (dark) | 用途 |
| --- | --- | --- | --- |
| `--cw-color-primary` | `#2563eb` | `#60a5fa` | FAB・送信ボタン等のアクセント |
| `--cw-color-on-primary` | `#ffffff` | `#0b1220` | primary 上の前景 |
| `--cw-color-bg` | `#ffffff` | `#0f172a` | パネル背景 |
| `--cw-color-surface` | `#f1f5f9` | `#1e293b` | メッセージバブル背景 (assistant) |
| `--cw-color-user-bubble` | `#2563eb` | `#3b82f6` | ユーザー発言バブル |
| `--cw-color-user-text` | `#ffffff` | `#ffffff` | ユーザーバブルの文字色 |
| `--cw-color-text` | `#0f172a` | `#e2e8f0` | 本文 |
| `--cw-color-muted` | `#64748b` | `#94a3b8` | 補足テキスト・system role |
| `--cw-color-border` | `#e2e8f0` | `#334155` | 区切り線 |
| `--cw-color-error` | `#dc2626` | `#f87171` | エラー表示 |
| `--cw-radius` | `16px` | 同左 | パネル・バブルの角丸 |
| `--cw-radius-sm` | `8px` | 同左 | 入力欄などの小角丸 |
| `--cw-font-family` | system-ui スタック | 同左 | フォント |
| `--cw-font-size` | `14px` | 同左 | 本文サイズ |
| `--cw-panel-width` | `380px` | 同左 | パネル幅（デスクトップ） |
| `--cw-panel-height` | `600px` | 同左 | パネル高さ（上限） |
| `--cw-fab-size` | `56px` | 同左 | FAB サイズ |
| `--cw-offset` | `20px` | 同左 | 画面端からのオフセット |
| `--cw-z-index` | `2147483000` | 同左 | 重ね順 |
| `--cw-shadow` | `0 10px 30px rgba(0,0,0,.15)` | `0 10px 30px rgba(0,0,0,.6)` | 影 |

- **権威の分担**:
  - **SPEC (この節)** = 公開する CSS 変数名・用途・既定値の「一覧」を定義する（何が存在するか）
  - **`src/core/theme.ts`（仮称）の `THEME_TOKENS`** = その変数の実値を保持する実装定数（いくつか）
- 変数の追加・削除・リネームは SPEC を先に更新し、その後 `THEME_TOKENS` を合わせる。逆順（実装先行）は禁止
- 既定値のリファイン（例: primary 色の微調整）は `THEME_TOKENS` 側の変更で完結してよいが、SPEC の既定値列も同値に揃え直す

### 7.3 `::part()` で露出する要素

| part 名 | 対応要素 |
| --- | --- |
| `fab` | 閉状態のボタン |
| `panel` | 展開パネル全体 |
| `header` | パネル上部 |
| `close-button` | パネル閉じボタン |
| `log` | メッセージ一覧のスクロールコンテナ |
| `message` | すべてのメッセージ |
| `message-user` / `message-assistant` / `message-system` | role 別メッセージ |
| `message-error` | エラー表示 |
| `input-area` | 入力欄周辺 |
| `input` | `<textarea>` |
| `send-button` | 送信ボタン |

### 7.4 プリセットテーマ

- `theme: "light" | "dark" | "auto"`
- `"auto"` は `prefers-color-scheme` に追従し、変化時にリアルタイムで切り替える
- Shadow DOM 内で `[data-theme="light"]` / `[data-theme="dark"]` のどちらかが常にセットされる

---

## 8. API アダプタ仕様

### 8.1 インターフェース

```ts
export interface ChatAdapter {
  send(
    messages: readonly Message[],
    signal: AbortSignal
  ): AsyncIterable<AdapterChunk>;
}

export type AdapterChunk =
  | { type: "text-delta"; delta: string }
  | { type: "done" }
  | { type: "error"; error: Error };
```

- `AsyncIterable` を返す形式に統一することで、ストリーミング / 非ストリーミングを同じインターフェースで扱える
- `signal` は widget 側から中断（ユーザーが閉じた、destroy 等）するための `AbortSignal`
- 実装側は `signal.aborted` を見て `fetch` をキャンセルし、イテレータを終了する義務がある

### 8.2 同梱アダプタ

#### 8.2.1 `createOpenAISseAdapter`

```ts
createOpenAISseAdapter(options: {
  url: string;
  headers?: Record<string, string>;
  model?: string;          // bodyに含めて送信。既定は指定なし
  fetchImpl?: typeof fetch;  // テスト注入用
}): ChatAdapter
```

- HTTP POST `url`、`Content-Type: application/json`
- body: `{ messages: [{ role, content }], stream: true, model? }`
- レスポンスは `text/event-stream`。行ごとに `data: {...}` を parse し、`choices[0].delta.content` を `text-delta` として yield する
- `data: [DONE]` で `done` を yield し、ループを抜ける
- fetch 失敗 / 400 以上のステータス / JSON parse 失敗 / `choices` 欠落は `error` を yield

#### 8.2.2 `createJsonAdapter`

```ts
createJsonAdapter(options: {
  url: string;
  headers?: Record<string, string>;
  extract?: (json: unknown) => string;  // 既定は (json) => json.reply
  fetchImpl?: typeof fetch;
}): ChatAdapter
```

- 単発 POST、JSON レスポンスから文字列を抜き出し、1 回の `text-delta` として yield し、`done` で終了
- ストリーミングしない、素朴なバックエンドを書く場合の選択肢

### 8.3 認証

- **API キーをフロントエンドから直接 LLM プロバイダに送る用途は非推奨**。README にも明記する
- 既定は「ユーザー自身のバックエンドを経由する」ことを前提とし、`headers` オプションで Cookie / Bearer を任意に追加可能
- ブラウザ埋め込み時の CORS・CSRF は利用者側の責任範囲

### 8.4 カスタムアダプタ

上記インターフェースを実装すれば任意のバックエンド・スキーマに対応できる。例（WebSocket アダプタ、内部ストア直結のモックなど）はサンプルとして `docs/examples/` に追加する予定。

---

## 9. アクセシビリティ

### 9.1 非モーダル方針

v1 は**非モーダル**。パネルを開いても背景ページのインタラクションは維持される。

- パネル要素に `role="complementary"` と `aria-label="AI chat"`（ローカライズ可能）を付与
- 背景への Tab 移動は塞がない
- `aria-modal` は付与しない
- フォーカストラップなし

### 9.2 メッセージリスト

- コンテナに `role="log"` と `aria-live="polite"` を付与
- ストリーミング中の部分更新はスクリーンリーダーが騒がしくなるため、**「メッセージ確定時（`done` 到達時）に一度だけ aria-live を発火**する方針で実装する
- 実装上は、ストリーミング中は `aria-live="off"` の hidden コンテナで描画し、確定時に `aria-live="polite"` コンテナへテキストをコピーする

### 9.3 キーボード操作

| キー | 挙動 |
| --- | --- |
| `Enter` | 送信（入力欄フォーカス時） |
| `Shift + Enter` | 改行 |
| `Esc` | パネルを閉じる（入力欄フォーカス時） |
| `Tab` | パネル内要素を順に辿り、最後の要素の次で背景ページへ抜ける |

### 9.4 コントラスト

- 既定のライト / ダーク両テーマは WCAG AA (4.5:1) を満たすよう調整する
- ユーザーが CSS 変数を上書きした場合のコントラスト担保は利用者責任

---

## 10. 国際化

### 10.1 ロケール

- `locale: "ja" | "en"`
- 既定は `navigator.language` から `ja` / `en` を判定（それ以外は `en` フォールバック）
- 明示指定があれば優先

### 10.2 文言辞書

```ts
interface LabelDictionary {
  fabLabel: string;            // 例: "AI チャットを開く"
  panelTitle: string;          // 例: "AI アシスタント"
  closeButton: string;         // 例: "閉じる"
  placeholder: string;         // 例: "メッセージを入力"
  sendButton: string;          // 例: "送信"
  errorGeneric: string;        // 例: "応答を取得できませんでした"
  errorRetry: string;          // 例: "再試行"
  emptyState: string;          // 例: "何でも聞いてください。"
  typingLabel: string;         // aria 用: "応答を生成中"
  user: string;                // "あなた"
  assistant: string;           // "アシスタント"
  system: string;              // "システム"
  clearHistory: string;        // "履歴をクリア"
  clearConfirm: string;        // "履歴を削除しますか？"
  poweredBy: string;           // 未使用スロット（将来のフッター用）
}
```

- 合計 15 キー前後
- `messages` オプションで一部だけ上書き可能（指定しなかったキーはロケール既定値）

---

## 11. セキュリティ

### 11.1 XSS 対策

- Markdown レンダリングは allowlist 方式。対応外の記法は**必ずエスケープ済みテキスト**として描画
- `innerHTML` / `insertAdjacentHTML` は使わない。`document.createElement` + `textContent` + `appendChild` のみ
- アシスタント応答も同様に扱う（プロンプトインジェクションで生 HTML を吐いてくる前提）

### 11.2 リンク

- `href` は `^https?://` のみ許可
- `target="_blank"`, `rel="noopener noreferrer"` を強制
- 許可外スキーム (`javascript:`, `data:` 等) は自動的にプレーンテキスト降格

### 11.3 CSP

- Shadow DOM 内の `<style>` ノードは `style-src 'unsafe-inline'` を要求する
- 厳格 CSP 下で `'unsafe-inline'` を許可できないユースケースは v1 では非対応。README で明記する
- `script-src` には影響しない（JS は外部ファイルからロードされる）

### 11.4 Trusted Types

- 実装側で直接 `innerHTML` を使わないので Trusted Types 導入済みサイトでも動作する想定
- テストで Trusted Types 有効環境を再現することは v1 のスコープ外。将来課題

### 11.5 依存リスク

- 依存ゼロ方針のため、サプライチェーン攻撃面を最小化する
- `devDependencies` は Biome / TypeScript / Vite / Vitest のみ

---

## 12. ビルド / パッケージング

### 12.1 Vite 設定

- `vite.config.ts` を新設
- `build.lib` で library mode
  - `entry`: `{ index: "src/index.ts", element: "src/element.ts", adapters: "src/adapters/index.ts" }`
  - `formats`: `["es"]`（IIFE は別ビルド）
  - `fileName`: `[name]`
- IIFE ビルドは `vite build --mode iife` として別エントリ (`src/iife.ts`) で再実行する構成
  - `src/iife.ts` 内で `element` と `adapters` を import し、`window.ChatWidget` にクラスを割り当てる
  - `formats: ["iife"]`, `name: "ChatWidget"`

### 12.2 TypeScript 型定義

- 現行 `tsconfig.json` は `noEmit: true` のまま（Vite 開発用）
- 型定義生成は `tsconfig.build.json` を別立てし、`declaration: true` / `emitDeclarationOnly: true` / `outDir: dist` で `.d.ts` のみ出す
- `npm run build` が Vite ビルドと型生成の両方を走らせる

### 12.3 demo ページの扱い

- 現状の `index.html` / `src/main.ts` はライブラリ本体に残さない
- `index.html` と `src/main.ts` は **demo 用に書き換え**、`<chat-widget>` を実際に動かして確認するショーケースとする
- `vite dev` でこの demo が立ち上がる
- `npm run build` は demo を成果物に含めない（library mode を優先）
- 必要なら `demo/` ディレクトリに隔離する案もあり。v1 では `index.html` の書き換えで対応する

### 12.4 ディレクトリ構成（想定）

```
src/
  index.ts                 # public export: ChatWidget, 型
  element.ts               # customElements.define (副作用)
  iife.ts                  # IIFE エントリ (window.ChatWidget 組み立て)
  core/
    engine.ts              # ChatEngine: UI 非依存の状態と adapter 駆動
    messages.ts            # Message 型、ID 生成
    markdown.ts            # 最小 Markdown → DOM ノード
    sanitize.ts            # リンクスキーム検証等のユーティリティ
    theme.ts               # THEME_TOKENS, CSS 変数名の単一ソース
    i18n.ts                # ロケール辞書
    events.ts              # CustomEvent 生成ヘルパ
  ui/
    widget.ts              # ChatWidget クラス本体（Shadow DOM の組み立て）
    styles.ts              # インライン CSS 文字列
    fab.ts                 # FAB DOM 構築
    panel.ts               # パネル DOM 構築
    log.ts                 # メッセージリスト
    input.ts               # 入力欄
  adapters/
    index.ts               # re-export
    openai-sse.ts          # createOpenAISseAdapter
    json.ts                # createJsonAdapter
    sse-parse.ts           # SSE 行パーサ
tests/
  ...
docs/
  SPEC.md                  # 本書
  examples/                # カスタムアダプタ例（将来）
```

---

## 13. React 版への橋渡し設計

### 13.1 コアと UI の分離

- `src/core/engine.ts` の `ChatEngine` クラスは UI を持たず、以下のみを管理する
  - `messages: Message[]` の状態
  - adapter の呼び出しと `text-delta` の適用
  - `EventTarget` を継承したイベント発火
  - `sendMessage(text)`, `clear()`, `retry()` などの操作メソッド
- UI (`src/ui/widget.ts`) は `ChatEngine` のインスタンスを受け取り、DOM を描画するだけ
- UI が engine の状態変化を観察する経路は、`src/ui/observable-engine.ts` に置く軽量ラッパーに統一する。ラッパーは `sendMessage` / `retry` をラップし、送信中のみ `requestAnimationFrame` でバッチした `subscribe(cb): () => void` を公開する。これは v2 の React ラッパーが `useSyncExternalStore(subscribe, getSnapshot)` にそのまま接続できる形でもある
- `ChatEngine` 自体には `"update"` 相当の状態変化イベントを追加しない。公開イベントは SPEC §4.3 の 5 種 (`ready` / `open` / `close` / `message` / `error`) に限定する

### 13.2 React 版 (v2)

- `@web-chat-widget/react`（または `web-chat-widget/react`）として薄いラッパーを提供する
- 内部で `ChatEngine` を使い、`messages` を `useSyncExternalStore` で購読
- UI は React で書き直す。Shadow DOM は不使用（React アプリ側の CSS スコープに委ねる）
- アダプタ層はフレームワーク中立なので v1 のものをそのまま使用

### 13.3 不変条件

- `ChatEngine` の public API は v1 で確定させ、v2 以降は互換性を保つ
- 依存ゼロ方針は `ChatEngine` にも適用する

---

## 14. テスト戦略

### 14.0 TDD を開発プロセスの基盤とする

本プロジェクトは **test-first / red-green-refactor** を固定サイクルとする。

- 実装コード (`src/`) を書く前に、必ず失敗するテストを `tests/` 配下に書く
- 開発は `pnpm test:watch` を常時稼働させた状態で進め、red → green の切り替わりを目視する
- 実装コミットに対応するテストは先行する（同一コミットに同居でも可、ただしテストなしのコミットは不可）
- 例外: 型定義のみの変更、デモページの見た目調整、ドキュメント変更、設定ファイル
- TDD 補助のための subagent と slash command を `.claude/` に同梱する（CLAUDE.md §テスト駆動開発 参照）

### 14.1 単体テスト

Vitest + happy-dom で以下を対象とする。

| 対象 | テスト内容 |
| --- | --- |
| `core/engine.ts` | send → messages 更新、エラー時の遷移、`clear` / `destroy` |
| `core/markdown.ts` | 対応記法の変換、未対応記法のエスケープ、長大入力、XSS ペイロード |
| `core/sanitize.ts` | リンクスキーム判定（https/http 許可、javascript/data 拒否） |
| `adapters/openai-sse.ts` | SSE チャンクのパース、`[DONE]` 終了、エラー遷移、`AbortSignal` での中断 |
| `adapters/json.ts` | 単発レスポンス、`extract` カスタマイズ、エラー |
| `ui/widget.ts` | attach / detach、属性 → プロパティ反映、`::part` 付与、Shadow root 存在 |

### 14.2 ビジュアル / 手動

- 現 Vite SPA を demo ページ化し、実際の `<chat-widget>` を複数パターンで表示する
- 外部サイト埋め込みシミュレーション用に、demo ページ自体が大胆なグローバル CSS を持つセクションを 1 つ設ける（CSS 干渉耐性の確認）

### 14.3 E2E

- v1 では導入しない
- v2 以降で Playwright による実ブラウザ回帰を検討

---

## 15. バージョニング / リリース方針

- セマンティックバージョニングに従う
- 初版: `0.1.0` からスタートし、API が安定したと判断した時点で `1.0.0` に上げる
- API 破壊的変更はメジャーバージョンでのみ許容
- アダプタインターフェースは一度公開したら `1.x` の間は破壊しない

---

## 16. 将来課題 (Non-goals for v1)

- [ ] 会話履歴の永続化 (`localStorage` / `IndexedDB`)
- [ ] 複数会話（スレッド）管理・切り替え UI
- [ ] Tool calling / Function calling の可視化
- [ ] 添付ファイル（画像、PDF）
- [ ] 音声入出力
- [ ] コードブロックのシンタックスハイライト
- [ ] `postMessage` を使ったクロスフレーム連携
- [ ] React ラッパー（v2 で正式提供）
- [ ] Vue / Svelte / Solid ラッパー
- [ ] モーダルモード（フォーカストラップ付き）の任意化
- [ ] 厳格 CSP 下での外部 CSS ファイル版

---

## Appendix A: 用語

- **FAB**: Floating Action Button。閉じ状態で隅に常駐するボタン
- **パネル**: チャット本体（履歴 + 入力欄）を包むコンテナ
- **アダプタ**: バックエンド API とウィジェットの間のインターフェース実装

## Appendix B: 未決事項（仕様書更新の際に確定する）

- npm パッケージ名と公開先レジストリ（候補: `web-chat-widget` / `@cocone/web-chat-widget`）
- FAB に表示する既定アイコン（SVG インライン）
- 公開 CSS Custom Properties の最終リスト（§7.2 のたたき台をレビュー後に確定）
- 初期バージョン (`0.1.0` スタート想定)
