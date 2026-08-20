# CLAUDE.md

このプロジェクトについてClaudeが知っておくべき情報。

## 開発方針
- GPS位置情報の取得とPWA(Service Worker)のインストールはブラウザ仕様上 `file://` 直接開きでは動作しないため、本プロジェクトに限り**GitHub Pagesで公開**し、HTTPS URL経由で動作確認・利用する方針とする(`work/使い方.md` 参照)。
- ビルドツール・フレームワークは使用しない。ES Modules(`<script type="module">`)でファイルを分割した素のHTML/CSS/JS。
- 地図はLeaflet + OpenStreetMap(CDN読み込み)。ルート探索はLeaflet Routing Machine + OSRM公開デモサーバー(取得失敗時は直線描画にフォールバック)。
- データはIndexedDB(`course-map-db`)にのみ保存し、端末間の自動同期は行わない。

## データモデル
`routes` ストア: `{ id, name, transportMode: 'walk'|'car', desiredMinutes: number|null, createdAt, updatedAt, points: [...] }`
`points`: `{ id, type: 'start'|'waypoint'|'sightseeing'|'meal', name, memo, lat, lng, order, arrivalTime, stayMinutes, included, popularity, genre }`
起点(`type: 'start'`)は1ルートにつき1件のみ。経路描画時は `[起点, ...他ポイント(order順、includedがfalseの観光スポットは除外), 起点]` で周回ルートを構成する(`js/routing.js` の `buildOrderedPoints`)。

## ルート検索機能(`js/route-search.js` + `js/nearby-search.js` + `js/app.js`)
「ルート検索」ボタンを押すと**対話式**に観光スポットを1つずつ選んでいく方式(旧・自動一括選択の`recommend.js`は廃止)。
- 押すと、そのルートの観光スポットは全て`included: false`にリセットされ、起点を「現在位置」として検索セッション(`app.js`内の`routeSearch`変数: 現在位置・使用時間・次のorder値)が始まる
- 候補リストは2種類をマージして1つのリストにする(`app.js: renderCandidateList`、非同期):
  1. **登録済み候補**: `getFeasibleCandidates(route, currentPos, usedMinutes)`が返す、`route`に既に登録済みの未選択観光スポットのうち希望時間内(戻り時間込み)に収まるもの
  2. **周辺自動検索候補**: `nearby-search.js: searchNearby(currentPos, radiusKm)`がOverpass API(OpenStreetMap)から取得する、現在位置周辺の観光スポット。ジャンルは`genreFromTags`で判定し、対応タグは以下の通り(`js/nearby-search.js`の`TOURISM_TAGS`/`HISTORIC_TAGS`と個別clause):
     - `tourism`: museum(博物館)・zoo(動物園)・aquarium(水族館)・gallery(美術館)・theme_park(テーマパーク)・viewpoint(展望スポット)・artwork(アート・記念碑)・garden(庭園)・attraction(観光名所)
     - `historic`: castle(城)・fort(砦)・monument/memorial(記念碑)・ruins(史跡)・shrine(神社)・temple(寺)
     - `amenity=place_of_worship`(神社/寺/宗教施設、`religion`タグで判定)・`amenity=marketplace`(市場)
     - `leisure=park`(公園)・`natural=waterfall`(滝)・`man_made=tower`(タワー・展望施設)
     - 検索半径は`route-search.js: estimateSearchRadiusKm`で残り時間から概算(上限8km)。取得件数は80件・タイムアウト20秒でクランプし(`RESULT_LIMIT`/`FETCH_TIMEOUT_MS`)、登録済みポイントと近すぎる(30m以内)ものは重複として除外
  - 2つを合わせて**現在位置からの移動時間が近い順**にソートして表示。登録済み候補は人気度(★1〜5)、周辺検索候補はジャンルを補足表示する
- 候補を1つ選ぶと、登録済みなら`included: true`・`order`確定、周辺検索由来なら`newPoint()`で新規の観光スポット(`popularity: 3`の仮値、`genre`をセット)としてルートに追加してから同様に確定。内部の「現在位置」がそのポイントに移り、候補リストが再計算される(**滞在時間はこの時間予算の計算には使わない**、移動時間のみ)
- 経由地・食事(`waypoint`/`meal`)はこの検索の対象外(時間予算にもカウントされない)。従来通りルートには含まれ続ける
- 移動時間は直線距離(ハーバサイン公式)×迂回係数1.3を徒歩4km/h・車20km/hの一定速度で見積もる簡易計算(`travelMinutes`)。実際の経路描画(Leaflet Routing Machine)とは独立
- 候補が無くなると自動的にリストが空になり終了メッセージを表示。「ここで確定」ボタンでいつでも終了できる(それまでの選択は選んだ時点で都度保存済み)
- Overpass APIが失敗・タイムアウトした場合は空配列を返し、登録済み候補のみで続行する(`nearby-search.js`内でcatch)
- 既存データ(`stayMinutes`/`included`/`popularity`/`genre`が無い過去のポイント)は、`included !== false`(未定義なら含む)・`popularity`未設定時は3・`genre`未設定時は空文字として扱う後方互換を維持している(`js/points.js` の `newPoint`)

## 将来の拡張に向けて
- GPSによる実走行/実歩行の軌跡記録: `points` と同階層に `recordedTrack: [{lat, lng, timestamp}]` を追加する形で拡張できるよう、データモデルはあえてシンプルに保っている(未実装)。
- 地図タイル自体のオフラインキャッシュは行っていない(アプリシェルのみキャッシュ)。オフライン対応を強化する場合は `sw.js` のキャッシュ戦略を見直すこと。
