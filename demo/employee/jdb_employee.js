$(function() {
    var employeeList = $('#employees > tbody');

    var EmployeeDB = new JDBDatabase('EmployeeDB', 6);
    
    var EmployeeStore = new JDBObjectStore({
	name: 'EmployeeStore',
	database: EmployeeDB,
	key: { path: 'id', autoIncrement: true },
	indexes: {
	    birthday: {},
	    age: { since: 2 },
	    name: { since: 3 },
	    aaa: { since: 3 }
	}
    });
    EmployeeDB
	.open(function() {
	    listEmployees();
	}, function(e) {
	    console.error(e);
	    alert('Database error occured. This application is unavailable');
	});

    function listEmployees() {
	employeeList.empty();
	EmployeeStore.all().iterate(function(employee) {
	    var row = $('<tr/>').data('employeeId', employee.id);
	    var checkbox = $('<input type="checkbox" class="checkForDelete">');
	    $('<td/>').append(checkbox).appendTo(row);
	    $('<td/>', { text: employee.id }).appendTo(row);
	    $('<td/>', { text: employee.name }).appendTo(row);
	    $('<td/>', { text: employee.age }).appendTo(row);
	    $('<td/>', { text: employee.gender }).appendTo(row);
	    row.appendTo(employeeList);
	});
    }
    $('#employeeForm').submit(function(e) {
	e.preventDefault();
	var id = $('#id').val();
	if (!id) {
	    id = undefined;
	}
	var employee = {
	    id: id,
	    name: $('#name').val(),
	    age: $('#age').val(),
	    gender: $('#gender').val()
	};
	EmployeeStore
	    .put(employee)
	    .success(function(result) {
		listEmployees();
	    }).error(function() {
		alert('Error!');
	    });
	return false;
    });
    employeeList.on('click', 'tr', function() {
	var id = $(this).data('employeeId');
	EmployeeStore.get(id, function(employee, error) {
	    if (error) {
		alert('Error');
	    }
	    $('#id').val(employee.id);
	    $('#name').val(employee.name);
	    $('#age').val(employee.age);
	    $('#gender').val(employee.gender);
	});
    });
    $('#deleteAllButton').click(function() {
	if (!confirm('Are you sure?')) {
	    return;
	}
	EmployeeStore.clear(function(result, error) {
	    if (error) {
		alert('Error');
		return;
	    }
	    employeeList.empty();
	});
    });
    $('#deleteButton').click(function() {
	if (!confirm('Are you sure?')) {
	    return;
	}
	var rows = employeeList.find('.checkForDelete:checked').closest('tr');
	var rowCount = rows.length, deleteSucceeded = 0;
	EmployeeDB.transaction(function() {
	    rows.each(function() {
		var employeeId = $(this).data('employeeId');
		EmployeeStore.remove(employeeId, function(result, error) {
		    if (error) {
			alert('Error');
			return;
		    }
		    deleteSucceeded++;
		    if (deleteSucceeded === rowCount) {
			rows.remove();
		    }
		});
	    });
	});
    });
    $('#checkAll').change(function() {
	$('.checkForDelete').attr('checked', this.checked);
    });
});
