# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

`web-chat-widget` は、任意の Web ページに埋め込み可能なフローティング型 AI チャット UI の配布パッケージ。依存ゼロ・Web 標準のみで構成し、npm import と `<script>` タグ埋め込みの両方に対応する。

**現状**: 仕様策定済み・実装はこれから。`src/` には Vite ボイラープレート (`main.ts` / `counter.ts`) が残っている段階で、プロダクション実装はまだない。実装時は [docs/SPEC.md](./docs/SPEC.md) を単一の情報源とすること。

## 開発コマンド

パッケージマネージャは pnpm（`pnpm-lock.yaml` あり）。Node バージョンは Volta で `24.15.0` にピン留めされている。

| コマンド | 用途 |
| --- | --- |
| `pnpm dev` | Vite dev server。現状は Vite ボイラープレート画面。実装後は demo ページ |
| `pnpm build` | `tsc && vite build`。library mode への切り替えは未実装 (SPEC §12 参照) |
| `pnpm check` | Biome で lint / format チェック |
| `pnpm check:write` | Biome で自動修正 |
| `pnpm test` | Vitest を 1 回実行 |
| `pnpm test:watch` | Vitest watch モード |

単一テスト実行は Vitest 標準: `pnpm test -- path/to/file.test.ts` または `pnpm test -- -t "テスト名"`。

## アーキテクチャの不変条件

実装に着手する際に絶対に守るべき設計制約（SPEC で確定済み）:

- **ランタイム依存ゼロ**。`dependencies` / `peerDependencies` を増やさない。Markdown パーサ・SSE パーサなども自前で書く
- **UI は Shadow DOM 内に閉じる**。外部 CSS 干渉を遮断するため `Custom Element + Shadow DOM` を採用。スタイルは JS バンドル内に文字列として埋め込み、Shadow Root 内に `<style>` として注入する
- **Engine / UI 分離**。`src/core/engine.ts` は DOM 非依存のロジック層（状態・adapter 呼び出し・`EventTarget` 継承）。UI (`src/ui/`) は Engine を受け取って描画するだけ。v2 の React ラッパーで Engine を再利用するための前提
- **アダプタインターフェース**: `send(messages, signal): AsyncIterable<AdapterChunk>` に統一。ストリーミング / 非ストリーミングとも同じ形で扱う
- **非モーダル**。パネルを開いても背景ページの操作を塞がない。`role="complementary"`、`aria-modal` は付けない、フォーカストラップなし
- **XSS 対策**: `innerHTML` / `insertAdjacentHTML` を使わない。Markdown パーサはトークン列から `createElement` + `textContent` で DOM を組み立てる。リンクは `^https?://` のみ許可

## エントリポイントと配布

SPEC §3, §12 で確定済みの構成。実装時はこれを守る。

- `src/index.ts` — 副作用なし。`ChatWidget` クラスと型を export
- `src/element.ts` — 副作用で `customElements.define('chat-widget', …)` を実行
- `src/adapters/index.ts` — `createOpenAISseAdapter` / `createJsonAdapter`
- `src/iife.ts` — IIFE ビルド用。`window.ChatWidget` を組み立てる
- `package.json` の `exports` は `"."` / `"./element"` / `"./adapters"` / `"./react"` (v2 予約)

`dev` / `build` の両立のため、`vite.config.ts` は未作成だが library mode を想定。demo ページは現行 `index.html` + `src/main.ts` を書き換えて使う方針。

## ドキュメント参照

- [docs/SPEC.md](./docs/SPEC.md) — 仕様の単一情報源。API 形状、Markdown 対応範囲、CSS 変数一覧、テスト戦略まですべてここにある
- [README.md](./README.md) — 外向けの Quick Start とサンプル

仕様に関する判断は SPEC を更新してから実装すること。実装を先に進めて SPEC と乖離させない。

## テスト駆動開発 (TDD)

このプロジェクトは **test-first / red-green-refactor** で進める。実装コード (`src/` 配下) を書く前に、必ず失敗するテストを `tests/` 配下に書く。

### サイクル

1. **Red**: 仕様に対応する失敗するテストを 1 ケース書く (`pnpm test` が赤)
2. **Green**: テストを通す最小のコードを書く（過度な汎用化・先回り実装は禁止）
3. **Refactor**: テストが通ったまま、重複・可読性・命名を整える

### 固定ルール

- 実装には必ず対応するテストが先行する（同一コミットに同居でも可、ただしテストなしのコミットは不可）
- テスト未書きの実装を merge にかけない
- 例外: 型定義のみの変更、デモページの見た目調整、ドキュメント変更、設定ファイル
- テストは「振る舞い」を書く（内部実装ではなく public API 経由）
- 1 ケース 1 シナリオ。巨大な `it(...)` に複数の主張を詰め込まない
- 開発中は `pnpm test:watch` を常時稼働させ、red → green の切り替わりを目視する

### ディレクトリ配置

- `tests/core/markdown.test.ts` のように、`src/` のパスを `tests/` にミラー
- 複数モジュールの結合テストは `tests/integration/` に集約
- Vitest 環境は happy-dom（Custom Elements / Shadow DOM のため）
- SPEC §14 と整合させる

### 補助ツール

- [test-writer サブエージェント](./.claude/agents/test-writer.md) — SPEC から失敗するテストを書き起こす
- [security-reviewer サブエージェント](./.claude/agents/security-reviewer.md) — XSS / CSP / リンクサニタイズ / プロンプトインジェクション耐性を監査
- `/tdd <feature>` スキル ([.claude/skills/tdd/SKILL.md](./.claude/skills/tdd/SKILL.md)) — TDD サイクルを開始

### 条件付きルール (`.claude/rules/`)

以下のルールファイルは該当パスを Claude が読み込んだ瞬間に自動ロードされる。アーキテクチャ不変条件をその場で思い出すための最小プロンプト。

| ルール | 適用パス |
| --- | --- |
| [shadow-dom-ui.md](./.claude/rules/shadow-dom-ui.md) | `src/ui/**`, `src/element.ts`, `src/iife.ts` |
| [adapters.md](./.claude/rules/adapters.md) | `src/adapters/**` |
| [zero-deps.md](./.claude/rules/zero-deps.md) | `package.json`, `src/**/*.ts` |
| [tests.md](./.claude/rules/tests.md) | `tests/**`, `vitest.config.*` |

## コードスタイル

- Biome を採用 (`biome.json` はデフォルト設定)。`pnpm check` が通ることが前提
- TypeScript 6 の strict + `verbatimModuleSyntax` + `erasableSyntaxOnly`。`import type` を正しく使う必要あり
- `tsconfig.json` は `noEmit: true`。型定義生成は `tsconfig.build.json` を別立てする方針 (SPEC §12.2)

## 言語方針

- **README、コミットメッセージ、コード内コメント、identifier はすべて英語で書く**
- `docs/SPEC.md` と本 CLAUDE.md、ユーザーとの対話は日本語のまま
- コード内コメントは最小限に留める（WHY が非自明な場合のみ）。英語で簡潔に書く
