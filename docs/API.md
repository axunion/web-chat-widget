# web-chat-widget API リファレンス

本書は `web-chat-widget` の公開 API リファレンス。設計判断・アーキテクチャ不変条件は [SPEC.md](./SPEC.md) を参照。

## ステータス凡例

各 API の見出しに付ける記号:

- ✅ **実装済み** — 現バージョンで利用可
- 🚧 **仕様確定・未実装** — SPEC で確定済みだがコードはまだない

未実装 API は SPEC の対応節へリンクする。実装着地後にバッジを ✅ に更新する。

---

## 1. インストールとエントリポイント

### 1.1 npm 経由 ✅

```bash
pnpm add web-chat-widget   # パッケージ名は公開時に確定
```

```ts
// 命令的に組み立てる場合
import { ChatWidget } from "web-chat-widget";
import { createOpenAISseAdapter } from "web-chat-widget/adapters";

const widget = ChatWidget.mount({
  adapter: createOpenAISseAdapter({ url: "/api/chat" }),
});
```

```ts
// 宣言的に <chat-widget> を使う場合 (副作用 import)
import "web-chat-widget/element";
```

```html
<chat-widget api-url="/api/chat" theme="auto" locale="ja"></chat-widget>
```

### 1.2 `<script>` タグ経由 ✅

```html
<script src="https://cdn.example.com/web-chat-widget.iife.js"></script>
<script>
  ChatWidget.mount({
    adapter: ChatWidget.adapters.createOpenAISseAdapter({
      url: "/api/chat",
    }),
  });
</script>
```

IIFE バンドルは:

- `window.ChatWidget` にクラス本体を露出
- `ChatWidget.adapters` 名前空間に `createOpenAISseAdapter` / `createJsonAdapter` 等を attach
- `ChatWidget.stores` 名前空間に `createMemoryStore` / `createLocalStorageStore` / `createSessionStorageStore` を attach
- 副作用で `<chat-widget>` カスタム要素も登録 (`"./element"` 相当を内包)

### 1.3 公開 export 一覧 ✅

| エントリ | 内容 | 副作用 |
| --- | --- | --- |
| `web-chat-widget` (`"."`)   | `ChatWidget` クラス、`ChatEngine`、各種型 | なし |
| `web-chat-widget/element`  | `<chat-widget>` の `customElements.define` | あり (define) |
| `web-chat-widget/adapters` | `createOpenAISseAdapter` / `createJsonAdapter` と関連型 | なし |
| IIFE 配布物 (`chat-widget.iife.js`) | `window.ChatWidget` + `.adapters` + `.stores` + `<chat-widget>` define | あり |

`"."` から具体的に export されるシンボル:

| 種別 | 名前 |
| --- | --- |
| クラス | `ChatWidget`, `ChatEngine` |
| 型 | `ChatWidgetOptions`, `ChatWidgetPosition`, `ChatWidgetTheme`, `ChatWidgetApiMode`, `ChatWidgetPersist`, `ChatEngineOptions` |
| Message | `Message`, `MessageRole`, `MessageStatus`, `CreateMessageOverrides`, `createMessage` |
| イベント | `ChatEventMap`, `ChatEventType`, `createChatEvent` |
| i18n | `LabelDictionary`, `Locale`, `resolveLabels` |
| Adapter | `ChatAdapter`, `AdapterChunk` |
| Store | `ChatStore`, `CreateLocalStorageStoreOptions`, `CreateSessionStorageStoreOptions`, `createMemoryStore`, `createLocalStorageStore`, `createSessionStorageStore` |
| テーマ | `ThemeToken`, `THEME_TOKENS`, `renderThemeCss` |
| Markdown | `markdownToNodes` |

---

## 2. ChatWidget クラス ✅

### 2.1 コンストラクタ / mount ✅

```ts
class ChatWidget extends HTMLElement {
  constructor(options?: ChatWidgetOptions);
  static mount(options: ChatWidgetOptions): ChatWidget;
}

interface ChatWidgetOptions {
  target?: HTMLElement;                   // 省略時 document.body (mount 経由のみ有効)
  adapter?: ChatAdapter;                  // 省略時は api-url 属性から自動構築
  position?: ChatWidgetPosition;
  theme?: ChatWidgetTheme;
  locale?: Locale;
  initialMessages?: Message[];
  messages?: Partial<LabelDictionary>;    // 文言の部分上書き
  store?: ChatStore;                   // §5 参照
}

type ChatWidgetPosition = "bottom-right" | "bottom-left" | "top-right" | "top-left";
type ChatWidgetTheme    = "light" | "dark" | "auto";
type ChatWidgetApiMode  = "openai-sse" | "json";
```

- `mount(options)` は `defineChatWidget()` を内部で呼び、`new ChatWidget(options)` を `target` (省略時 `document.body`) に append、生成したインスタンスを返す
- 直接 `new ChatWidget(...)` した場合は呼出側で DOM 挿入が必要 (挿入されると `connectedCallback` で初期化される)
- `connectedCallback` 時点で `adapter` も `api-url` 属性も無いと `Error` を throw する

### 2.2 メソッド

| メソッド | シグネチャ | ステータス | 説明 |
| --- | --- | --- | --- |
| `open` | `(): void` | ✅ | パネルを開く。すでに開いているときは no-op。`open` イベント発火 |
| `close` | `(): void` | ✅ | パネルを閉じる。すでに閉じているときは no-op。`close` イベント発火 |
| `toggle` | `(): void` | ✅ | 開閉を反転 |
| `sendMessage` | `(text: string): Promise<void>` | ✅ | プログラム的にユーザー発言を送信。空文字は呼出側で防ぐこと |
| `getMessages` | `(): readonly Message[]` | ✅ | 現在の履歴のスナップショット (内部状態のコピー) |
| `destroy` | `(): void` | ✅ | リスナーを解除し engine を破棄。再 attach 時に再初期化される |
| `clear` | `(): void` | ✅ | 会話履歴を空にする。`engine.clear()` で in-memory 履歴を空にし in-flight を abort、UI も空状態に再描画。`store.clear()` 連動は ChatStore (§9) 実装と同時。panel header の `clear-button` からも起動 (SPEC §9.9.1) |
| `retry` | `(): Promise<void>` | ✅ | 直前の user メッセージを再送する。前回の assistant 応答は drop され、新しい応答に置き換わる。SPEC §6.7 参照 |

### 2.3 イベント ✅

`ChatWidget` は `EventTarget` を継承 (`HTMLElement` 経由)。`addEventListener(type, handler)` で購読する。すべて `bubbles: false`, `composed: false`。

| イベント | `detail` の型 | タイミング |
| --- | --- | --- |
| `ready` | `undefined` | 初期化完了（DOM 挿入とスタイル適用が済んだ時点） |
| `open` | `undefined` | パネルが開いた直後 |
| `close` | `undefined` | パネルが閉じた直後 |
| `message` | `{ role: "user" \| "assistant"; content: string }` | アシスタント応答が `done` チャンク到達で確定した時 (1 メッセージにつき 1 回)。`role` は `"system"` を含まない |
| `error` | `{ error: Error }` | アダプタが `error` チャンクを返した、または send 内部で例外発生 |

`message` イベントは確定タイミングのみ。`text-delta` ごとには発火しない (UI と同じ方針)。

```ts
widget.addEventListener("message", (e) => {
  console.log(e.detail.role, e.detail.content);
});
```

### 2.4 型定義 ✅

```ts
interface Message {
  id: string;                                       // "msg_<base36>_<seq>_<rand>"
  role: "user" | "assistant" | "system";
  content: string;                                  // 内部表現は Markdown ソース文字列
  createdAt: number;                                // epoch ms
  status?: "streaming" | "done" | "error";
}

interface CreateMessageOverrides {
  id?: string;
  createdAt?: number;
  status?: MessageStatus;
}

interface ChatEventMap {
  ready: undefined;
  open: undefined;
  close: undefined;
  message: { role: Exclude<MessageRole, "system">; content: string };
  error: { error: Error };
}
```

`createMessage(role, content, overrides?)` ヘルパも `"."` から export される。テストや `initialMessages` 構築時に利用する。

---

## 3. `<chat-widget>` カスタム要素 ✅

`web-chat-widget/element` を import するか IIFE バンドルを読み込むと、`customElements.define("chat-widget", ChatWidget)` が走る。

### 3.1 属性表

| 属性 | 型 | 既定値 | ステータス | 説明 |
| --- | --- | --- | --- | --- |
| `open` | boolean (presence) | なし | ✅ | 属性が存在すると開いた状態で初期化 |
| `position` | `"bottom-right" \| "bottom-left" \| "top-right" \| "top-left"` | `"bottom-right"` | ✅ | FAB とパネルの配置 |
| `locale` | `"ja" \| "en"` | `navigator.language` 由来 | ✅ | UI 言語 |
| `theme` | `"light" \| "dark" \| "auto"` | `"auto"` | ✅ | テーマ |
| `api-url` | string | なし | ✅ | 既定アダプタを使う場合のエンドポイント |
| `api-mode` | `"openai-sse" \| "json"` | `"openai-sse"` | ✅ | 既定アダプタの種別 |
| `persist` | `"local" \| "session" \| "none"` | `"none"` | ✅ | 内部で `createLocalStorageStore` / `createSessionStorageStore` / `createMemoryStore` を構築。SPEC §9.11 |
| `persist-key` | string | `"web-chat-widget"` | ✅ | ストアの保存キー。SPEC §9.11 |

### 3.2 動的属性変更の追従ルール

| 属性 | mount 後の変更を反映 |
| --- | --- |
| `open` / `position` / `locale` / `theme` | ○ |
| `api-url` / `api-mode` | × (mount 時のみ評価) |
| `persist` / `persist-key` | × (mount 時のみ評価) |

`api-url` 後の adapter 差し替え、`persist` 後のストア差し替えはどちらも JS API 経由で要素を作り直す方針。

### 3.3 `::part()` セレクタ ✅

外部スタイルから DOM 単位の上書きをしたいときに使う。

| part 名 | 対応要素 |
| --- | --- |
| `fab` | 閉状態のボタン |
| `panel` | 展開パネル全体 |
| `header` | パネル上部 |
| `clear-button` | 履歴クリアボタン (SPEC §9.9.1) |
| `close-button` | パネル閉じボタン |
| `log` | メッセージ一覧のスクロールコンテナ |
| `message` | すべてのメッセージ |
| `message-user` / `message-assistant` / `message-system` | role 別メッセージ |
| `message-error` | エラー表示 |
| `input-area` | 入力欄周辺 |
| `input` | `<textarea>` |
| `send-button` | 送信ボタン |

```css
chat-widget::part(fab) {
  border: 2px solid hotpink;
}
```

---

## 4. アダプタ ✅

### 4.1 `ChatAdapter` インターフェース ✅

```ts
interface ChatAdapter {
  send(
    messages: readonly Message[],
    signal: AbortSignal
  ): AsyncIterable<AdapterChunk>;
}

type AdapterChunk =
  | { type: "text-delta"; delta: string }
  | { type: "done" }
  | { type: "error"; error: Error };
```

実装上の義務 (詳細は SPEC §8 と `.claude/rules/adapters.md`):

- 同期 throw しない。失敗は `{ type: "error", error }` を yield
- `signal.aborted` を見て `fetch` をキャンセルしイテレータを終了
- 成功時は最後に `{ type: "done" }` を 1 回 yield してから return

### 4.2 `createOpenAISseAdapter` ✅

```ts
function createOpenAISseAdapter(options: OpenAISseAdapterOptions): ChatAdapter;

interface OpenAISseAdapterOptions {
  url: string;
  headers?: Record<string, string>;
  model?: string;                        // 指定すると body に含まれる
  fetchImpl?: typeof fetch;              // テスト注入用
}
```

挙動:

- HTTP `POST url`、`Content-Type: application/json`
- body: `{ messages: [{ role, content }], stream: true, model? }`
- `text/event-stream` を行ごとにパースし、`choices[0].delta.content` を `text-delta` として yield
- `data: [DONE]` で `done` を yield
- fetch 失敗 / 4xx・5xx ステータス / JSON parse 失敗 / `choices` 欠落は `error`
- `signal` をそのまま `fetch` に渡し、レスポンス reader は `finally` で `cancel()`

### 4.3 `createJsonAdapter` ✅

```ts
function createJsonAdapter(options: JsonAdapterOptions): ChatAdapter;

interface JsonAdapterOptions {
  url: string;
  headers?: Record<string, string>;
  extract?: (json: unknown) => string;   // 既定: json.reply (string でなければ throw)
  fetchImpl?: typeof fetch;
}
```

挙動:

- HTTP `POST url`、ボディは `{ messages }`
- レスポンスを `await response.json()` し、`extract(parsed)` で文字列を抽出
- 1 回の `text-delta` + `done` を yield して終了
- `extract` が string 以外を返した・throw した場合は `error`

### 4.4 カスタムアダプタの書き方 ✅

`ChatAdapter` を実装すれば任意のバックエンドに対応できる。WebSocket・モック・複数バックエンド分岐などはここで差し替える。

```ts
const customAdapter: ChatAdapter = {
  async *send(messages, signal) {
    const ws = new WebSocket("/api/ws");
    signal.addEventListener("abort", () => ws.close(), { once: true });
    try {
      for await (const event of fromWs(ws)) {
        if (signal.aborted) return;
        if (event.kind === "delta")    yield { type: "text-delta", delta: event.text };
        else if (event.kind === "end") { yield { type: "done" }; return; }
        else if (event.kind === "err") { yield { type: "error", error: event.err }; return; }
      }
    } finally {
      ws.close();
    }
  },
};
```

---

## 5. ChatStore ✅

データ永続化のためのインターフェース。`createMemoryStore` / `createLocalStorageStore` / `createSessionStorageStore` の 3 つの組込み factory を `web-chat-widget` から直接 import 可能。仕様の権威は SPEC §9。

### 5.1 `ChatStore` インターフェース ✅

```ts
interface ChatStore {
  load(): Message[];                          // sync。constructor 起動時に 1 回
  save(messages: readonly Message[]): void;   // 状態確定時 (done / clear / retry)
  clear(): void;                              // 永続層を purge
}
```

- すべて sync。非同期バックエンド (IndexedDB / リモート同期) は **factory が async でラップ**して sync ストアを返すパターンで吸収する (SPEC §9.2.1)
- `save` は `text-delta` ごとには呼ばれず、`done` / `clear()` / `retry()` のタイミングのみ (SPEC §9.4)

### 5.2 `createMemoryStore` ✅

```ts
function createMemoryStore(): ChatStore;
```

何も永続化しない既定実装。`store` を未指定にしたときと等価。

### 5.3 `createLocalStorageStore` ✅

```ts
function createLocalStorageStore(opts?: {
  key?: string;             // 既定 "web-chat-widget"
  maxMessages?: number;     // 既定 100
}): ChatStore;
```

- ブラウザの `localStorage` に永続化する
- 保存形式は `{ "v": 1, "messages": [...] }` (SPEC §9.6)
- `maxMessages` を超えたメッセージは古い順に drop してから save
- `QuotaExceededError` 時は古い半数を drop して再試行 → なお失敗なら memory にフォールバック (SPEC §9.7)
- Private browsing 等で `localStorage` が使えない場合は factory 段階で memory store を返す (SPEC §9.8)

### 5.4 `createSessionStorageStore` ✅

```ts
function createSessionStorageStore(opts?: {
  key?: string;             // 既定 "web-chat-widget"
}): ChatStore;
```

- `sessionStorage` に保存する。タブを閉じると消える
- `maxMessages` は持たない (sessionStorage は容量問題が出にくいため)
- それ以外は `createLocalStorageStore` と同様

### 5.5 カスタムストアの書き方 ✅

```ts
const remoteStore: ChatStore = {
  load() {
    // 起動時 sync な手段でしか取れないため、リモート同期は factory で先読みする
    return cachedSnapshot;
  },
  save(messages) {
    enqueueRemoteSave(messages);   // fire-and-forget
  },
  clear() {
    cachedSnapshot = [];
    enqueueRemoteClear();
  },
};

// 想定例: factory で先読みしてから sync ストアを返す
async function createRemoteStore(api: RemoteApi): Promise<ChatStore> {
  const snapshot = await api.fetchInitial();
  return makeRemoteStore(snapshot, api);
}
```

詳細な責務 (`clear()` の連動範囲・複数インスタンス・プライバシー) は SPEC §9.9 〜 §9.12。

---

## 6. ロケールと文言 ✅

### 6.1 `LabelDictionary` 全 15 キー

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
  poweredBy: string;           // 未使用スロット (将来のフッター用、既定 "")
}
```

組込みロケールは `"ja"` と `"en"` の 2 種類。`navigator.language` が `ja` で始まるなら `"ja"`、それ以外は `"en"`。

### 6.2 部分上書き

```ts
new ChatWidget({
  locale: "ja",
  messages: {
    placeholder: "質問をどうぞ",
    sendButton: "送る",
  },
});
```

指定しなかったキーはロケール既定値が使われる。実装は `resolveLabels(locale, override)` (i18n.ts) で `Partial<LabelDictionary>` をマージするだけのシンプルな構造。

---

## 7. CSS カスタマイズ ✅

### 7.1 公開 CSS 変数

完全な一覧と用途は [SPEC §7.2](./SPEC.md#72-公開する-css-custom-properties) を参照。CSS 変数は Shadow DOM の境界を貫通するため、ホストページから単純に上書きできる。

```css
chat-widget {
  --cw-color-primary: #ff5722;
  --cw-radius: 8px;
  --cw-z-index: 9999;
}
```

### 7.2 `::part()` セレクタ

[§3.3](#33-part-セレクタ) を参照。

---

## 8. ステータスサマリ

| API | ステータス |
| --- | --- |
| `ChatWidget` 全般 (`new` / `mount` / 8 メソッド / 5 イベント / 6 属性) | ✅ |
| `<chat-widget persist persist-key>` | ✅ (SPEC §9.11) |
| `ChatAdapter` interface / `createOpenAISseAdapter` / `createJsonAdapter` | ✅ |
| `ChatStore` interface / 3 つの組込み factory | ✅ (SPEC §9) |
| `LabelDictionary` / `resolveLabels` | ✅ |
| CSS 変数 / `::part()` | ✅ |
| `ChatEngine` (低レベル) / `createMessage` / `markdownToNodes` / `THEME_TOKENS` / `renderThemeCss` | ✅ |
