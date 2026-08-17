# CLAUDE.md

このプロジェクトについてClaudeが知っておくべき情報。

## 開発方針
- GPS位置情報の取得とPWA(Service Worker)のインストールはブラウザ仕様上 `file://` 直接開きでは動作しないため、本プロジェクトに限り**GitHub Pagesで公開**し、HTTPS URL経由で動作確認・利用する方針とする(`work/使い方.md` 参照)。
- ビルドツール・フレームワークは使用しない。ES Modules(`<script type="module">`)でファイルを分割した素のHTML/CSS/JS。
- 地図はLeaflet + OpenStreetMap(CDN読み込み)。ルート探索はLeaflet Routing Machine + OSRM公開デモサーバー(取得失敗時は直線描画にフォールバック)。
- データはIndexedDB(`course-map-db`)にのみ保存し、端末間の自動同期は行わない。

## データモデル
`routes` ストア: `{ id, name, transportMode: 'walk'|'car', desiredMinutes: number|null, createdAt, updatedAt, points: [...] }`
`points`: `{ id, type: 'start'|'waypoint'|'sightseeing'|'meal', name, memo, lat, lng, order, arrivalTime, stayMinutes, included, popularity }`
起点(`type: 'start'`)は1ルートにつき1件のみ。経路描画時は `[起点, ...他ポイント(order順、includedがfalseの観光スポットは除外), 起点]` で周回ルートを構成する(`js/routing.js` の `buildOrderedPoints`)。

## ルート検索機能(`js/route-search.js` + `js/app.js`)
「ルート検索」ボタンを押すと**対話式**に観光スポットを1つずつ選んでいく方式(旧・自動一括選択の`recommend.js`は廃止)。
- 押すと、そのルートの観光スポットは全て`included: false`にリセットされ、起点を「現在位置」として検索セッション(`app.js`内の`routeSearch`変数: 現在位置・使用時間・次のorder値)が始まる
- 候補リストは、`getFeasibleCandidates(route, currentPos, usedMinutes)`が「現在位置からの移動時間 + 使用済み時間 + そのスポットから起点への戻り時間」が`route.desiredMinutes`以内に収まる観光スポットだけを、人気度(`popularity`、★1〜5)降順→移動時間昇順で返す
- 候補を1つ選ぶと、そのポイントが`included: true`になり周回順(`order`)が確定、内部の「現在位置」がそのポイントに移り、候補リストが再計算される(**滞在時間はこの時間予算の計算には使わない**、移動時間のみ)
- 経由地・食事(`waypoint`/`meal`)はこの検索の対象外(時間予算にもカウントされない)。従来通りルートには含まれ続ける
- 移動時間は直線距離(ハーバサイン公式)×迂回係数1.3を徒歩4km/h・車20km/hの一定速度で見積もる簡易計算(`travelMinutes`)。実際の経路描画(Leaflet Routing Machine)とは独立
- 候補が無くなると自動的にリストが空になり終了メッセージを表示。「ここで確定」ボタンでいつでも終了できる(それまでの選択は選んだ時点で都度保存済み)
- 既存データ(`stayMinutes`/`included`/`popularity`が無い過去のポイント)は、`included !== false`(未定義なら含む)・`popularity`未設定時は3として扱う後方互換を維持している(`js/points.js` の `newPoint`)

## 将来の拡張に向けて
- GPSによる実走行/実歩行の軌跡記録: `points` と同階層に `recordedTrack: [{lat, lng, timestamp}]` を追加する形で拡張できるよう、データモデルはあえてシンプルに保っている(未実装)。
- 地図タイル自体のオフラインキャッシュは行っていない(アプリシェルのみキャッシュ)。オフライン対応を強化する場合は `sw.js` のキャッシュ戦略を見直すこと。
