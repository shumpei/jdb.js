"use strict";
(function(_global) {
    var slice = Array.prototype.slice;
    function assert(expr, errorMessage) {
	if (!expr) {
	    throw errorMessage;
	}
	return true;
    }
    function capitalize(s) {
	return s.charAt(0).toUpperCase() + s.substring(1);
    }
    function extend(dest, src) {
	for (var i in src) {
	    dest[i] = src[i];
	}
	return dest;
    }
    function prefixed(name) {
	if (_global[name]) {
	    return _global[name];
	}
	var name = capitalize(name);
	return _global['webkit' + name] ||
	    _global['moz' + name] ||
	    _global['o' + name] ||
	    _global['ms' + name];
    }
    var indexedDB = _global.indexedDB = prefixed('indexedDB');
    var IDBDatabase = _global.IDBDatabase = prefixed('IDBDatabase');
    var IDBCursor = _global.IDBCursor = prefixed('IDBCursor');
    var IDBKeyRange = _global.IDBKeyRange = prefixed('IDBKeyRange');
    var IDBTransaction = _global.IDBTransaction = prefixed('IDBTransaction');

    var OpenDatabaseResult = function(req) {
	this.idbRequest = req;
    };
    OpenDatabaseResult.prototype = {
	error: function(callback) {
	    this.idbRequest.addEventListener('error', callback, false);
	    return this;
	},
	success: function(callback) {
	    var req = this.idbRequest;
	    req.addEventListener('success', callback, false);
	    return this;
	}
    };
    var Database = function(name, version) {
	this.name = name;
	this.version = version;
	this.stores = {};
    };
    Database.prototype = {
	getStoreNames: function() {
	    return Object.keys(this.stores);
	},
	transaction: function(fn, options) {
	    options = options || {};
	    var mode = options.mode;
	    if (typeof mode !== 'number') {
		mode = IDBTransaction.READ_WRITE;
	    }
	    return executeInCurrentTransaction(
		fn,
		this,
		mode,
		options.stores,
		options.onAbort,
		options.onComplete,
		options.onError);
	},
	open: function(onSuccess, onError) {
	    var self = this;
	    console.log('name:' + this.name + ',version:' + this.version);
	    var r = indexedDB.open(this.name, this.version);
	    if (typeof onSuccess === 'function') {
		r.addEventListener('success', function() {
		    self.idbDatabase = r.result;
		    onSuccess();
		}, false);
	    }
	    if (typeof onError === 'function') {
		r.addEventListener('error', onError, false);
	    }
	    r.onupgradeneeded = function(e) {
		var db = self.idbDatabase = r.result;
		var tx = r.transaction;
		var oldVersion = e.oldVersion || 0;
		var newVersion = e.newVersion;
		console.log("oldVersion:" + oldVersion + " newVersion:" + newVersion);
		var migrationOps = [];
		function addMigrationOp(version, fn) {
		    // version is started by 1 (not 0)
		    var index = version - 1;
		    var ops = migrationOps[index];
		    if (ops === undefined) {
			ops = migrationOps[index] = [];
		    }
		    ops.push(fn);
		}
		
		var scheme = self.stores;
		for (var storeName in scheme) {
		    var storeDef = scheme[storeName];
		    var since = storeDef.since || 1;
		    if (typeof since === 'number' &&
			oldVersion < since &&
			since <= newVersion) {
			var createObjectStoreOp = function(_storeName, _opts) {
			    return function(db) {
				console.log('create object store:' + _storeName + ', keyPath:' + _opts.keyPath + ', autoIncrement:' + _opts.autoIncrement);
				db.createObjectStore(_storeName, _opts);
			    };
			};
			var keyDef = storeDef.key;
			var options = {
			    keyPath: keyDef.path,
			    autoIncrement: keyDef.autoIncrement
			};
			addMigrationOp(since, createObjectStoreOp(storeName, options));
		    }
		    var indexes = storeDef.indexes;
		    for (var indexName in indexes) {
			var indexDef = indexes[indexName];
			var since = indexDef.since || 1;
			if (typeof since === 'number' &&
			    oldVersion < since &&
			    since <= newVersion) {
			    var createIndexOp = function(_storeName, _indexName, _keyPath, _opts) {
				return function(db) {
				    var objectStore = tx.objectStore(_storeName);
				    console.log('create index:[storeName=' + _storeName + '][indexName='+ _indexName + '][keyPath=' + _keyPath + ']');
				    objectStore.createIndex(_indexName, _keyPath, _opts);
				};
			    };
			    var opts = {
				unique: indexDef.unique,
				multientry: indexDef.multientry
			    };
			    addMigrationOp(since, createIndexOp(storeName, indexName, indexDef.path, opts));
			}
		    }
		}
		var db = r.result;
		for (var i = oldVersion, m = migrationOps.length; i < m; i++) {
		    var versionChangeOps = migrationOps[i];
		    for (var j = 0, n = versionChangeOps.length; j < n; j++) {
			versionChangeOps[j](db);
		    }
		}
	    };
	    return new OpenDatabaseResult(r);
	}
    };
    var currentTransaction;
    var executeInCurrentTransaction = function(fn, database, mode, stores, onAbort, onComplete, onError) {
	if (!currentTransaction) {
	    currentTransaction = new Transaction(database, mode, stores, onAbort, onComplete);
	}
	try {
	    return currentTransaction.execute(fn);
	} finally {
	    currentTransaction = null;
	}
    };
    
    var Transaction = function(database, mode, stores, onAbort, onComplete, onError) {
	this.database = database;
	this.mode = mode;
	this.active = false;
	this.onAbort = onAbort;
	this.onError = onError;
	this.onComplete = onComplete;
	var storeNames = [];
	if (stores === null || stores === undefined) {
	    storeNames = slice.call(database.storeNames);
	} else {
	    if (stores instanceof Array) {
		stores.forEach(function(store) {
		    if (store instanceof ObjectStore) {
			storeNames.push(store.name);
		    } else if (typeof store === 'string') {
			storeNames.push(store);
		    }
		});
	    } else if (stores instanceof ObjectStore) {
		storeNames.push(stores.name);
	    } else if (typeof stores === 'string') {
		storeNames.push(stores);
	    } else {
		throw 'could not process argument[stores]:' + stores;
	    }
	}
	this.storeNames = storeNames;
    };
    Transaction.prototype = {
	begin: function() {
	    var db = this.database.idbDatabase;
	    var tx = this.idbTransaction = db.transaction(this.storeNames, this.mode);
	    if (typeof this.onError === 'function') {
		tx.addEventListener('error', this.onError, false);
	    }
	    if (typeof this.onComplete === 'function') {
		tx.addEventListener('complete', this.onComplete, false);
	    }
	    if (typeof this.onAbort === 'function') {
		tx.addEventListener('abort', this.onAbort, false);
	    }
	    this.active = true;
	},
	abort: function() {
	    if (!this.active) {
		throw "Transaction is not active";
	    }
	    this.idbTransaction.abort();
	},
	execute: function(fn) {
	    this.begin();
	    try {
		return fn(this);
	    } catch (e) {
		this.abort();
		throw e;
	    }
	}
    };
    function ObjectStoreQuery(objectStore) {
	this.store = objectStore;
	this.filters = [];
    }
    ObjectStoreQuery.prototype = {
	range: function(/* keyPath? range, direction? */) {
	    var path, range, direction;
	    if (typeof arguments[0] === 'string') {
		path = arguments[0];
		range = arguments[1];
		direction = arguments[2];
	    } else {
		range = arguments[0];
		direction = arguments[1];
	    }
	    this.keyRange = {
		path: path,
		range: range,
		direction: direction
	    };
	    return this;
	},
	filter: function(filter) {
	    this.filters.push(filter);
	    return this;
	},
	iterate: function(callback) {
	    var self = this;
	    var keyRange = self.keyRange || {};
	    var filters = self.filters;
	    return executeInCurrentTransaction(
		function(tx) {
		    var idbObjectStore = tx.idbTransaction.objectStore(self.store.name);
		    var r = idbObjectStore.openCursor(keyRange.range, keyRange.direction);
		    r.onsuccess = function() {
			var cursor = r.result;
			if (!cursor) {
			    return;
			}
			var value = cursor.value;
			for (var i = 0, n = filters.length; i < n; i++) {
			    if (!filters[i](value)) {
				cursor['continue']();
				return;
			    }
			}
			var ret = callback(value);
			if (ret !== false)
			    cursor['continue']();
		    };
		    r.onerror = function() {
			callback(undefined, r.error);
		    };
		},
		self.store.database,
		IDBTransaction.READ_ONLY,
		self.store);
	},
	list: function(callback) {
	    var self = this;
	    var results = [];
	    var keyRange = self.keyRange || {};
	    var filters = self.filters;
	    return executeInCurrentTransaction(
		function(tx) {
		    var idbObjectStore = tx.idbTransaction.objectStore(self.store.name);
		    var r = idbObjectStore.openCursor(keyRange.range, keyRange.direction);
		    r.onsuccess = function() {
			var cursor = r.result;
			if (!cursor) {
			    callback(results);
			    return;
			}
			var value = cursor.value;
			for (var i = 0, n = filters.length; i < n; i++) {
			    if (!filters[i](value)) {
				cursor['continue']();
				return;
			    }
			}
			results.push(value);
			if (ret !== false)
			    cursor['continue']();
		    };
		    r.onerror = function() {
			callback(undefined, r.error);
		    };
		},
		self.store.database,
		IDBTransaction.READ_ONLY,
		self.store);
	}
    };
    function StoreOperationResult(req) {
	this.idbRequest = req;
    }
    StoreOperationResult.prototype = {
	error: function(callback) {
	    this.idbRequest.addEventListener('error', callback, false);
	    return this;
	},
	success: function(callback) {
	    var req = this.idbRequest;
	    req.addEventListener('success', function() {
		callback(req.result);
	    }, false);
	    return this;
	}
    };

    var ObjectStore = function(options) {
	assert(options.name, 'param "name" is required');
	assert(options.database instanceof Database, 'param "database" must be instance of JDBDatabase');
	assert(options.key, 'param "key" is required');

	this.name = options.name;
	this.database = options.database;
	this.key = options.key;
	this.indexes = options.indexes;
	this.since = options.since;
	this.database.stores[this.name] = this;
    };
    ObjectStore.prototype = {
	put: function(obj, callback) {
	    var self = this;
	    return executeInCurrentTransaction(
		function(tx) {
		    var idbObjectStore = tx.idbTransaction.objectStore(self.name);
		    var r = idbObjectStore.put(obj);
		    if (typeof callback === 'function') {
			r.addEventListener('success', function() {
			    callback(r.result);
			}, false);
			r.addEventListener('error', function() {
			    callback(undefined, r.error);
			}, false);
		    }
		    return new StoreOperationResult(r);
		},
		this.database,
		IDBTransaction.READ_WRITE,
		this);
	},
	get: function(key, callback) {
	    var self = this;
	    return executeInCurrentTransaction(
		function(tx) {
		    var idbObjectStore = tx.idbTransaction.objectStore(self.name);
		    var r = idbObjectStore.get(key);
		    if (typeof callback === 'function') {
			r.addEventListener('success', function() {
			    callback(r.result);
			}, false);
			r.addEventListener('error', function() {
			    callback(undefined, r.error);
			}, false);
		    }
		    return new StoreOperationResult(r);
		},
		this.database,
		IDBTransaction.READ_ONLY,
		this);
	},
	all: function() {
	    return new ObjectStoreQuery(this);
	},
	range: function() {
	    var query = new ObjectStoreQuery(this);
	    return ObjectStoreQuery.prototype.range.apply(query, slice.call(arguments));
	},
	filter: function(filter) {
	    return new ObjectStoreQuery(this).filter(filter);
	}
    };
    _global.JDBDatabase = Database;
    _global.JDBObjectStore = ObjectStore;
})(this);
