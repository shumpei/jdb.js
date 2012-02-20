/*
*	IndexedDB Explorer
*	for //Build
*/

if (window.mozIndexedDB) {
	window.indexedDB = window.mozIndexedDB;
} else if (window.webkitIndexedDB) {
	window.indexedDB = window.webkitIndexedDB;

	IDBCursor = webkitIDBCursor;
	IDBDatabaseException = webkitIDBDatabaseException;
	IDBKeyRange = webkitIDBKeyRange;
	IDBTransaction = webkitIDBTransaction;
	IDBRequest = webkitIDBRequest;
	IDBFactory = webkitIDBFactory;
	IDBObjectStore = webkitIDBObjectStore;
} else if (window.msIndexedDB) {
	window.indexedDB = window.msIndexedDB;
}

var IDBEXPLORER_DATABASE  = "IDBExplorerDB";
var PREFIX_DATABASE_LIST     = "DATABASE_LIST_";
var PREFIX_OBJECTSTORE_LIST = "OBJECTSTORE_LIST_";

var PREFIX_DATABASE = "DATABASE_";
var PREFIX_OBJECTSTORE = "OBJECTSTORE_";
var PREFIX_INDEX = "INDEX_";

var idbdiv;

var g_database_list;
var g_database_info = new Array();
var g_index_info,
    g_objectstore_info,
    g_selectedRecord;

var elem = {
	a: '<a></a>',
	div: '<div></div>',
	iframe: '<iframe></iframe>',
	img: '<img>',
	li: '<li></li>',
	span: '<span></span>',
	table: '<table></table>',
	td: '<td></td>',
	th: '<th></th>',
	tr: '<tr></tr>',
	ul: '<ul><li style="display:none" class="remove_me"></li></ul>'
};

function setDBName() {
    g_database_list = new Array();
    var query = window.location.search.substring(1);
    var parms = query.split('?');

    for (var i = 0; i < parms.length; i++) {
        var pos = parms[i].indexOf('=');
        if (pos > 0) {
            var key = parms[i].substring(0, pos);
            var val = parms[i].substring(pos + 1);
            g_database_list[i] = val;
        }
    }
}

/* IndexedDB Javascript Object Wrappers */
function oDatabase(db) {
    this.name = db.name;
    this.version = db.version;
    this.objectstores = new Array();;
}

function oObjectStore(os) {
    this.name = os.name;
    this.keyPath = os.keyPath;
    this.indices = new Array();
    this.records = new Array();

    for (var i = 0; i < os.indexNames.length; i++) {
        var index_name = os.indexNames.item(i);
        var index = os.index(index_name);
        var obj = new oIndex(index);
        this.indices[index_name] = obj;
    }

    this.addRecord = function (record) {
        this.records.push(record);
    };
    return this;
}

function oIndex(index) {
    this.name = index.name;
    this.keyPath = index.keyPath;
    this.unique = index.unique;
    this.records = new Array();

    this.addRecord = function (record) {
        this.records.push(record);
    };
    return this;
}

/* IndexedDB Explorer Functions */
function addDatabaseName(databaseName) {
    $('#databaseNames').append(
		$(elem.li).attr({ id: PREFIX_DATABASE + databaseName }).append(
			$(elem.img).attr({ src: 'database5.png' }),
			$(elem.a).attr({ href: '#' }).text(databaseName).click([databaseName], refreshDatabase),
			$(elem.ul).attr({ id: PREFIX_DATABASE_LIST + databaseName })
		)
	);

    getDatabaseInfo(databaseName, displayDatabaseInfo);

    refreshTree();
}

function addIndexName(databaseName, objectStoreName, indexName) {
	if($(document.getElementById(PREFIX_OBJECTSTORE_LIST + databaseName + objectStoreName + "LIST")).attr("setup"))
	{
		$(document.getElementById(PREFIX_OBJECTSTORE_LIST + databaseName + objectStoreName + "LIST")).append(
			$(elem.ul).attr({ id: PREFIX_OBJECTSTORE_LIST + databaseName + objectStoreName })
		);
		
		$(document.getElementById(PREFIX_OBJECTSTORE_LIST + databaseName + objectStoreName + "LIST")).attr("setup", false);
	}
	
    $(document.getElementById(PREFIX_OBJECTSTORE_LIST + databaseName + objectStoreName)).append(
		$(elem.li).append(
			$(elem.img).attr({ src: 'funnel5.png' }),
			$(elem.a).attr({ href: '#', id: PREFIX_INDEX + databaseName + objectStoreName + indexName }).click([databaseName, objectStoreName, indexName], objectStoreOrIndexClicked).text(indexName),     
            $(elem.ul).append(
				$(elem.li).append($(elem.a).text('unique: ' + g_database_info[databaseName].objectstores[objectStoreName].indices[indexName].unique))
			)
		)
	);
    refreshTree();
}

function addObjectStoreName(databaseName, objectStoreName) {
    $(document.getElementById(PREFIX_DATABASE_LIST + databaseName)).append(
		$(elem.li).attr({ id: PREFIX_OBJECTSTORE_LIST + databaseName + objectStoreName + "LIST", setup: false }).append(
			$(elem.img).attr({ src: 'table6.png' }),

			$(elem.a).attr({ href: '#', id: PREFIX_OBJECTSTORE + databaseName + objectStoreName }).click([databaseName, objectStoreName, null], objectStoreOrIndexClicked).text(objectStoreName)
		)
	);
    refreshTree();
}

function displayDatabaseInfo(event) {
    var database_name = event.target.db.name;
    var database_info = g_database_info[database_name];
    $(document.getElementById(PREFIX_DATABASE_LIST + database_name)).append(
			$(elem.li).append($(elem.a).text('version: ' + g_database_info[database_name].version))
	)

    for (var object_store_name in database_info.objectstores) {
        var objectstore = database_info.objectstores[object_store_name];
        addObjectStoreName(database_info.name, objectstore.name);
        for (var index_name in objectstore.indices) {
            var index = objectstore.indices[index_name];
            addIndexName(database_info.name, objectstore.name, index.name);
        }
    }
}

function displayIndexInfo() {
    var keyPathColText;
    var ikeyPath = g_index_info.keyPath;
    var okeyPath = g_objectstore_info.keyPath;
    var records = g_index_info.records;

    if (okeyPath == undefined) {
        keyPathColText = "Keypath: <Not Set>";
    }
    else {
        keyPathColText = "Keypath: '" + okeyPath + "'";
    }

    $('#recordstable').empty().append(
		$(elem.tr).toggleClass('headerRow').append(
			$(elem.td).text(keyPathColText).toggleClass('headerCell'),
			$(elem.td).text("Index Keypath: '" + ikeyPath + "'").toggleClass('headerCell'),
			$(elem.td).text('Record').toggleClass('headerCell')
		)
	);

    if (records.length == 0) {
        $('#recordstable').append(
			$(elem.tr).append(
				$(elem.td).toggleClass('recordRow0', true).text("No Data")
            )
        );
    }
    else {
        for (var i = 0; i < records.length; i++) {
            var keyPathValue = records[i][okeyPath];
            if (keyPathValue == undefined) {
                keyPathValue = "NULL";
            }

            $('#recordstable').append(
			    $(elem.tr)
                .hover(function () { $('td', this).addClass('individualEntry') }, function () { $('td', this).removeClass('individualEntry') })
	            .click(records[i], function (event) { if (g_selectedRecord) g_selectedRecord.removeClass('selectedRecord'); g_selectedRecord = $('td', this).addClass('selectedRecord'); displayRecordInfo(event.data) })
                .append(
				    $(elem.td).toggleClass('recordRow' + (i % 2), true).text(keyPathValue),
				    $(elem.td).toggleClass('recordRow' + (i % 2), true).text(records[i][ikeyPath]),
				    $(elem.td).toggleClass('recordRow' + (i % 2), true).text(records[i].toString())
			    )
		    );
        }
    }
	
	$('#recordstable').children(0).children(0).eq(1).click();
}

function displayObjectStoreInfo() {
    var keyPathColText;
    var keyPath = g_objectstore_info.keyPath;
    var records = g_objectstore_info.records;

    if (keyPath == undefined) {
        keyPathColText = "Keypath: <Not Set>";
    }
    else {
        keyPathColText = "Keypath: '" + keyPath + "'";
    }

    $('#recordstable').empty().append(
		$(elem.tr).toggleClass('headerRow').append(
			$(elem.td).text(keyPathColText).toggleClass('headerCell'),
			$(elem.td).text('Record').toggleClass('headerCell')
		)
	);

    if (records.length == 0) {
        $('#recordstable').append(
			$(elem.tr).append(
				$(elem.td).toggleClass('recordRow0', true).text("No Data")
            )
        );
	}
    else {
        for (var i = 0; i < records.length; i++) {
            var keyPathValue = records[i][keyPath];
            if (keyPathValue == undefined) {
                keyPathValue = "NULL";
            }
            $('#recordstable').append(
			    $(elem.tr)
                .hover(function () { $('td', this).addClass('individualEntry') }, function () { $('td', this).removeClass('individualEntry') })
	            .click(records[i], function (event) { if (g_selectedRecord) g_selectedRecord.removeClass('selectedRecord'); g_selectedRecord = $('td', this).addClass('selectedRecord'); displayRecordInfo(event.data) })
                .append(
				    $(elem.td).toggleClass('recordRow' + (i % 2), true).text(keyPathValue),
				    $(elem.td).toggleClass('recordRow' + (i % 2), true).text(records[i].toString())
			    )
    		);
        }
    }
	
	$('#recordstable').children(0).children(0).eq(1).click();
}

function displayRecordInfo(record) {
    $('#recordproptable').empty().append(
        $(elem.tr).toggleClass('headerRow').append(
            $(elem.td).text('Record Property').toggleClass('headerCell'),
            $(elem.td).text('Value').toggleClass('headerCell')
        )
    );
    var i = 0;
    for (var prop in record) {
        var value = record[prop];
        $('#recordproptable').append(
            $(elem.tr).append(
                $(elem.td).attr({ valign: 'top' }).text(prop).toggleClass('recordRow' + (i % 2), true),
                $(elem.td).attr({ valign: 'top' }).text(value).toggleClass('recordRow' + (i % 2), true)
            )
        )
        i++;
    }
}

function getDatabaseInfo(database_name, next) {
    var open_request = window.indexedDB.open(database_name);
    open_request.onerror = function (event) { };
    open_request.onsuccess = function (event) {
        var db = event.target.result;

        if (db.version == "") {
            db.close();
            $(document.getElementById(PREFIX_DATABASE + database_name)).remove();
            refreshTree();
        }
        else 
		{
            var txn = db.transaction(db.objectStoreNames);

            txn.oncomplete = next;
            // The next line is required to work with the latest Chrome release
            txn.onabort = next;

            g_database_info[db.name] = new oDatabase(db);

            for (var i = 0; i < db.objectStoreNames.length; i++) {
                var object_store_name = db.objectStoreNames.item(i);
                var object_store = txn.objectStore(object_store_name)
                var obj = new oObjectStore(object_store);
                g_database_info[db.name].objectstores[object_store_name] = obj;
            }
            db.close();
        }
    }
}

function getObjectStoreOrIndexInfo(args) {
    var database_name = args[0];
    var objectstore_name = args[1];
    var index_name = args[2];

    var open_request = window.indexedDB.open(database_name);
    open_request.onerror = function (event) { };
    open_request.onsuccess = function (event) {
        var db = event.target.result;

        try {
            var txn = db.transaction([objectstore_name]);
            txn.oncomplete = function (event) {
                if (index_name) {
                    displayIndexInfo();
                } else {
                    displayObjectStoreInfo();
                }
            };

            var objectstore = txn.objectStore(objectstore_name);
            g_objectstore_info = new oObjectStore(objectstore);

            var cursor_request = objectstore.openCursor();
            if (index_name) {
                var index = objectstore.index(index_name);
                g_index_info = new oIndex(index);

                cursor_request = index.openCursor();
            }
            cursor_request.onerror = function (event) { };
            cursor_request.onsuccess = function (event) {
                var cursor = event.target.result;
                if (cursor) {
                    if (index_name) {
                        g_index_info.addRecord(cursor.value);
                    } else {
                        g_objectstore_info.addRecord(cursor.value);
                    }

                    cursor.continue();
                }
            };
        } catch (ex) {
            if (ex.code == IDBTransaction.NOT_FOUND_ERR) {
                // object store no longer exists in database OR index no longer exist on object store.
                // database view needs to be refreshed
                console.log("object store no longer exists.  database needs to be refreshed.");
            } else {
                throw ex;
            }

        }
        db.close();
    };
}

function initIDBExplorer() {
    $('body').append(
    $(elem.div).attr({ id: 'idbcontent' }).toggleClass('idbdiv', true).append(
        $(elem.div).toggleClass('titlebar').append(
            $(elem.table).append(
                $(elem.tr).append(
                    $(elem.td).text('IndexedDB Explorer') 
                    // WWA: link needed to navigate back to App page
                    /*,
                    $(elem.td).width(25).append(
                        $(elem.img).attr({ src: 'close.png' }).click(function () { history.go(-1) })
                    )
					*/
                )
            )
        ),
		$(elem.table).attr({ width: '100%' }).append(
				$(elem.tr).append(
					$(elem.td).attr({ width: '25%', valign: 'top', class: 'idbTreeContainer' }).append(
						$(elem.div).attr({ id: 'idbtree', class: 'idbTreeStyle' }).append(
							$(elem.ul).append(
								$(elem.li).append(
									$(elem.a).attr({ href: "#" }).text("Databases"),
									$(elem.ul).attr({ id: 'databaseNames' })
								)
							)
						)
					),
					$(elem.td).attr({ width: '75%', valign: 'top' }).append(
                        $(elem.div).toggleClass('idbrecordsdiv', true)
                        // WWA: sets height of records table
                        //.height((screen.availHeight) / 2)
                        .append(
							$(elem.table).attr({ id: 'recordstable' })
                        ),
                        $(elem.div).toggleClass('idbrecordsdiv', true)
                        // WWA: sets height of record view
                        //.height((screen.availHeight) / 2 - 25)
                        .append(
                            $(elem.table).attr({ id: 'recordproptable' }).append(
                                $(elem.tr).toggleClass('headerRow')
                            )
                        )
					)
				)
			)
		)
    );

    for (var i = 0; i < g_database_list.length; i++) {
        addDatabaseName(g_database_list[i]);
    }

    refreshTree();

    selectFirstObjectStore(g_database_list[0])
}

function keyPressHandler(e) {
    if (13 == e.keyCode) {
        var database_name = $('#add_new_database')[0].value;
        if (database_name.indexOf(" ") > -1)
            return;

        addDatabaseName(database_name);
        refreshTree();
    }
}

function objectStoreOrIndexClicked(event) {
    $('.highlight').toggleClass('highlight', false);
    $('.refreshHidden').toggleClass('refreshHidden', true);


    var id = PREFIX_OBJECTSTORE + event.data[0] + event.data[1];
    if (event.data[2]) {
        id = PREFIX_INDEX + event.data[0] + event.data[1] + event.data[2];
    }

    $(document.getElementById(id)).toggleClass('highlight', true)
    $(document.getElementById(id + "_refresh")).toggleClass('refreshHidden', false)

    clearRecordTable();

    getObjectStoreOrIndexInfo(event.data);
}

function clearRecordTable() {
    $('#recordproptable').empty().append(
        $(elem.tr).toggleClass('headerRow').append(
            $(elem.td).text('Record Property').toggleClass('headerCell'),
            $(elem.td).text('Value').toggleClass('headerCell')
        ),
        $(elem.tr).append(
            $(elem.td).text("No Record Selected"),
            $(elem.td).text("")
        )
    )
}

function refreshTree() {

    $('#idbtree').jstree({
        "themes": {
            "theme": "default",
            "dots": false,
            "icons": false,
        },
        "plugins": ["themes", "html_data"]
    });

    setTimeout("$('#idbtree').jstree('open_all');", 5);
}

function refreshDatabase(event) {
    var database_name = event.data[0];
    $(document.getElementById(PREFIX_DATABASE_LIST + database_name)).empty();
    getDatabaseInfo(database_name, displayDatabaseInfo);

    $('#recordstable').empty()
    selectFirstObjectStore(database_name);
    clearRecordTable();
}

function removeDatabaseName(event) {
    var database_name = event.data[0];
    $(document.getElementById(PREFIX_DATABASE + database_name)).remove();
}

function selectFirstObjectStore(databaseName) {
    delayCall = function () {
        var database_info = g_database_info[databaseName];
        if (!database_info) {
            setTimeout('selectFirstObjectStore()', 1);
            return;
        }

        for (var object_store_name in database_info.objectstores) {
            objectStoreOrIndexClicked({ data: [database_info.name, object_store_name, null] });
            break;
        }
    }

    setTimeout(this.delayCall, 500);

}



