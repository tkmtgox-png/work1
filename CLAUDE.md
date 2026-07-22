# CLAUDE.md

このプロジェクトについてClaudeが知っておくべき情報。

## 開発方針
- GPS位置情報の取得とPWA(Service Worker)のインストールはブラウザ仕様上 `file://` 直接開きでは動作しないため、本プロジェクトに限り**GitHub Pagesで公開**し、HTTPS URL経由で動作確認・利用する方針とする(`work/使い方.md` 参照)。
- ビルドツール・フレームワークは使用しない。ES Modules(`<script type="module">`)でファイルを分割した素のHTML/CSS/JS。
- 地図はLeaflet + OpenStreetMap(CDN読み込み)。ルート探索はLeaflet Routing Machine + OSRM公開デモサーバー(取得失敗時は直線描画にフォールバック)。
- データはIndexedDB(`course-map-db`)にのみ保存し、端末間の自動同期は行わない。

## データモデル
`routes` ストア: `{ id, name, transportMode: 'walk'|'car', createdAt, updatedAt, points: [...] }`
`points`: `{ id, type: 'start'|'waypoint'|'sightseeing'|'meal', name, memo, lat, lng, order, arrivalTime }`
起点(`type: 'start'`)は1ルートにつき1件のみ。経路描画時は `[起点, ...他ポイント(order順), 起点]` で周回ルートを構成する(`js/routing.js` の `buildOrderedPoints`)。

## 将来の拡張に向けて
- GPSによる実走行/実歩行の軌跡記録: `points` と同階層に `recordedTrack: [{lat, lng, timestamp}]` を追加する形で拡張できるよう、データモデルはあえてシンプルに保っている(未実装)。
- 地図タイル自体のオフラインキャッシュは行っていない(アプリシェルのみキャッシュ)。オフライン対応を強化する場合は `sw.js` のキャッシュ戦略を見直すこと。
