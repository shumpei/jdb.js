# jdb.js - Framework for Indexed Database API

"jdb.js" is a framework for programing easier with W3C Indexed Database API. 'J' is the next character of 'I' in alphabetical order, so "JDB" means "better IDB".
Compared with using "naked" Indexed Database API, using jdb.js is better as follows:

* Object oriented, easy-for-use API.
* You can define the scheme of the object stores using declarative JSON format.
* Easy database upgrade at runtime (what you should do on upgrade is only specify "since:version" configuration in definition of object stores or indexes).
* You can describe the code of asynchronous programming in the intuitive way.

Following code is an example of using jdb.js. 

    // Create a new reference of the database.
    var db = new JDBDatabase('database name', 1);

    // Create a new reference of the object store.
    var CatStore = new JDBObjectStore({
      name: 'CatStore', // Name of this store.
      database: db,     // Reference of the database.
      key: { path: 'id', autoIncrement: true }, // Definition of the key property.
      indexes: {
        ageIdx: { path: 'age' } // Definition of the index.
      }
    });

    // Open database connection.
    db.open().success(function() {
      console.log('database opened');
    });

    // Put an object to the object store.
    CatStore.put({
      name: 'Nana',
      age: 7,
      gender: 'female'
    });

    // Get object from the store.
    var catId = 1;
    CatStore.get(catId, function(cat, error) {
      ...
    });

    // Iterate all cats in the store.
    CatStore.all().iterate(function(cat) {
      ...
    });

    // Get the cats which age is less equal 5.
    var criteria = JDBCriteria.byIndex('ageIdx').le(5);
    CatStore.criteria(criteria).list(function(cats) {
      ...
    });

For more information, see the <a href="https://sites.google.com/site/jdbjsdoc/tutorial">tutorial</a>.

CONTRIBUTING IS ALWAYS WELCOME!
