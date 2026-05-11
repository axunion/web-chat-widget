# web-chat-widget 仕様書

> 最終更新: 2026-05-11

任意の Web ページに埋め込み可能なフローティング型 AI チャット UI `web-chat-widget` の設計仕様書。**この文書は設計判断とアーキテクチャ不変条件の記録**であり、API シグネチャと利用方法のリファレンスは [API.md](./API.md) を参照すること。

## ステータス凡例

各節と項目の見出しに以下のいずれかを付ける。

- ✅ **実装済み** — 現在のコードベースに存在する。詳細なシグネチャは API.md またはコード参照
- 🚧 **仕様確定・未実装** — 仕様は本書で確定済み、実装は未着手 (現在は該当なし)

---

## 1. 概要 / スコープ ✅

### 1.1 プロダクト

`web-chat-widget` は、任意の Web ページにフローティング型の AI チャット UI を導入するための配布可能パッケージ。

- ページ右下（既定）に常駐する FAB をクリックするとチャットパネルが開く
- ユーザー入力をバックエンド API に送信し、アシスタント応答をストリーミング表示
- バックエンド API の形式は **アダプタ** で差し替え可能
- 履歴の永続化は **ストア** で opt-in 可能

### 1.2 実装方針

- **ランタイム依存ゼロ**。Web 標準（Custom Elements, Shadow DOM, `fetch`, `ReadableStream`, `EventTarget`, `AbortController` など）のみで構成
- 現バージョンはバニラ JS/TS 版のみ。React / Vue ラッパーは将来検討（§13）
- ビルドは Vite library mode、テストは Vitest + happy-dom

### 1.3 想定利用シーン

- 自社 Web アプリに npm 経由で組み込むケース
- 既存サイト・CMS に `<script>` タグ 1 行で埋め込むケース

両者を同一パッケージ・同一コードベースでサポートする。

---

## 2. ゴール ✅

- Web 標準のみで動作し、外部ページの CSS に干渉されずレンダリングされる
- 宣言的 (`<chat-widget>` カスタム要素) と命令的 (`new ChatWidget()`) の両 API を提供する
- OpenAI 互換 SSE を既定のレスポンス形式とし、かつユーザーが独自バックエンドに差し替えられる
- 履歴のクライアント永続化を **opt-in** で提供する（既定はインメモリ。§9）
- テーマ (色、角丸、フォント、位置) を CSS Custom Properties から上書きできる
- 基本的なアクセシビリティ (キーボード操作、`aria-live`, 十分なコントラスト) を満たす
- 日本語 / 英語の UI 文言を持ち、任意の文言に上書きできる

未対応の項目は §17 にまとめる。

---

## 3. 配布形態とエントリポイント ✅

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

### 3.2 設計上の判断

- `package.json` の `exports` は `"."` / `"./element"` / `"./adapters"` の 3 エントリのみ。`"./react"` 等の未実装パスを public exports に晒さない方針
- 副作用の分離: `"."` (`src/index.ts`) は import しただけでは何も起きない。`customElements.define(...)` を実行したい場合は `"./element"` または IIFE を使う
- IIFE は `<script>` 1 行で動かすため、`window.ChatWidget` にクラスと `ChatWidget.adapters` / `ChatWidget.stores` 名前空間を attach し、副作用で `<chat-widget>` も登録する

API のシグネチャは [API.md §1](./API.md#1-インストールとエントリポイント) 参照。実装ファイル / ビルド構成の詳細は CLAUDE.md と `vite.config.ts` を参照。

---

## 4. 公開 API ✅

API のシグネチャ・属性表・メソッド表・イベント表は [API.md §2 〜 §3](./API.md) にまとめる。本節は**設計判断のみ**を記録する。

### 4.1 二系統の API を持つ理由

- 宣言的 API (`<chat-widget>` カスタム要素) — 既存サイト・CMS に script タグ 1 行で挿入する用途
- 命令的 API (`new ChatWidget()` / `ChatWidget.mount()`) — npm 経由で組み込み、複数インスタンス化やライフサイクル制御をしたい用途

両系統で同じ機能セットが使えることを不変条件とする。

### 4.2 動的属性変更の追従ルール

| 属性 | 実行時変更を反映 | 理由 |
| --- | --- | --- |
| `open` / `position` / `locale` / `theme` | ○ | 表示状態のみで再構築不要 |
| `api-url` / `api-mode` | × | mount 後の adapter 差し替えはエンジン再構築が必要なため |
| `persist` / `persist-key` | × | mount 後のストア差し替えはエンジン再構築が必要なため |

`api-url` 後の adapter 差し替え、`persist` 後のストア差し替えはどちらも JS API 経由で要素を作り直す方針。

### 4.3 イベントは `EventTarget` 継承

`ChatWidget` は `EventTarget` を継承し、`addEventListener` / `dispatchEvent` ベースで通知する。コールバック props を露出しない理由:

- フレームワーク中立 (React 版でも `useEffect` でリスナー登録できる)
- 複数の listener を自然にぶら下げられる
- `signal` でクリーンアップが書ける

イベントは `bubbles: false`, `composed: false`。Shadow DOM 越境を意図しない。

### 4.4 複数インスタンス

複数 `ChatWidget` を同時に置くことは技術的には許容するが、z-index と FAB の位置が衝突するため非推奨。同一 origin に複数置く場合は CSS 変数 `--cw-z-index` と `position` をインスタンスごとに変える運用が必要。

---

## 5. フローティング UI の挙動仕様 ✅

### 5.1 状態

- **閉状態**: ページ隅に FAB（56px の円形ボタン）だけが表示される
- **開状態**: FAB の近傍にパネル (幅 380px × 高さ min(600px, calc(100vh - 120px))) が展開される

### 5.2 初期状態

- `open` 属性 / オプション未指定時は**閉**で初期化
- `open` 指定時は開いて初期化

### 5.3 位置

- `position` で 4 隅から選択
- 画面端からのオフセット (既定 20px) は CSS 変数 `--cw-offset` で調整可

### 5.4 レスポンシブ

- ブレークポイント: ビューポート幅 < 640px
- モバイル時はパネルをフルスクリーン表示（`width: 100vw; height: 100dvh`）
- **フルスクリーン時も非モーダル方針は維持**: 背景のタブ移動は塞がないが、視覚的には背面は隠れる

### 5.5 アニメーション

- 開閉は `transform: translateY()` + `opacity` の組合せ、`transition: 160ms ease-out`
- `@media (prefers-reduced-motion: reduce)` ではトランジションを無効化

### 5.6 z-index

- 既定 `z-index: 2147483000` (最大値 2147483647 は既存サイトとの衝突リスクがあるため使わない)
- CSS 変数 `--cw-z-index` で上書き可能

### 5.7 スクロール挙動

- メッセージリストは内部でのみスクロールする
- 新規メッセージ（アシスタントのストリーミング更新含む）到着時、**スクロール位置が最下端から 48px 以内にある場合のみ**自動追従
- ユーザーが上方向にスクロールして履歴を読んでいる場合は追従しない

---

## 6. メッセージモデル ✅

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
| トリプルバッククォートのコードブロック | ○ (言語指定は無視) |
| `[text](url)` | ○ (§6.4 の制約付き) |
| `- ` / `* ` による箇条書きリスト | ○ |
| `1.` による番号付きリスト | ○ |
| 見出し `#` | ×（チャット UI に過剰） |
| 表 | × |
| 画像 `![](...)` | × |
| 生 HTML | × |
| シンタックスハイライト | × |

- Markdown パイプラインは **`assistant` および `system` ロールのメッセージにのみ適用**する
- `user` ロールはプレーンテキストとして描画（`textContent` のみ）

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

- アダプタの `error` チャンクまたは例外発生時、該当 assistant メッセージの行内に赤いエラー表示と「再試行」ボタンを表示
- 再試行は直前の user メッセージをもとに同じ adapter で `retry()` を呼ぶ
- ネットワークエラーと HTTP エラーを区別せず、文言は §11 で定義

---

## 7. スタイルカスタマイズ ✅

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
  - **`src/core/theme.ts` の `THEME_TOKENS`** = その変数の実値を保持する実装定数
- 変数の追加・削除・リネームは SPEC を先に更新し、その後 `THEME_TOKENS` を合わせる。逆順（実装先行）は禁止
- 既定値のリファイン（例: primary 色の微調整）は `THEME_TOKENS` 側の変更で完結してよいが、SPEC の既定値列も同値に揃え直す

### 7.3 `::part()` で露出する要素

`::part()` 一覧は [API.md §3.3](./API.md#33-part-セレクタ) を参照。

### 7.4 プリセットテーマ

- `theme: "light" | "dark" | "auto"`
- `"auto"` は `prefers-color-scheme` に追従し、変化時にリアルタイムで切り替える
- Shadow DOM 内で `[data-theme="light"]` / `[data-theme="dark"]` のどちらかが常にセットされる

---

## 8. アダプタ ✅

シグネチャと組込み factory のオプション詳細は [API.md §4](./API.md#4-アダプタ) を参照。本節は**インターフェース設計上の判断**を記録する。

### 8.1 `AsyncIterable<AdapterChunk>` に統一する理由

ストリーミング (SSE) と非ストリーミング (1 回 JSON) を**同じインターフェースで扱う**ため。

```ts
interface ChatAdapter {
  send(messages: readonly Message[], signal: AbortSignal): AsyncIterable<AdapterChunk>;
}

type AdapterChunk =
  | { type: "text-delta"; delta: string }
  | { type: "done" }
  | { type: "error"; error: Error };
```

- ストリーミングなら delta を順に yield し、最後に `done`
- 非ストリーミングなら 1 回の delta + `done` を yield

呼び出し側 (Engine) はストリーミング有無を意識しない。

### 8.2 `AbortSignal` 義務

実装側は `signal.aborted` を見て `fetch` をキャンセルし、イテレータを終了する義務がある。Engine は `clear()` / `destroy()` / 新規 `sendMessage()` 時に signal を発火する。

### 8.3 例外を投げず error チャンクで返す

ネットワーク失敗・HTTP エラー・JSON parse 失敗のすべてを `{ type: "error", error }` として yield する。同期 throw は禁止。Engine 側でのエラーハンドリングを単一経路に揃えるため。

### 8.4 認証

- **API キーをフロントエンドから直接 LLM プロバイダに送る用途は非推奨**。README にも明記
- 既定は「ユーザー自身のバックエンドを経由する」ことを前提とし、`headers` オプションで Cookie / Bearer を追加
- ブラウザ埋め込み時の CORS・CSRF は利用者側の責任範囲

---

## 9. データ永続化 (ChatStore) ✅

### 9.1 動機

リロードで履歴が消える UX 問題を解決しつつ、第三者サイト埋め込みでは「永続化したい / したくない」が埋め込み先で分かれるため、**プラガブルなストア**として opt-in 提供する。Adapter と並ぶ第 2 のシーム。

### 9.2 インターフェース

```ts
export interface ChatStore {
  load(): Message[];                          // sync。constructor 起動時に 1 回呼ばれる
  save(messages: readonly Message[]): void;   // 状態確定時に呼ばれる (§9.4)
  clear(): void;                              // widget.clear() 呼出時に永続層も purge
}
```

#### 9.2.1 sync 統一の理由

すべての public メソッドを **sync** にし、`ChatEngine` の constructor / 状態更新パスを同期で書ける構造を維持する。`localStorage` / `sessionStorage` は sync API なので無問題。`IndexedDB` / バックエンド同期等の非同期バックエンドは「**factory が async、できあがったストアは sync**」というパターンで吸収する例:

```ts
// 想定例 (組込みではない)
const store = await createIndexedDbStore({ db: "myapp", store: "chat" });
new ChatWidget({ store });  // ← 以降 sync で動く
```

### 9.3 組込み factory

```ts
createMemoryStore(): ChatStore;                              // 既定 (現状の挙動と同じ)

createLocalStorageStore(opts?: {
  key?: string;             // 既定 "web-chat-widget"
  maxMessages?: number;     // 既定 100
}): ChatStore;

createSessionStorageStore(opts?: {
  key?: string;             // 既定 "web-chat-widget"
}): ChatStore;
```

### 9.4 保存タイミング

`save()` を呼ぶ箇所:

- `done` チャンク到達時 (assistant メッセージが確定した瞬間)
- `clear()` 直後 (空配列を保存)
- `retry()` で履歴 splice 直後

呼ばない箇所:

- `text-delta` ごと (書込みコストとストリーミング中断時のゴミを避ける)
- `sendMessage()` の user メッセージ追加直後 (assistant 応答とセットで確定する方針)

### 9.5 読込タイミング

- `ChatEngine` constructor で `store.load()` を**同期的に**呼ぶ
- `initialMessages` と `store.load()` 結果が両方ある場合は **store load 結果を採用** (永続化された会話の継続を優先)

### 9.6 保存形式とバージョニング

```jsonc
{
  "v": 1,
  "messages": [/* Message[] */]
}
```

- JSON parse 失敗 / `v` mismatch / `messages` が配列でない / 各要素のスキーマ不正 → discard して空配列扱い
- スキーマを破壊的に変える際に `v` を上げ、旧バージョンは discard する方針 (マイグレーションは現状実装しない)

### 9.7 Quota 超過

`localStorage.setItem` が `QuotaExceededError` を投げた場合:

1. 古い順に半数を drop して 1 回再試行
2. それでも失敗したら **memory にフォールバック** (以降の `save` は no-op)、`console.warn` でログ
3. ユーザーには UI 上の通知はしない (ストア層の問題でチャット機能を阻害しない方針)

### 9.8 Storage 例外への耐性

- Private browsing や `localStorage` 無効化等で例外が出る環境は、**factory 段階で検知**し memory store を返す
- 検知方法: `setItem`/`getItem`/`removeItem` を sentinel key で 1 回試行

### 9.9 `clear()` の責務

`ChatWidget.clear()` を呼ぶと:

1. `engine.clear()` でインメモリ履歴を空に (✅ 実装済み)
2. `store.clear()` で永続層も purge (✅ ChatStore 実装済)
3. UI を空状態に再描画 (✅ 実装済み — `ObservableEngine.notify()` 経由で log subscribe ハンドラが空配列を描画)

### 9.9.1 履歴クリア UI ✅

`ChatWidget.clear()` を JS API 経由以外からも起動できるよう、panel header にクリアボタンを設置する。

- **位置**: panel header 内、close button の左隣
- **アイコン**: ゴミ箱 (trash) スタイルの単一パス SVG (`stroke="currentColor"`)。実体は `src/ui/panel.ts` のヘルパ
- **可視ラベル**: なし (アイコンのみ)。`aria-label` に `LabelDictionary.clearHistory` を割り当て
- **part**: `clear-button` (§7.3 の一覧に追加)
- **確認**: クリック時に `window.confirm(labels.clearConfirm)` を表示。OK で `widget.clear()` を呼ぶ。Cancel なら何もしない。SPEC §10.1 の非モーダル方針を保つため自前モーダルは導入しない
- **無効化**: 履歴が空 (`getMessages().length === 0`) のときボタンは `disabled` 属性付き
- **ロケール変更**: `aria-label` も `labels` の差し替えに追従する

### 9.10 複数インスタンス

同一 `key` で複数 `ChatWidget` を同一ページに置くと履歴が混ざる。これは「動くが非推奨」と明記し、複数インスタンス利用時は `persist-key` を変える運用とする。

### 9.11 宣言的 API への露出

属性で便利フラグとして提供する:

| 属性 | 値 | 既定 | 効果 |
| --- | --- | --- | --- |
| `persist` | `"local"` \| `"session"` \| `"none"` | `"none"` | 内部で対応する factory を呼ぶ |
| `persist-key` | string | `"web-chat-widget"` | factory に渡すキー |

`api-url` 同様、より細かい制御 (`maxMessages` / カスタムストア) は JS API 経由で行う。

### 9.12 プライバシー

opt-in 永続化はユーザーの会話内容をブラウザストレージに保存する。サイト側で:

- プライバシーポリシーへの記載
- Cookie 同意ダイアログ等との整合
- 共有端末を想定する場合の取扱い

の検討が必要。本ウィジェットはこの判断を行わず、ホスト側責任とする。詳細は §12.6 セキュリティ。

### 9.13 イベントは追加しない

`save` / `load` は内部実装詳細であり、§12 で確定している 5 種のイベント (`ready` / `open` / `close` / `message` / `error`) は変更しない。

---

## 10. アクセシビリティ ✅

### 10.1 非モーダル方針

現バージョンは**非モーダル**。パネルを開いても背景ページのインタラクションは維持される。

- パネル要素に `role="complementary"` と `aria-label="AI chat"`（ローカライズ可能）を付与
- 背景への Tab 移動は塞がない
- `aria-modal` は付与しない
- フォーカストラップなし

### 10.2 メッセージリスト

- コンテナに `role="log"` と `aria-live="polite"` を付与
- ストリーミング中の部分更新はスクリーンリーダーが騒がしくなるため、**メッセージ確定時（`done` 到達時）に一度だけ aria-live を発火**する方針
- 実装上は、ストリーミング中は `aria-live="off"` の hidden コンテナで描画し、確定時に `aria-live="polite"` コンテナへテキストをコピーする
- コピーは `liveHost.appendChild(div); div.textContent = message.content` で行う。これは LLM が `<img onerror=...>` や `javascript:` リンクを含む応答を返した場合でも **DOM 上にアクティブな要素を作らない** ことを `textContent` の性質で保証する一方、SR は `**bold**` 等の Markdown マークアップやリンクの URL を逐語で読み上げる。マークアップを平文化する `markdownToPlainText` 中間表現の導入は §17 backlog

### 10.3 キーボード操作

| キー | 挙動 |
| --- | --- |
| `Enter` | 送信（入力欄フォーカス時） |
| `Shift + Enter` | 改行 |
| `Esc` | パネルを閉じる（入力欄フォーカス時） |
| `Tab` | パネル内要素を順に辿り、最後の要素の次で背景ページへ抜ける |

### 10.4 コントラスト

- 既定のライト / ダーク両テーマは WCAG AA (4.5:1) を満たすよう調整する
- ユーザーが CSS 変数を上書きした場合のコントラスト担保は利用者責任

---

## 11. 国際化 ✅

### 11.1 ロケール

- `locale: "ja" | "en"`
- 既定は `navigator.language` から `ja` / `en` を判定（それ以外は `en` フォールバック）
- 明示指定があれば優先

### 11.2 文言辞書

`LabelDictionary` の全 15 キーは [API.md §6](./API.md#6-ロケールと文言) を参照。

- `messages` オプションで一部だけ上書き可能（指定しなかったキーはロケール既定値）
- 部分上書きの仕様は `Partial<LabelDictionary>` を `resolveLabels(locale, override)` でマージするだけのシンプル実装

---

## 12. セキュリティ ✅

### 12.1 XSS 対策

- Markdown レンダリングは allowlist 方式。対応外の記法は**必ずエスケープ済みテキスト**として描画
- `innerHTML` / `insertAdjacentHTML` は使わない。`document.createElement` + `textContent` + `appendChild` のみ
- アシスタント応答も同様に扱う（プロンプトインジェクションで生 HTML を吐いてくる前提）
- aria-live `polite` コンテナへの確定メッセージコピーも `textContent` 経由なので、LLM が Markdown ソースに HTML タグや `javascript:` リンクを混ぜても **アクティブな DOM ノードにはならない**（§10.2 参照）
- SVG アイコンの `d` 属性は `src/ui/svg.ts:buildStrokeIcon` の compile-time 定数のみで構築する。SVG path data は script 実行できないが、規律として `d` に user / assistant 入力を渡してはならない
- `LabelDictionary` の値はホストアプリ由来の **trusted host string** として扱う。`window.confirm()` 等のテキスト sink にそのまま渡し、内部でサニタイズはしない。ホストが LLM 出力やユーザー入力をそのまま `LabelDictionary` に流し込まないこと（§11 / §9.9.1 の `clearConfirm` などに該当）

### 12.2 リンク

- `href` は `^https?://` のみ許可
- `target="_blank"`, `rel="noopener noreferrer"` を強制
- 許可外スキーム (`javascript:`, `data:` 等) は自動的にプレーンテキスト降格

### 12.3 CSP

- Shadow DOM 内の `<style>` ノードは `style-src 'unsafe-inline'` を要求する
- 厳格 CSP 下で `'unsafe-inline'` を許可できないユースケースは現バージョンでは非対応。README で明記
- `script-src` には影響しない（JS は外部ファイルからロードされる）

### 12.4 Trusted Types

- 実装側で直接 `innerHTML` を使わないので Trusted Types 導入済みサイトでも動作する想定
- テストで Trusted Types 有効環境を再現することは現バージョンのスコープ外

### 12.5 依存リスク

- 依存ゼロ方針のため、サプライチェーン攻撃面を最小化する
- `devDependencies` は Biome / TypeScript / Vite / Vitest / happy-dom のみ

### 12.6 永続化のプライバシー

opt-in でストアを有効化した場合、ユーザーの会話内容がブラウザストレージ (`localStorage` / `sessionStorage` 等) に保存される。

- ホストサイトはプライバシーポリシーに保存内容と保存場所を記載すること
- Cookie 同意ダイアログを使うサイトは、ストレージ同意の対象として扱うことを推奨
- 共有端末で利用される可能性があるサイトでは、`createSessionStorageStore` を選ぶか永続化を無効化する
- 本ウィジェット側はこれらの判断を行わず、ホスト側責任とする

---

## 13. ビルド / パッケージング ✅

### 13.1 概要

`pnpm build` は次の 5 step を順次実行する:

1. `vite build` (ESM library: index / element / adapters)
2. `vite build --mode iife` (IIFE バンドル)
3. `tsc -p tsconfig.build.json` (`.d.ts` 出力)
4. `node scripts/rewrite-dts-extensions.mjs` (`.d.ts` の `from "./foo.ts"` を `.js` に書換)
5. `node scripts/copy-demo.mjs` (`demo/*.html` を `dist/` にコピーして preview から配信できるようにする)

詳細な設定値とハマりどころ (TypeScript 6.x が `rewriteRelativeImportExtensions` を `.d.ts` には適用しない件等) は CLAUDE.md と `vite.config.ts` を参照。

### 13.2 demo ページの扱い

役割分担した 2 種類の demo を持つ:

- **`index.html` + `src/main.ts`** — 開発者向けプレイグラウンド。`pnpm dev` で立ち上がり、ESM 直 import で動く
- **`demo/sample-service.html`** — エンドユーザー視点の production-shaped デモ。`pnpm demo` で build 後 preview から配信し、`<script src="./chat-widget.iife.js">` で配布物 IIFE を直接読み込む

IIFE のファイル名は固定 (`chat-widget.iife.js`) なので、demo HTML 側で `?v=YYYYMMDD` クエリを付けてキャッシュ衝突を避ける慣行。

### 13.3 ディレクトリ構成

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
    theme.ts               # THEME_TOKENS, CSS 変数の単一ソース
    i18n.ts                # ロケール辞書
    events.ts              # CustomEvent 生成ヘルパ
    store.ts               # ChatStore interface と組込み factory
  ui/
    widget.ts              # ChatWidget クラス本体（Shadow DOM の組み立て）
    styles.ts              # インライン CSS 文字列
    fab.ts                 # FAB DOM 構築
    panel.ts               # パネル DOM 構築
    log.ts                 # メッセージリスト
    input.ts               # 入力欄
    observable-engine.ts   # engine の状態変化を rAF バッチで通知
  adapters/
    index.ts               # re-export
    openai-sse.ts          # createOpenAISseAdapter
    json.ts                # createJsonAdapter
    sse-parse.ts           # SSE 行パーサ
tests/
  ...                      # src/ をミラーしたディレクトリ構造
demo/
  sample-service.html      # 架空 SaaS の production-shaped サンプル
scripts/
  rewrite-dts-extensions.mjs
  copy-demo.mjs
docs/
  SPEC.md                  # 本書 (設計判断と不変条件)
  API.md                   # 公開 API リファレンス
```

本節は主要ファイルのみを列挙する。実態は補助モジュール (例: `src/ui/dom.ts`, `src/ui/parts.ts`, `src/adapters/internal.ts`, `src/adapters/types.ts` 等) も含む。Engine / UI / Adapter / Store の責務分割は上記のとおり。

---

## 14. React 版への橋渡し設計 ✅

### 14.1 コアと UI の分離

- `src/core/engine.ts` の `ChatEngine` クラスは UI を持たず、以下のみを管理する
  - `messages: Message[]` の状態
  - adapter の呼び出しと `text-delta` の適用
  - ストアの load / save
  - `EventTarget` を継承したイベント発火
  - `sendMessage(text)`, `clear()`, `retry()` などの操作メソッド
- UI (`src/ui/widget.ts`) は `ChatEngine` のインスタンスを受け取り、DOM を描画するだけ
- UI が engine の状態変化を観察する経路は、`src/ui/observable-engine.ts` に置く軽量ラッパーに統一する。ラッパーは `sendMessage` / `retry` をラップし、送信中のみ `requestAnimationFrame` でバッチした `subscribe(cb): () => void` を公開する。これは将来の React ラッパーが `useSyncExternalStore(subscribe, getSnapshot)` にそのまま接続できる形でもある
- `ChatEngine` 自体には `"update"` 相当の状態変化イベントを追加しない。公開イベントは §4.3 の 5 種 (`ready` / `open` / `close` / `message` / `error`) に限定する

### 14.2 React 版 (将来)

- `@web-chat-widget/react`（または `web-chat-widget/react`）として薄いラッパーを公開予定
- 内部で `ChatEngine` を使い、`messages` を `useSyncExternalStore` で購読
- UI は React で書き直す。Shadow DOM は不使用（React アプリ側の CSS スコープに委ねる）
- アダプタ層・ストア層はフレームワーク中立なので現バージョンのものをそのまま使用

### 14.3 不変条件

- `ChatEngine` の public API は現バージョンで確定させ、以降は互換性を保つ
- 依存ゼロ方針は `ChatEngine` にも適用する

---

## 15. テスト戦略 ✅

### 15.1 TDD を開発プロセスの基盤とする

本プロジェクトは **test-first / red-green-refactor** を固定サイクルとする。

- 実装コード (`src/`) を書く前に、必ず失敗するテストを `tests/` 配下に書く
- 開発は `pnpm test:watch` を常時稼働させた状態で進め、red → green の切り替わりを目視する
- 実装コミットに対応するテストは先行する（同一コミットに同居でも可、ただしテストなしのコミットは不可）
- 例外: 型定義のみの変更、デモページの見た目調整、ドキュメント変更、設定ファイル
- TDD 補助のための subagent と slash command を `.claude/` に同梱する (CLAUDE.md §テスト駆動開発)

### 15.2 テスト対象

Vitest + happy-dom で `src/` をミラーした構造で書く。詳細なテストケース列挙は `tests/` 自身が権威 (現状 29 ファイル / 336 ケース)。

主要テストファイル:

- `tests/core/store.test.ts` ✅ — 各 factory、quota、schema mismatch、private browsing fallback
- `tests/ui/widget.clear.test.ts` ✅ — `clear()` の DOM クリア / `engine.clear()` 委譲 / `store.clear()` 連動
- `tests/ui/widget.persist.test.ts` ✅ — `persist` / `persist-key` 属性の解決、mount 後の属性変更非追従

### 15.3 ビジュアル / 手動

- 開発者向け demo (`pnpm dev`) で attribute 組み合わせを目視確認
- production-shaped demo (`pnpm demo`) で build 済み IIFE を `<script>` 経由で読んだ実運用に近い状態を確認

### 15.4 E2E

- 現バージョンでは導入しない
- 将来 Playwright による実ブラウザ回帰を検討

---

## 16. バージョニング / リリース方針

- セマンティックバージョニングに従う
- 初版: `0.1.0` からスタートし、API が安定したと判断した時点で `1.0.0` に上げる
- API 破壊的変更はメジャーバージョンでのみ許容
- アダプタインターフェース・ストアインターフェースは一度公開したら `1.x` の間は破壊しない

---

## 17. 未対応 (将来検討)

- [ ] 複数会話（スレッド）管理・切り替え UI と、それに伴うストアのスキーマ拡張
- [ ] Tool calling / Function calling の可視化
- [ ] 添付ファイル（画像、PDF）
- [ ] 音声入出力
- [ ] コードブロックのシンタックスハイライト（依存ゼロ方針と緊張する）
- [ ] `postMessage` を使ったクロスフレーム連携
- [ ] React ラッパー
- [ ] Vue / Svelte / Solid ラッパー
- [ ] モーダルモード（フォーカストラップ付き）の任意化
- [ ] 厳格 CSP 下での外部 CSS ファイル版
- [ ] IndexedDB 版ストアの組込み factory
- [ ] aria-live コンテナでマークダウンマークアップを平文化する `markdownToPlainText` 中間表現（現状は raw Markdown 文字列を `textContent` でコピー、§10.2）

---

## Appendix A: 用語

- **FAB**: Floating Action Button。閉じ状態で隅に常駐するボタン
- **パネル**: チャット本体（履歴 + 入力欄）を包むコンテナ
- **アダプタ**: バックエンド API とウィジェットの間のインターフェース実装
- **ストア**: 履歴を永続層とやり取りするインターフェース実装

## Appendix B: 未決事項

- npm パッケージ名と公開先レジストリ（候補: `web-chat-widget` / `@cocone/web-chat-widget`）
- 初期バージョン (`0.1.0` スタート想定)

### 確定済み（決定の記録）

- **FAB 既定アイコン**: Feather "message-square" スタイルの単一パス SVG（`M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z`）。`stroke="currentColor"` で `--cw-color-on-primary` を継承、`aria-hidden="true"`。実体は `src/ui/fab.ts` の `buildChatIcon()`。差し替え API（`messages` 辞書のアイコンスロット or 名前付きスロット）は将来検討
- **`ChatStore` インターフェースは sync 統一**。async バックエンド (IndexedDB / リモート同期) は factory が async でラップして sync ストアを返すパターンで吸収する (§9.2.1)
