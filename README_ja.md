# jdb.js - Framework for Indexed Database API

jdb.jsは、W3C Indexed Database APIをより直感的に扱いやすくすることを目指したライブラリです。
名前の由来は、「IDB」(Indexed DB)をより使いやすく、ということで「JDB」(Jはアルファベット順でIの次の文字です）としました。

Indexed Database APIをそのまま利用するのに比べて、jdb.jsが優っている点は以下のとおりです。

* オブジェクト指向的で使いやすいインターフェース
* JSONを使用した宣言的な形式で、オブジェクトストアの定義を行える
* 実行時の動的なDBマイグレーションを容易に(オブジェクトストアやインデックスの定義にsince:versionと指定するだけ）
* 非同期処理を直感的に記述できる(コールバック、もしくはDefered)

以下に載せるのは、jdb.jsを使用したコードスニペットです。jdb.jsの使いやすさが伝われば幸いです。IndexedDBを直接使うのに比べてコード量は半分以下、コードの保守性も大幅に上がると信じています。

    // データベースへの参照を作成
    var db = new JDBDatabase('database name', 1);

    // オブジェクトストアへの参照を作成
    var CatStore = new JDBObjectStore({
      name: 'CatStore', // オブジェクトストアの名称
      database: db,     // データベース
      key: { path: 'id', autoIncrement: true }, // キープロパティの定義
      indexes: {
        ageIdx: { path: 'age' } // インデックスの定義
      }
    });

    // データベース接続をオープン
    db.open().success(function() {
      console.log('database opened');
    });

    // オブジェクトストアにオブジェクトを格納
    CatStore.put({
      name: 'Nana',
      age: 7,
      gender: 'female'
    });

    // オブジェクトストアから値を取得
    var catId = 1;
    CatStore.get(catId, function(cat, error) {
      // 取得した結果(cat)に対して処理を行う
    });

    // 全てのネコを順次処理
    CatStore.all().iterate(function(cat) {
      ...
    });

    // 5歳以下のネコをすべて取得
    var criteria = JDBCriteria.byIndex('ageIdx').le(5);
    CatStore.criteria(criteria).list(function(cats) {
      // 全検索結果に対して処理を行う
    });

もしjdb.jsに興味を持たれたなら、次は<a href="https://sites.google.com/site/jdbjsdoc/tutorial_ja">チュートリアル</a>に進むとよいでしょう。

