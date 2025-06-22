// --- Chức năng "Back to top" ---
// Get the button
var mybutton = document.getElementById("myBtn");

// When the user scrolls down 20px from the top of the document, show the button
window.onscroll = function() {
    scrollFunction();
};

function scrollFunction() {
    if (document.body.scrollTop > 20 || document.documentElement.scrollTop > 20) {
        mybutton.style.display = "block";
    } else {
        mybutton.style.display = "none";
    }
}

// When the user clicks on the button, scroll to the top of the document
function topFunction() {
    document.body.scrollTop = 0; // For Safari
    document.documentElement.scrollTop = 0; // For Chrome, Firefox, IE and Opera
}

// --- Xử lý hiển thị thông tin món ăn trong modal ---
$(document).ready(function() {
    // Lắng nghe sự kiện click trên bất kỳ thẻ <a> nào
    // mà có thuộc tính data-toggle="modal" và data-target="#food-content"
    // Đây là selector đã được sửa.
    $('a[data-toggle="modal"][data-target="#food-content"]').on('click', function(event) {
        event.preventDefault(); // Ngăn chặn hành vi mặc định của liên kết

        // Tìm phần tử cha chứa tất cả thông tin món ăn.
        // Dựa trên cấu trúc HTML của bạn, 'li' là lựa chọn tốt nhất
        // vì mỗi 'li' đại diện cho một món ăn duy nhất và chứa các thuộc tính data-.
        var menuItem = $(this).closest('li');

        // Lấy thông tin từ CÁC THUỘC TÍNH DATA CỦA PHẦN TỬ menuItem
        var itemName = menuItem.data('name');
        var itemPrice = menuItem.data('price');
        var itemIngredient = menuItem.data('ingredient');
        var itemImage = menuItem.data('image');

        // Lấy các ảnh phụ (nếu có)
        var extraImage1 = menuItem.data('extra-image-1');
        var extraImage2 = menuItem.data('extra-image-2');
        var extraImage3 = menuItem.data('extra-image-3');

        // Cập nhật nội dung của modal
        $('#modal-title').text(itemName); // Cập nhật tiêu đề modal
        $('#modal-name').text(itemName); // Cập nhật tên món ăn trong body modal
        $('#modal-price').text(itemPrice);
        $('#modal-ingredient').text(itemIngredient);
        $('#modal-img').attr('src', itemImage);

        // Cập nhật và xử lý hiển thị/ẩn các hình ảnh phụ
        // Đảm bảo reset trạng thái hiển thị của các link ảnh phụ trước khi cập nhật
        $('#modal-img-link-1, #modal-img-link-2, #modal-img-link-3').show();

        if (extraImage1) {
            $('#modal-img-link-1 img').attr('src', extraImage1);
            $('#modal-img-link-1').attr('href', extraImage1);
        } else {
            $('#modal-img-link-1').hide(); // Ẩn nếu không có ảnh
        }

        if (extraImage2) {
            $('#modal-img-link-2 img').attr('src', extraImage2);
            $('#modal-img-link-2').attr('href', extraImage2);
        } else {
            $('#modal-img-link-2').hide();
        }

        if (extraImage3) {
            $('#modal-img-link-3 img').attr('src', extraImage3);
            $('#modal-img-link-3').attr('href', extraImage3);
        } else {
            $('#modal-img-link-3').hide();
        }

        // Bootstrap 4 tự động hiển thị modal khi click vào thẻ <a> có data-toggle="modal",
        // nên bạn không cần gọi $('#food-content').modal('show'); ở đây nữa.
        // Tuy nhiên, nếu bạn muốn đảm bảo, có thể giữ lại nhưng thường là không cần thiết.
        // $('#food-content').modal('show');
    });

    // Reset modal khi đóng để tránh hiển thị thông tin cũ
    $('#food-content').on('hidden.bs.modal', function () {
        $('#modal-title').text('Thông tin món ăn'); // Đặt lại tiêu đề mặc định
        $('#modal-name').text('');
        $('#modal-price').text('');
        $('#modal-ingredient').text('');
        $('#modal-img').attr('src', '');
        $('#modal-img-link-1 img, #modal-img-link-2 img, #modal-img-link-3 img').attr('src', '');
        $('#modal-img-link-1, #modal-img-link-2, #modal-img-link-3').attr('href', '#').show(); // Reset href và hiển thị lại
    });

    // --- NEW TABLE RESERVATION LOGIC ---
    const startReservationBtn = document.getElementById('start-reservation-btn');
    const initialReservationSection = document.getElementById('initial-reservation-section');
    const tableStatusAndMap = document.getElementById('table-status-and-map');
    const reservationFormSection = document.getElementById('reservation-form'); // Use the section ID here
    const reservationSubmitForm = document.getElementById('reservation-submit-form'); // The form element itself
    const confirmTableSelectionBtn = document.getElementById('confirm-table-selection');
    const reservationMessageDiv = document.getElementById('reservation-message');
    const tableIdInput = document.getElementById('table_id');

    let selectedTableId = null;

    // Sử dụng một mảng toàn cục để lưu trữ trạng thái bàn.
    // KHỞI TẠO TẤT CẢ CÁC BÀN LÀ 'available' BAN ĐẦU
    let restaurantTables = [
        { id: '1', status: 'available' },
        { id: '2', status: 'available' },
        { id: '3', status: 'available' },
        { id: '4', status: 'available' },
        { id: '5', status: 'available' },
        { id: '6', status: 'available' },
        { id: '7', status: 'available' },
        { id: '8', status: 'available' },
        { id: '9', status: 'available' },
        { id: '10', status: 'available' },
        { id: '11', status: 'available' },
        { id: '12', status: 'available' },
        { id: '13', status: 'available' },
        { id: '14', status: 'available' },
        { id: '15', status: 'available' }
    ];

    // Hàm cập nhật trạng thái bàn và số liệu thống kê
    function updateTableMapAndCounts() {
        let availableCount = 0;
        let reservedCount = 0;

        document.querySelectorAll('.table-seat').forEach(tableDiv => {
            const tableId = tableDiv.dataset.tableId;
            const table = restaurantTables.find(t => t.id === tableId);

            // Xóa tất cả các class trạng thái cũ
            tableDiv.classList.remove('table-available', 'table-reserved', 'selected');

            if (table) {
                if (table.status === 'available') {
                    tableDiv.classList.add('table-available');
                    tableDiv.style.cursor = 'pointer';
                    availableCount++;
                } else { // status is 'reserved'
                    tableDiv.classList.add('table-reserved');
                    tableDiv.style.cursor = 'not-allowed';
                    reservedCount++;
                }
            }
        });

        document.getElementById('available-tables').textContent = availableCount;
        document.getElementById('reserved-tables').textContent = reservedCount;
        document.getElementById('total-tables').textContent = restaurantTables.length;
    }

    // Gán lại event listener cho các bàn mỗi khi cập nhật
    function attachTableClickHandlers() {
        document.querySelectorAll('.table-seat').forEach(tableDiv => {
            // Loại bỏ listener cũ nếu có
            tableDiv.removeEventListener('click', handleTableClick);
            // Thêm listener mới
            tableDiv.addEventListener('click', handleTableClick);
        });
    }

    function handleTableClick() {
        const tableDiv = this; // 'this' ở đây là phần tử tableDiv được click
        if (tableDiv.classList.contains('table-reserved')) {
            alert('Bàn này đã có người đặt. Vui lòng chọn bàn khác.');
            return;
        }

        // Xóa trạng thái selected khỏi tất cả các bàn
        document.querySelectorAll('.table-seat').forEach(div => {
            div.classList.remove('selected');
        });

        // Thêm trạng thái selected vào bàn đã chọn
        tableDiv.classList.add('selected');
        selectedTableId = tableDiv.dataset.tableId;
        tableIdInput.value = `Bàn ${selectedTableId}`; // Hiển thị ID bàn trong input form

        // Hiển thị nút xác nhận
        confirmTableSelectionBtn.style.display = 'block';
    }


    // --- Logic mới: Điều khiển hiển thị các phần ---

    // Ẩn ban đầu nút xác nhận bàn đã chọn
    confirmTableSelectionBtn.style.display = 'none';

    // Khi click vào nút "Bắt đầu đặt bàn ngay!"
    startReservationBtn.addEventListener('click', () => {
        initialReservationSection.style.display = 'none'; // Ẩn phần khởi tạo
        tableStatusAndMap.style.display = 'block'; // Hiện sơ đồ bàn
        updateTableMapAndCounts(); // Cập nhật trạng thái bàn ngay lập tức (ban đầu tất cả trống)
        attachTableClickHandlers(); // Gán lại event listener cho các bàn
        // Cuộn đến sơ đồ bàn
        tableStatusAndMap.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    // Khi click vào nút "Xác nhận bàn đã chọn"
    confirmTableSelectionBtn.addEventListener('click', () => {
        if (selectedTableId) {
            tableStatusAndMap.style.display = 'none'; // Ẩn sơ đồ bàn
            reservationFormSection.style.display = 'block'; // Hiện form đặt bàn
            // Cuộn đến form đặt bàn
            reservationFormSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
            // Có thể tự động focus vào trường đầu tiên của form
            document.getElementById('customer_name').focus();
        } else {
            alert('Vui lòng chọn một bàn trước khi xác nhận!');
        }
    });

    // Xử lý gửi form đặt bàn
    reservationSubmitForm.addEventListener('submit', async function(event) {
        event.preventDefault(); // Ngăn chặn form submit mặc định

        // Xóa thông báo cũ
        reservationMessageDiv.textContent = '';
        reservationMessageDiv.classList.remove('success', 'error');

        if (!selectedTableId) {
            reservationMessageDiv.textContent = 'Vui lòng chọn một bàn trước khi đặt.';
            reservationMessageDiv.classList.add('error');
            return;
        }

        const formData = new FormData(this);
        const data = Object.fromEntries(formData.entries());
        data.table_id = selectedTableId; // Đảm bảo gửi đúng ID bàn đã chọn

        // Kiểm tra xem bàn đã chọn có còn trống không trước khi gửi
        const currentTableStatus = restaurantTables.find(t => t.id === selectedTableId);
        if (!currentTableStatus || currentTableStatus.status === 'reserved') {
            reservationMessageDiv.textContent = `Bàn ${selectedTableId} đã có người đặt hoặc không khả dụng. Vui lòng chọn bàn khác.`;
            reservationMessageDiv.classList.add('error');
            selectedTableId = null; // Reset bàn đã chọn
            tableIdInput.value = ''; // Xóa bàn đã chọn trong input
            confirmTableSelectionBtn.style.display = 'none'; // Ẩn nút xác nhận
            updateTableMapAndCounts(); // Cập nhật lại trạng thái bàn
            attachTableClickHandlers(); // Gán lại event listener
            return;
        }

        try {
            // Giả lập gửi dữ liệu đến máy chủ
            // Trong thực tế, bạn sẽ gửi AJAX request (fetch hoặc XMLHttpRequest)
            const response = await new Promise(resolve => {
                setTimeout(() => {
                    // Giả lập kết quả thành công hoặc thất bại
                    const success = Math.random() > 0.1; // 90% thành công, 10% thất bại
                    if (success) {
                        // Cập nhật trạng thái bàn trong mảng giả lập
                        const index = restaurantTables.findIndex(t => t.id === selectedTableId);
                        if (index !== -1) {
                            restaurantTables[index].status = 'reserved';
                        }
                        resolve({ ok: true, json: () => Promise.resolve({ success: true, message: 'Đặt bàn thành công! Chúng tôi sẽ liên hệ lại với bạn để xác nhận.' }) });
                    } else {
                        resolve({ ok: false, json: () => Promise.resolve({ success: false, message: 'Có lỗi xảy ra trong quá trình đặt bàn. Vui lòng thử lại.' }) });
                    }
                }, 1000); // Giả lập độ trễ mạng
            });

            const result = await response.json();

            if (response.ok && result.success) {
                reservationMessageDiv.textContent = result.message;
                reservationMessageDiv.classList.add('success');
                reservationSubmitForm.reset();
                tableIdInput.value = ''; // Xóa bàn đã chọn trong input
                selectedTableId = null; // Reset bàn đã chọn
                confirmTableSelectionBtn.style.display = 'none'; // Ẩn nút xác nhận
                reservationFormSection.style.display = 'none'; // Ẩn form sau khi đặt thành công
                
                updateTableMapAndCounts(); // Cập nhật lại trạng thái hiển thị của các bàn
                attachTableClickHandlers(); // Gán lại event listener cho các bàn sau khi cập nhật
                
                // Quay lại màn hình khởi tạo hoặc sơ đồ bàn
                initialReservationSection.style.display = 'block'; // Hiển thị lại phần khởi tạo
                tableStatusAndMap.style.display = 'none'; // Ẩn sơ đồ bàn
                initialReservationSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

            } else {
                reservationMessageDiv.textContent = result.message || 'Lỗi kết nối máy chủ. Vui lòng thử lại sau.';
                reservationMessageDiv.classList.add('error');
                // Nếu đặt bàn thất bại, bàn vẫn sẽ giữ trạng thái available (nếu ban đầu nó là available)
                // không cần thay đổi trạng thái bàn ở đây
            }
        } catch (error) {
            console.error('Error:', error);
            reservationMessageDiv.textContent = 'Lỗi kết nối máy chủ. Vui lòng thử lại sau.';
            reservationMessageDiv.classList.add('error');
        }
    });

    // Ban đầu, không cần gọi updateTableMapAndCounts() hay attachTableClickHandlers()
    // vì sơ đồ bàn đã bị ẩn. Chúng sẽ được gọi khi người dùng nhấn nút "Bắt đầu đặt bàn ngay!".

});
// Hàm để tải trạng thái bàn từ backend
async function fetchTableStatus() {
    try {
        const response = await fetch('/api/tables'); // Gọi API GET /api/tables
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        if (data.success) {
            // Cập nhật mảng restaurantTables cục bộ dựa trên dữ liệu từ backend
            // Đảm bảo cấu trúc dữ liệu từ backend khớp với expectedTableState (id, name, status, capacity)
            restaurantTables = data.tables; // Cập nhật biến toàn cục hoặc biến trong scope

            updateTableMapAndCounts(); // Cập nhật UI sơ đồ bàn
            attachTableClickHandlers(); // Gán lại các event listener nếu cần
        } else {
            console.error('Failed to fetch table status:', data.message);
        }
    } catch (error) {
        console.error('Error fetching table status:', error);
        // Hiển thị thông báo lỗi cho người dùng nếu cần
    }
}

// ... (Trong phần xử lý 'click' của nút "Bắt đầu đặt bàn ngay!" của bạn)
// Thay vì chỉ hiển thị, hãy gọi hàm fetchTableStatus()
document.getElementById('start-reservation-btn').addEventListener('click', () => {
    initialReservationSection.style.display = 'none';
    tableStatusAndMap.style.display = 'block';
    fetchTableStatus(); // <--- GỌI HÀM NÀY ĐỂ TẢI DỮ LIỆU BÀN MỚI NHẤT
    tableStatusAndMap.scrollIntoView({ behavior: 'smooth', block: 'start' });
});


// ... (trong handleReservationFormSubmit)
// Sau khi đặt bàn thành công, gọi lại fetchTableStatus để cập nhật trạng thái bàn trên UI
// Dòng này đã có trong script.js của bạn: updateTableMapAndCounts();
// Có thể bạn muốn thay bằng fetchTableStatus() để luôn lấy dữ liệu mới nhất từ server
if (response.ok && result.success) {
    // ...
    // updateTableMapAndCounts(); // Có thể thay bằng fetchTableStatus();
    fetchTableStatus(); // <-- Đảm bảo cập nhật trạng thái bàn mới nhất sau khi đặt
    // ...
}

// ... (trong handleCancelReservation)
// Tương tự, sau khi hủy đặt bàn thành công, gọi lại fetchTableStatus
// Dòng này đã có trong script.js của bạn: updateTableMapAndCounts();
// Có thể bạn muốn thay bằng fetchTableStatus() để luôn lấy dữ liệu mới nhất từ server
if (response.ok && result.success) {
    // ...
    // updateTableMapAndCounts(); // Có thể thay bằng fetchTableStatus();
    fetchCustomerReservations(); // Tải lại danh sách đặt chỗ của khách
    fetchTableStatus(); // <-- Cập nhật trạng thái bàn sau khi hủy
    // ...
}

// ... (API /api/my-reservations trong script.js)
// Khi fetchCustomerReservations được gọi, bạn cần gửi token của người dùng (nếu có đăng nhập cho khách hàng)
async function fetchCustomerReservations() {
    const userId = localStorage.getItem('userId'); // Hoặc lấy từ token
    const userToken = localStorage.getItem('userToken'); // Nếu bạn có hệ thống đăng nhập cho khách hàng
    
    // Nếu bạn muốn API /api/my-reservations được bảo vệ, bạn cần gửi token
    const headers = {};
    if (userToken) {
        headers['Authorization'] = `Bearer ${userToken}`;
    }

    try {
        const response = await fetch('/api/my-reservations', { headers: headers }); // <-- Thêm headers
        // ... (phần còn lại của hàm này)
    } catch (error) {
        // ...
    }
}
// End of $(document).ready function
