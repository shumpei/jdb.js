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
    function isNullOrUndefined(obj) {
	return obj === null || obj === undefined;
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
	_upgrade: function(tx, oldVersion, newVersion) {
	    var self = this;
	    var db = self.idbDatabase;

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
		    var since = indexDef.since || storeDef.since || 1;
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
			    unique: !!indexDef.unique,
			    multientry: !!indexDef.multientry
			};
			addMigrationOp(since, createIndexOp(storeName, indexName, indexDef.path, opts));
		    }
		}
	    }
	    for (var i = oldVersion, m = migrationOps.length; i < m; i++) {
		var versionChangeOps = migrationOps[i];
		for (var j = 0, n = versionChangeOps.length; j < n; j++) {
		    versionChangeOps[j](db);
		}
	    }

	},
	open: function(onSuccess, onError) {
	    var self = this;
	    console.log('name:' + this.name + ',version:' + this.version);
	    var r = indexedDB.open(this.name, this.version);
	    if (typeof onSuccess === 'function') {
		r.addEventListener('success', function() {
		    var db = self.idbDatabase = r.result;

		    if (typeof db.setVersion === 'function') {
			var oldVersion = db.version ? parseInt(db.version, 10) : 0;
			var newVersion = self.version;
			if (oldVersion !== newVersion) {
			    var changeVersionReq = db.setVersion(newVersion);
			    changeVersionReq.onsuccess = function() {
				console.log('using legacy API: IDBDatabase#setVersion()');
				self._upgrade(this.transaction, oldVersion, newVersion);
				onSuccess();
			    };
			    changeVersionReq.onerror = function() {
				onError(changeVersionReq.error);
			    };
			} else {
			    onSuccess();
			}
		    } else {
			onSuccess();
		    }
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
		self._upgrade(tx, oldVersion, newVersion);
		onSuccess();
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
	    storeNames = slice.call(database.getStoreNames());
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
	criteria: function(criteria) {
	    this._criteria = criteria;
	    return this;
	},
	filter: function(filter) {
	    this.filters.push(filter);
	    return this;
	},
	_getData: function(onContinue, onError, /* optional */onEnd) {
	    var self = this;
	    var filters = self.filters;
	    var criteria = self._criteria;
	    return executeInCurrentTransaction(
		function(tx) {
		    var idbObjectStore = tx.idbTransaction.objectStore(self.store.name);
		    var cursorReq;
		    if (criteria) {
			cursorReq = criteria.createCursor(idbObjectStore);
		    } else {
			cursorReq = idbObjectStore.openCursor();
		    }
		    cursorReq.onsuccess = function() {
			var cursor = cursorReq.result;
			if (!cursor) {
			    typeof onEnd === 'function' && onEnd();
			    return;
			}
			var value = cursor.value;
			for (var i = 0, n = filters.length; i < n; i++) {
			    if (!filters[i](value)) {
				cursor['continue']();
				return;
			    }
			}
			var ret = onContinue(value);
			if (ret !== false)
			    cursor['continue']();
		    };
		    cursorReq.onerror = function() {
			onError(undefined, cursorReq.error);
		    };
		},
		self.store.database,
		IDBTransaction.READ_ONLY,
		self.store);
	},
	iterate: function(callback) {
	    return this._getData(callback, callback);
	},
	list: function(callback) {
	    var results = [];
	    return this._getData(
		function onContinue(value) {
		    results.push(value);
		},
		function onError(error) {
		    callback(undefined, error);
		},
		function onEnd() {
		    callback(results);
		});
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

    var Criteria = function() {
	this._direction = 'next';
	this._dup = true;
    };
    Criteria.prototype = {
	equal: function(val) {
	    this._only = val;
	},
	le: function(val) {
	    this._upper = val;
	    this._upperOpen = false;
	    return this;
	},
	lt: function(val) {
	    this._upper = val;
	    this._upperOpen = true;
	    return this;
	},
	ge: function(val) {
	    this._lower = val;
	    this._lowerOpen = false;
	    return this;
	},
	gt: function(val) {
	    this._lower = val;
	    this._lowerOpen = true;
	    return this;
	},
	dir: function(direction) {
	    if (direction !== 'next' && direction !== 'prev') {
		throw 'Invalid direction (must be "next" or "prev"):' + direction;
	    }
	    this._direction = direction;
	    return this;
	},
	dup: function(allowDuplicate) {
	    this._dup = (allowDuplicate !== false);
	},
	toKeyRange: function() {
	    var keyRange;
	    if (this._only) {
		keyRange = IDBKeyRange.only(this._only);
	    } else {
		var upper = this._upper;
		var upperOpen = this._upperOpen;
		var lower = this._lower;
		var lowerOpen = this._lowerOpen;
		if (!isNullOrUndefined(upper)) {
		    if (!isNullOrUndefined(lower)) {
			keyRange = IDBKeyRange.bound(lower, upper, lowerOpen, upperOpen);
		    } else {
			keyRange = IDBKeyRange.upperBound(upper, upperOpen);
		    }
		} else if (!isNullOrUndefined(lower)) {
		    keyRange = IDBKeyRange.lowerBound(lower, lowerOpen);
		}
	    }
	    return keyRange;
	},
	createCursor: function(idbObjectStore) {
	    var keyRange = this.toKeyRange(), direction;
	    if (this._direction === 'next') {
		if (this._dup) {
		    direction = IDBKeyRange.NEXT;
		} else {
		    direction = IDBKeyRange.NEXT_NO_DUPLICATE;
		}
	    } else {
		if (this._dup) {
		    direction = IDBKeyRange.PREV;
		} else {
		    direction = IDBKeyRange.PREV_NO_DUPLICATE;
		}
	    }
	    if (this._byKey) {
		return idbObjectStore.openCursor(keyRange, direction);
	    } else {
		return idbObjectStore.index(this._indexName)
		    .openCursor(keyRange, direction);
	    }
	}
    };
    var CriteriaBuilder = {
	byKey: function() {
	    var criteria = new Criteria();
	    criteria._byKey = true;
	    return criteria;
	},
	byIndex: function(indexName) {
	    var criteria = new Criteria();
	    criteria._indexName = indexName;
	    return criteria;
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
	remove: function(key, callback) {
	    return this._exec(function(tx, idbObjectStore) {
		return idbObjectStore['delete'](key);
	    }, callback, IDBTransaction.READ_WRITE);
	},
	clear: function(callback) {
	    return this._exec(function(tx, idbObjectStore) {
		return idbObjectStore.clear();
	    }, callback, IDBTransaction.READ_WRITE);
	},
	put: function(obj, callback) {
	    return this._exec(function(tx, idbObjectStore) {
		return idbObjectStore.put(obj);
	    }, callback, IDBTransaction.READ_WRITE);
	},
	get: function(key, callback) {
	    return this._exec(function(tx, idbObjectStore) {
		return idbObjectStore.get(key);
	    }, callback, IDBTransaction.READ_ONLY);
	},
	count: function(/* optional */ criteria, callback) {
	    if (arguments.length === 1) {
		//if (typeof criteria === 'function') [
		    callback = arguments[0];
		    criteria = null;
//		}
	    }
	    return this._exec(function(tx, idbObjectStore) {
		if (!criteria) {
		    return idbObjectStore.count();
		}
		var keyRange = criteria.toKeyRange();
		if (criteria._byKey) {
		    return idbObjectStore.count(keyRange);
		} else {
		    var idbIndex = idbObjectStore.index(criteria._indexName);
		    return idbIndex.count(keyRange);
		}
	    }, callback, IDBTransaction.READ_ONLY);
	},
	_exec: function(proc, callback, txMode) {
	    var self = this;
	    return executeInCurrentTransaction(
		function(tx) {
		    var idbObjectStore = tx.idbTransaction.objectStore(self.name);
		    var r = proc(tx, idbObjectStore);
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
		self.database,
		txMode,
		self);
	},
	all: function() {
	    return new ObjectStoreQuery(this);
	},
	criteria: function(criteria) {
	    var query = new ObjectStoreQuery(this);
	    return new ObjectStoreQuery(this).criteria(criteria);
	},
	filter: function(filter) {
	    return new ObjectStoreQuery(this).filter(filter);
	}
    };
    _global.JDBDatabase = Database;
    _global.JDBObjectStore = ObjectStore;
    _global.JDBCriteria = CriteriaBuilder;
})(this);
