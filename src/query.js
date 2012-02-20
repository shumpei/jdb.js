/*
path: javascript_identifer*
javascript_identifer: 'a-zA-Z0-9_'+
literal:
  number_literal |
  string_literal |
  boolean_literal |
  '?'
number_literal: 0-9*
string_literal: 'any' | "any"
boolean_literal: 'true' | 'false'
expr: path '<' literal |
  path '>' literal |
  path '=' literal |
  path '<=' literal |
  path '>=' literal |
  literal '<' path |
  literal '>' path |
  literal '=' path |
  literal '<=' path |
  literal '>=' path |
  expr 'and' expr

*/


ObjectStore.range('path', 100)
ObjectStore.range('path', 100, 200)
ObjectStore.range('path', 100, true, 200, true)
ObjectStore.range('path', 100, 200, true)
ObjectStore.range('path', 100, 'next')


JDBKeyRange.of('path').upper(200, true).lower(100, true), 'next')


ObjectStore.query('path >= ?', 200)