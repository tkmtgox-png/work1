# CLAUDE.md

このプロジェクトについてClaudeが知っておくべき情報。

## 開発方針
- GPS位置情報の取得とPWA(Service Worker)のインストールはブラウザ仕様上 `file://` 直接開きでは動作しないため、本プロジェクトに限り**GitHub Pagesで公開**し、HTTPS URL経由で動作確認・利用する方針とする(`work/使い方.md` 参照)。
- ビルドツール・フレームワークは使用しない。ES Modules(`<script type="module">`)でファイルを分割した素のHTML/CSS/JS。
- 地図はLeaflet + OpenStreetMap(CDN読み込み)。ルート探索はLeaflet Routing Machine + OSRM公開デモサーバー(取得失敗時は直線描画にフォールバック)。
- データはIndexedDB(`course-map-db`)にのみ保存し、端末間の自動同期は行わない。

## データモデル
`routes` ストア: `{ id, name, transportMode: 'walk'|'car', desiredMinutes: number|null, createdAt, updatedAt, points: [...] }`
`points`: `{ id, type: 'start'|'waypoint'|'sightseeing'|'meal', name, memo, lat, lng, order, arrivalTime, stayMinutes, included }`
起点(`type: 'start'`)は1ルートにつき1件のみ。経路描画時は `[起点, ...他ポイント(order順、includedがfalseの観光スポットは除外), 起点]` で周回ルートを構成する(`js/routing.js` の `buildOrderedPoints`)。

## おすすめルート機能(`js/recommend.js`)
起点・経由地・食事は必須ポイントとして常にルートに含め、観光スポット(`sightseeing`)だけを`route.desiredMinutes`(希望時間・分)に収まる範囲で自動選択する。
- 移動時間は正確な道なり経路ではなく、2点間の直線距離(ハーバサイン公式)×迂回係数1.3を、徒歩4km/h・車20km/hの一定速度で見積もる簡易計算(`travelMinutes`)。実際の経路描画(Leaflet Routing Machine)とは独立している
- 選択アルゴリズムは「最安挿入」の貪欲法: 現在の巡回順に対し、挿入コスト(移動時間の増分+滞在時間)が最も低い観光スポットから順に追加し、希望時間を超える時点で打ち切る(`recommendRoute`)
- 実行すると、選ばれなかった観光スポットは`included: false`になり、地図上は半透明表示・ルート線からは除外される(データは保持されるので削除はされない)。ユーザーはポイント編集モーダルの「このルートに含める」チェックボックスで手動でも切り替えられる
- 既存データ(`stayMinutes`/`included`が無い過去のポイント)は、`included !== false`(未定義なら含む)として扱う後方互換を維持している(`js/points.js` の `newPoint`)

## 将来の拡張に向けて
- GPSによる実走行/実歩行の軌跡記録: `points` と同階層に `recordedTrack: [{lat, lng, timestamp}]` を追加する形で拡張できるよう、データモデルはあえてシンプルに保っている(未実装)。
- 地図タイル自体のオフラインキャッシュは行っていない(アプリシェルのみキャッシュ)。オフライン対応を強化する場合は `sw.js` のキャッシュ戦略を見直すこと。
