$(function() {
    var employeeList = $('#employees > tbody');

    var EmployeeDB = new JDBDatabase('EmployeeDB3', 1);
    
    var EmployeeStore = new JDBObjectStore({
	name: 'EmployeeStore',
	database: EmployeeDB,
	key: { path: 'id', autoIncrement: true },
	indexes: {
	    ageIdx: { path: 'age' }
	}
    });
    
    EmployeeDB
	.open(function() {
	    /*
	    EmployeeStore.count(function(count) {
		alert(count);
	    });
	    */
	    listEmployees();
	}, function(e) {
	    console.error(e);
	    alert('Database error occured. This application is unavailable');
	});

    function listEmployees() {
	employeeList.empty();
	EmployeeStore.all().iterate(function(employee) {
	    addEmployeeToListRow(employee);
	});
    }
    function addEmployeeToListRow(employee) {
	var row = $('<tr/>').data('employeeId', employee.id);
	var checkbox = $('<input type="checkbox" class="checkForDelete">');
	$('<td/>').append(checkbox).appendTo(row);
	$('<td/>', { text: employee.id }).appendTo(row);
	$('<td/>', { text: employee.name }).appendTo(row);
	$('<td/>', { text: employee.age }).appendTo(row);
	$('<td/>', { text: employee.gender }).appendTo(row);
	row.appendTo(employeeList);
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
	    age: parseInt($('#age').val(), 10),
	    gender: parseInt($('#gender').val(), 10)
	};
	EmployeeStore
	    .put(employee)
	    .success(function(result) {
		listEmployees();
	    }).error(function(e) {
		console.error(this);
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
    $('#searchEmployeeForm').submit(function(e) {
	e.preventDefault();
	var fromAge = parseInt($('#fromAge').val(), 10);
	var toAge = parseInt($('#toAge').val(), 10);

	employeeList.empty();
	var criteria =
	    JDBCriteria.byIndex('ageIdx').le(toAge).ge(fromAge);
	EmployeeStore.criteria(criteria).iterate(function(employee) {
	    addEmployeeToListRow(employee);
	});
	return false;
    });
});
