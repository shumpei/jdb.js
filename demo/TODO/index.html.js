$(function() {
    var taskList = $('#taskList > tbody');

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
	listTasks();
    });
    function listTasks() {
	taskList.empty();
	TaskStore.all().iterate(function(task) {
	    var row = $('<tr/>').data(task);
	    $('<td/>').text(task.id).appendTo(row);
	    $('<td/>').text(task.text).appendTo(row);
	    $('<td/>').text(task.timestamp.toString()).appendTo(row);
	    taskList.append(row);
	});
    }

    $('#addButton').click(function() {
	var text = $('#task').val();
	var timestamp = new Date();
	TaskStore.put({
	    text: text,
	    timestamp: timestamp
	}).success(function() {
	    listTasks();
	});
    });
});
