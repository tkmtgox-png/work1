# CLAUDE.md

このプロジェクトについてClaudeが知っておくべき情報。

## 開発方針
- GPS位置情報の取得とPWA(Service Worker)のインストールはブラウザ仕様上 `file://` 直接開きでは動作しないため、本プロジェクトに限り**GitHub Pagesで公開**し、HTTPS URL経由で動作確認・利用する方針とする(`work/使い方.md` 参照)。
- ビルドツール・フレームワークは使用しない。ES Modules(`<script type="module">`)でファイルを分割した素のHTML/CSS/JS。
- 地図はLeaflet + OpenStreetMap(CDN読み込み)。ルート探索はLeaflet Routing Machine + OSRM公開デモサーバー(取得失敗時は直線描画にフォールバック)。
- データはIndexedDB(`course-map-db`)にのみ保存し、端末間の自動同期は行わない。
- 動作確認のためにローカルサーバー(`python -m http.server` 等)やその他のバックグラウンドプロセスを起動した場合、実装・確認作業が完了したら**必ず停止すること**(ポートを開いたまま放置しない)。停止後はポートが応答しないことまで確認する。テストのために一時的に緩めた設定(公開範囲・認証・デバッグ用の穴など、脆弱性になり得るもの全般)も同様に、作業完了後は必ず元に戻す。

## データモデル
`routes` ストア: `{ id, name, transportMode: 'walk'|'car', desiredMinutes: number|null, createdAt, updatedAt, points: [...] }`
`points`: `{ id, type: 'start'|'waypoint'|'sightseeing'|'meal', name, memo, lat, lng, order, arrivalTime, stayMinutes, included, popularity, genre, locked }`
起点(`type: 'start'`)は1ルートにつき1件のみ。経路描画時は `[起点, ...他ポイント(order順、includedがfalseの観光スポットは除外), 起点]` で周回ルートを構成する(`js/routing.js` の `buildOrderedPoints`)。

## ルート検索機能(`js/route-search.js` + `js/nearby-search.js` + `js/app.js`)
「ルート検索」ボタンを押すと**対話式**に観光スポットを1つずつ選んでいく方式(旧・自動一括選択の`recommend.js`は廃止)。
- 押すと、そのルートの観光スポットは`locked: true`(固定)のものを除いて`included: false`にリセットされる。固定ポイントは`included: true`のまま必ずルートに残り、時間判定(候補の絞り込み)の対象にもならない(`getFeasibleCandidates`の`included !== true`フィルタで自動的に除外されるため追加のフィルタ処理は不要)。固定ポイントが複数ある場合は`optimizeVisitOrder(start, lockedPoints)`(下記)で起点からの巡回順を概算し、その分の移動時間・到達地点を検索セッションの初期値(`app.js`内の`routeSearch`変数: 現在位置・使用時間・次のorder値)として使う
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
- モーダル右上に閉じる用の「×」(`#route-search-close`)があり、「ここで確定」(`#route-search-finish`)と全く同じ`closeRouteSearch`を呼ぶだけ(選択済み内容の巻き戻しはしない、単に閉じるだけ)
- モーダル上部の「ジャンルで絞り込み」プルダウン(`#route-search-genre-filter`)は、Overpassへの再検索はせず、取得済みの候補一覧(`routeSearch.lastMerged`)をクライアント側でジャンル一致フィルタするだけ(`app.js: renderFilteredCandidates`)。選択肢は現在の候補に含まれるジャンルから動的に生成し(`updateGenreFilterOptions`)、選択中のジャンルが次の候補一覧にも存在すれば維持する。登録済み候補も`genre`が設定されていればジャンル絞り込みの対象になる(手動登録でジャンル未設定の場合は「すべて」以外では表示されない)
- ポイント編集モーダルの「ルート検索でも固定(必ず含める)」チェックボックス(`#point-locked`、`point.locked`)は、そのポイントをルート検索のリセット・候補選び自体の対象から外し、常にルートに残す機能。検索で追加した「絶対行きたい場所」などに使う想定

## 巡回順の最適化(`js/route-search.js: optimizeVisitOrder` + `js/app.js: handleOptimizeOrder`)
- `optimizeVisitOrder(startPoint, points)`: 直線距離(`haversineKm`)ベースで、最近傍法により初期巡回順を作り、2-opt(隣接しない2辺を入れ替えて総距離が縮むなら採用、を改善が無くなるまで繰り返す)で改善して返す。移動手段による速度差は全区間に一律にかかるため順位に影響せず、`transportMode`は受け取らない。ポイント数が少ない(実用上10〜20件程度)前提の総当たりで十分な速度が出る
- 用途は2箇所: ①`openRouteSearch()`内で固定ポイントの巡回順を決めるため、②サイドパネルの「順番を最適化」ボタン(`#optimize-order-btn`、`app.js: handleOptimizeOrder`)。後者は起点必須・`type==="sightseeing" && included !== false`のポイントが2件以上必要(未満ならalertで案内)で、経由地・食事の最大`order`の次の値から結果順に`order`を採番し直す。経由地・食事自体の順序・位置は変更しない(新規選択は必ずそれらの後、という既存の並び規則を踏襲)
- ルート検索を使わず手動追加だけのルートでも独立して使える。実際の道路事情(信号・坂道等)は考慮しない直線距離ベースの概算であり、既存のルート検索の移動時間見積もりと同様「あくまで目安」

## 場所の検索機能(`js/geocode.js: searchPlaces` + `js/app.js`)
地図左上の検索ボックス(`#place-search`)に地名・住所を入力すると、Nominatim(OpenStreetMap)の`/search`エンドポイントで順ジオコーディングを行い、候補を最大5件リスト表示する(`#place-search-results`)。`searchPlaces`は表示用のフル住所(`label`)とポイント名初期値用の短い名前(`name`、`display_name`の最初のカンマ区切り部分)の両方を返す。候補を選ぶと`map.setView`で地図がその地点へ移動し、一時的な目印マーカー(`searchResultMarker`)を1つ立てる。既存の逆ジオコーディング(`reverseGeocode`、座標→地名、ポイント追加時の名前自動入力に使用)とは対称的な機能。
- サイドパネル(`#panel`)を開いている間は検索ボックス・結果ドロップダウンを`hidden`クラスで一時非表示にする(`js/app.js`の`panelToggle`/`panelClose`のクリックハンドラ)。パネルのz-indexが検索ボックスより高く、パネル幅が画面幅の85%まで広がり得るため、重なって隠れてしまうのを避けるための対応。閉じると検索ボックスのみ再表示(結果ドロップダウンは再表示しない)
- 目印マーカーのポップアップ(`app.js: buildSearchResultPopup`)には「ポイントとして追加」ボタンがあり、押すと`openPointModal({mode:"add", latlng, defaultType, defaultName})`で既存のポイント追加モーダルを開く。`defaultType`はそのルートに起点が無ければ`"start"`、あれば`"sightseeing"`。`defaultName`には検索結果のラベルを渡し、この場合は逆ジオコーディングによる名前の自動入力(`fillNameFromMap`)をスキップする。保存後は一時マーカーを消す(`clearSearchResultMarker`、新しいポイントのマーカーと重複しないように)

## 地図移動まわりの挙動(`js/app.js` + `js/map.js`)
- ルート切り替え時、そのルートに起点があれば`focusOnRouteStart(route)`(`app.js`)が地図をその起点へ`map.setView([lat,lng], 15)`で移動する。呼び出し箇所はルート選択(`#route-select`のchange)・新規ルート作成・ルート削除後の3箇所(いずれも`currentRoute`が別のルートに切り替わるタイミング)。起点が無いルートでは何もしない。初期表示(アプリ起動時に最初のルートを選ぶ処理)には適用していない。`map.js: initMap()`が既に非同期でGPSの現在地へ一度地図を寄せる処理を持っており、そこに割り込ませるとGPS取得タイミング次第で表示がちらつくため
- 「現在地をリアルタイム表示」トグル(`#track-location-toggle`)はデフォルトでON。`index.html`側で`checked`属性を付け、`app.js: init()`側でもチェック状態に合わせて`locationTracker.start()`を自動実行し、見た目と実際の追跡開始を一致させている
- 地図右下(ズームボタンの少し上)に「現在地に移動」ボタン(`#locate-btn`)をフローティング配置。クリックすると`map.js: locateOnce(map, onStatus)`が一度きりの`getCurrentPosition`で地図を現在地に移動する(リアルタイム追跡のON/OFFとは独立して常に使える)。エラーメッセージは既存の`#location-status`(サイドパネル内)にそのまま表示するため、パネルを閉じていると見えない点は「現在地をリアルタイム表示」トグルのエラー表示と同じ制約

## 将来の拡張に向けて
- GPSによる実走行/実歩行の軌跡記録: `points` と同階層に `recordedTrack: [{lat, lng, timestamp}]` を追加する形で拡張できるよう、データモデルはあえてシンプルに保っている(未実装)。
- 地図タイル自体のオフラインキャッシュは行っていない(アプリシェルのみキャッシュ)。オフライン対応を強化する場合は `sw.js` のキャッシュ戦略を見直すこと。
