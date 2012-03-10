"use strict"

_global = this

isFunction = (obj) -> typeof obj is "function"

safeCall = (target, fn, args...) ->
  fn.apply(target, args) if typeof fn is "function"

slice = Array.prototype.slice

assert = (expr, errorMessage) ->
  unless expr
    e = new Error
    e.message = errorMessage
    throw e
  true

verifyParameterIsNotMissing = (paramName, param) ->
  assert(not isNullOrUndefined(param), "parameter [#{paramName}] is required")

capitalize = (s) -> s.charAt(0).toUpperCase() + s.substring(1)

extend = (dest, src) ->
  dest[key] = src[key] for key of src
  dest

prefixed = (name) ->
  return _global[name] if _global[name]
  name = capitalize name

  _global['webkit' + name] or
  _global['moz' + name] or
  _global['o' + name] or
  _global['ms' + name]

isNullOrUndefined = (obj) -> obj is null or obj is undefined

indexedDB = prefixed 'indexedDB'
IDBDatabase = prefixed 'IDBDatabase'
IDBCursor = prefixed 'IDBCursor'
IDBKeyRange = prefixed 'IDBKeyRange'
IDBTransaction = prefixed 'IDBTransaction'

class OpenDatabaseResult
  constructor: (@idbRequest) ->
  error: (callback) ->
    @idbRequest.addEventListener 'error', callback, false
    this
  success: (callback) ->
    @idbRequest.addEventListener 'success', callback, false
    this

class Upgrade
  constructor: (@oldVersion, @newVersion) ->
    @ops = []
  getOperations: (version) ->
    @ops[version] or= new UpgradeOperations(version)
  execute: (tx) ->
    op.execute(tx) for op in @ops[@oldVersion...@newVersion]

class UpgradeOperations
  constructor: (@version) ->
    @operations = []

  createObjectStore: (storeName, options) ->
    op = (tx) ->
      console.log "create object store:#{storeName}, keyPath:#{options.keyPath}, autoIncrement:#{options.autoIncrement}"
      tx.db.createObjectStore(storeName, options)
    @operations.push op

  createIndex: (storeName, indexName, keyPath, options) ->
    op = (tx) ->
      objectStore = tx.objectStore storeName
      console.log "create index:[storeName=#{storeName}][indexName=#{indexName}][keyPath=#{keyPath}]"
      objectStore.createIndex indexName, keyPath, options
    @operations.push op
  execute: (tx) ->
    op.execute(tx) for op in @operations

class Database
  constructor: (@name, @version) ->
    verifyParameterIsNotMissing "name", name
    verifyParameterIsNotMissing "version", version
    assert version > 0, "parameter [version] must be positive integer"
    @stores = {}

  getStoreNames: ->
    Object.keys @stores

  transaction: (fn, options = {}) ->
    mode = options.mode or IDBTransaction.READ_WRITE
    executeInCurrentTransaction(
      fn, this, mode, options.stores, options.onAbort,
      options.onComplete, options.onError)

  _upgrade: (tx, oldVersion, newVersion) ->
    console.log "oldVersion:#{oldVersion} newVersion:#{newVersion}"
    upgrade = new Upgrade()
    for storeName of @stores
      storeDef = @stores[storeName]
      since = storeDef.since or 1
      if typeof since is 'number' and oldVersion < since and since <= newVersion
        keyDef = storeDef.key
        options =
          keyPath: keyDef.path
          autoIncrement: keyDef.autoIncrement
        upgrade.getOperations(since).createObjectStore(storeName, options)
      for indexName, indexDef of storeDef.indexes
        since = indexDef.since or storeDef.since or 1
        if typeof since is 'number' and oldVersion < since and since <= newVersion
          opts =
            unique: !!indexDef.unique,
            multientry: !!indexDef.multientry
          upgrade.getOperations(since).createIndex(storeName, indexName, indexDef.path, opts)
    upgrade.execute tx

  open: (onSuccess, onError) ->
    self = this
    console.log "name:#{self.name},version:#{self.version}"
    r = indexedDB.open self.name, self.version
    if typeof onSuccess is "function"
      successCallback = ->
        db = self.idbDatabase = r.result
        if typeof db.setVersion is "function"
          oldVersion = if db.version then parseInt(db.version, 10) else 0
          newVersion = self.version
          if oldVersion is newVersion
            onSuccess()
          else
            changeVersionReq = db.setVersion(newVersion)
            changeVersionReq.onsuccess = ->
              console.log "using legacy API: IDBDatabase#setVersion()"
              self._upgrade self.transaction, oldVersion, newVersion
              onSuccess()
            changeVersionReq.onerror = ->
              safeCall null, onError, changeVersionReq.error
        else
          onSuccess()
      r.addEventListener "success", successCallback, false
    if isFunction(onError)
      r.addEventListener "error", onError, false
    r.onupgradeneeded = (e) ->
      db = self.idbDatabase = r.result
      tx = r.transaction
      oldVersion = e.oldVersion or 0
      newVersion = e.newVersion
      self._upgrade(tx, oldVersion, newVersion);
      safeCall self, onSuccess
      new OpenDatabaseResult(r);
  defineObjectStore: (params) ->
    new ObjectStore this, params
class Transaction
  constructor: (@database, @mode, @stores, @onAbort, @onComplete, @onError) ->
    storeNames = []
    if stores?
      storeNames = slice.call(database.getStoreNames())
    else
      if stores instanceof Array
        stores.forEach((store) ->
          if store instnceof ObjectStore
            storeNames.push store.name
          else if typeof store is 'string'
            storeNames.push store
        )
      else if stores instanceof ObjectStore
        storeNames.push stores.name
      else if typeof stores is 'string'
        storeNames.push stores
      else
        throw "could not process arguments[stores]:#{stores}"
    @storeNames = storeNames
  begin: ->
    db = @database.idbDatabase
    tx = @idbTransaction = db.transaction @storeNames, @mode
    if typeof @onError is 'function'
      tx.addEventListener 'error', @onError, false
    if typeof @onComplete is 'function'
      tx.addEventListener 'complete', @onComplete, false
    if typeof @onAbort is 'function'
      tx.addEventListener 'abort', @onAbort, false
    @active = true
  abort: ->
    if not @active
      throw "Transaction is not active"
    @idbTransaction.abort()
  execute: (fn) ->
    @begin()
    try
      return fn this
    catch e
      @abort()
      throw e

currentTransaction = null
transactionNested = 0

executeInCurrentTransaction = (fn, database, mode, stores, onAbort, onComplete, onError) ->
  currentTransaction or= new Transaction(database, mode, stores, onAbort, onComplete)
  transactionNested++
  try
    return currentTransaction.execute fn
  finally
    currentTransaction = null if --transactionNested is 0

class ObjectStoreQuery
  constructor: (@store) ->
    @filters = []
  criteria: (criteria) ->
    @_criteria = criteria
    this
  filter: (filter) ->
    @filters.push filter
    this
  _getData: (onContinue, onError, onEnd) ->
    self = this
    filters = @filters
    criteria = @_criteria
    proc = (tx) ->
      idbObjectStore = tx.idbTransaction.objectStore(self.store.name)
      cursorReq = null
      if criteria
        cursorReq = criteria.createCursor idbObjectStore
      else
        cursorReq = idbObjectStore.openCursor()
      cursorReq.onsuccess = ->
        cursor = cursorReq.result
        if not cursor
          onEnd() if typeof onEnd is "function"
          return
        value = cursor.value
        for filter in filters
          if not filter(value)
            cursor["continue"]()
            return
        ret = onContinue value
        if ret isnt false
          cursor["continue"]()
      cursorReq.onError = ->
        onError undefined, cursorReq.error
    executeInCurrentTransaction proc, @store.database, IDBTransaction.READ_ONLY, @store
  iterate: (callback) ->
    @_getData callback, callback
  list: (callback) ->
    results = []
    @_getData(
      (value) -> results.push(value),
      (error) -> callback(undefined, error),
      () -> callback(results))

class StoreOperationResult
  constructor: (@idbRequest) ->
  error: (callback) ->
    @idbRequest.addEventListener "error", callback, false
    this
  success: (callback) ->
    req = @idbRequest
    req.addEventListener(
      "success",
      () -> callback(req.result),
      false)
    this

class Criteria
  constructor: ->
    @direction = "next"
    @allowDuplicate = true
  equal: (val) ->
    @only = val
    this
  le: (val) ->
    @upper = val
    @upperOpen = false
    this
  lt: (val) ->
    @upper = val
    @upperOpen = true
    this
  ge: (val) ->
    @lower = val
    @lowerOpen = false
    this
  ge: (val) ->
    @lower = val
    @lowerOpen = true
    this
  dir: (direction) ->
    if direction isnt "next" and direction isnt "prev"
      throw "Invalid direction: #{direction} (must be 'next' or 'prev')"
    @direction = direction
    this
  dup: (allowDuplicate) ->
    @allowDuplicate = not allowDuplicate
    this
  toKeyRange: ->
    keyRange = null
    if @only
      keyRange = IDBKeyRange.only @only
    else
      if not isNullOrUndefined @upper
        if not isNullOrUndefined @lower
          keyRange = IDBKeyRange.bound @lower, @upper, @lowerOpen, @upperOpen
        else
          keyRange = IDBKeyRange.upperBound @upper, @upperOpen
      else if not isNullOrUndefined @lower
        keyRange = IDBKeyRange.lowerBound @lower, @lowerOpen
    keyRange
  createCursor: (idbObjectStore) ->
    keyRange = @toKeyRange()
    direction = null
    if @direction is "next"
      if @allowDuplicate
        direction = IDBKeyRange.NEXT
      else
        direction = IDBKeyRange.NEXT_NO_DUPLICATE
    else
      if @allowDuplicate
        direction = IDBKeyRange.PREV
      else
        direction = IDBKeyRange.PREV_NO_DUPLICATE
    if @byKey
      idbObjectStore.openCursor keyRange, direction
    else
      idbObjectStore.index(@indexName).openCursor keyRange, direction

class CriteriaBuilder
  @byKey: ->
    criteria = new Criteria
    criteria.byKey = true
    criteria
  @byIndex: (indexName) ->
    criteria = new Criteria
    criteria.indexName = indexName
    criteria

class ObjectStore
  constructor: (@database, params) ->
    verifyParameterIsNotMissing "database", @database
    verifyParameterIsNotMissing "params", params
    {
      name: @name
      key: @key
      indexes: @indexes
      since: @since
    } = params
    assert typeof @name is "string" and @name.length > 0, "parameter [name] must be non-empty string"
    assert typeof @key is "object" and @key.path?, "parameter [key] must be object which has 'path' property"
    @indexes = [] unless @indexes?
    assert @indexes instanceof Array, "parameter [indexes] must be an Array"

    @database.stores[@name] = this
  _exec: (proc, callback, txMode) ->
    self = this
    txProc = (tx) ->
      idbObjectStore = tx.idbTransaction.objectStore self.name
      r = proc tx, idbObjectStore
      if typeof callback is "function"
        r.addEventListener("success", ->
          callback r.result,
          false)
        r.addEventListener("error", ->
          callback undefined, r.error
          false)
      new StoreOperationResult r

    executeInCurrentTransaction(txProc, @database, txMode, self)
  remove: (key, callback) ->
    @_exec (tx, idbObjectStore) ->
        idbObjectStore["delete"](key)
      , callback, IDBTransaction.READ_WRITE
  clear: (callback) ->
    @_exec (tx, idbObjectStore) ->
        idbObjectStore.clear()
      , callback, IDBTransaction.READ_WRITE
  put: (obj, callback) ->
    @_exec (tx, idbObjectStore) ->
        idbObjectStore.put obj
      , callback, IDBTransaction.READ_WRITE
  get: (key, callback) ->
    @_exec (tx, idbObjectStore) ->
        idbObjectStore.get key
      , callback, IDBTransaction.READ_WRITE
  all: ->
    new ObjectStoreQuery this
  criteria: (criteria) ->
    new ObjectStoreQuery(this).criteria criteria
  filter: (filter) ->
    new ObjectStoreQuery(this).filter filter

_global.indexedDB = prefixed "indexedDB"
_global.IDBDatabase = prefixed "IDBDatabase"
_global.IDBCursor = prefixed "IDBCursor"
_global.IDBKeyRange = prefixed "IDBKeyRange"
_global.IDBTransaction = prefixed "IDBTransaction"
_global.JDBDatabase = Database;
_global.JDBCriteria = CriteriaBuilder;