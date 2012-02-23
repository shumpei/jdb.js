$(function() {
    var TaskDB = new JDBDatabase('TaskDB', 3);
    var TaskStore = new JDBObjectStore({
	name: 'TaskStore',
	database: TaskDB,
	key: { path: 'id', autoIncrement: true },
	indexes: {
            timestamp: { path: 'timestamp', since: 2 }
	}
    });
    var FolderStore = new JDBObjectStore({
	name: 'FolderStore',
	database: TaskDB,
	key: { path: 'id', autoIncrement: true },
	indexes: {
            name: { path: 'name' }
	},
	since: 3
    });
    TaskDB.open(function(result, error) {
	if (error) {
	    alert('Error');
	    return;
	}
	alert('Open database successfully');
    });
});
