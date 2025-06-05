// server.js
const mysql = require('mysql2/promise'); //
const express = require('express'); //
const path = require('path'); //

const dbConfig = {
    host: 'localhost', //
    user: 'root', // Thay bằng tên người dùng CSDL của bạn
    password: '', // Thay bằng mật khẩu CSDL của bạn
    database: 'restaurant', // Tên cơ sở dữ liệu của bạn
    waitForConnections: true, //
    connectionLimit: 10, // Số lượng kết nối tối đa trong pool
    queueLimit: 0 //
};

const pool = mysql.createPool(dbConfig); // Tạo một "pool" kết nối để quản lý và tái sử dụng kết nối hiệu quả

async function testDbConnection() { // Hàm kiểm tra kết nối (tùy chọn)
    try {
        const connection = await pool.getConnection(); //
        console.log('Đã kết nối thành công tới cơ sở dữ liệu MySQL!'); //
        connection.release(); // Trả kết nối về pool
    } catch (error) {
        console.error('Không thể kết nối tới cơ sở dữ liệu:', error); //
    }
}

testDbConnection(); // Gọi để kiểm tra khi server khởi động

const app = express(); //
const port = 3000; // Bạn có thể chọn một cổng khác nếu muốn

app.use(express.json()); // Cho phép server đọc JSON từ request body
app.use(express.urlencoded({ extended: true })); // Cho phép server đọc dữ liệu form truyền thống

app.use(express.static(__dirname)); // Phục vụ tệp từ thư mục hiện tại của server.js

// API Endpoint để lấy danh sách các món ăn từ bảng menu_items
app.get('/api/menu-items', async (req, res) => { //
    const category = req.query.category; // Lấy category từ query param, ví dụ: /api/menu-items?category=Pizza

    try {
        let sql = "SELECT id, name, description, price, image_url, category FROM menu_items"; //
        const queryParams = []; //

        if (category) { //
            sql += " WHERE category = ?"; //
            queryParams.push(category); //
        }

        const [rows] = await pool.query(sql, queryParams); //
        res.json(rows); // Trả về danh sách món ăn dưới dạng JSON
    } catch (error) {
        console.error('Lỗi khi lấy dữ liệu menu_items:', error); //
        res.status(500).json({ error: 'Lỗi máy chủ khi lấy thực đơn' }); //
    }
});

// Endpoint để lấy trạng thái tất cả các bàn
app.get('/api/tables', async (req, res) => { //
    try {
        const [rows] = await pool.query("SELECT id, name, seat_capacity, status FROM tables"); //
        res.json(rows); //
    } catch (err) {
        console.error('Lỗi khi lấy danh sách bàn:', err); //
        res.status(500).json({ error: 'Lỗi khi truy vấn danh sách bàn' }); //
    }
});

// Endpoint để xử lý đặt bàn (bao gồm cập nhật trạng thái bàn)
app.post('/api/reservations', async (req, res) => { //
    const { customer_name, customer_phone, customer_email, number_of_guests, reservation_date, reservation_time, notes, table_id } = req.body; //

    if (!customer_name || !customer_phone || !customer_email || !number_of_guests || !reservation_date || !reservation_time || !table_id) { //
        return res.status(400).json({ success: false, error: 'Vui lòng điền đầy đủ thông tin bắt buộc và chọn bàn.' });
    }

    const guests = parseInt(number_of_guests); //
    if (isNaN(guests) || guests <= 0) { //
        return res.status(400).json({ success: false, error: 'Số khách không hợp lệ. Vui lòng nhập số nguyên dương.' }); //
    }

    let connection;
    try {
        connection = await pool.getConnection(); //
        await connection.beginTransaction(); // Bắt đầu transaction

        // 1. Kiểm tra trạng thái bàn và lấy thông tin bàn
        const [tables] = await connection.execute('SELECT status FROM tables WHERE id = ? FOR UPDATE', [table_id]);
        if (tables.length === 0) {
            await connection.rollback(); //
            return res.status(404).json({ success: false, error: 'Bàn không tồn tại.' });
        }
        if (tables[0].status === 'reserved') {
            await connection.rollback(); //
            return res.status(409).json({ success: false, error: 'Bàn này hiện đang được đặt. Vui lòng chọn bàn khác.' });
        }

        // 2. Cập nhật trạng thái bàn thành 'reserved'
        await connection.execute('UPDATE tables SET status = ? WHERE id = ?', ['reserved', table_id]);

        // 3. Chèn thông tin đặt chỗ vào bảng `reservations`
        const [result] = await connection.execute(
            'INSERT INTO reservations (customer_name, customer_phone, customer_email, number_of_guests, reservation_date, reservation_time, notes, table_id, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [customer_name, customer_phone, customer_email, guests, reservation_date, reservation_time, notes || '', table_id, 'pending']
        );

        await connection.commit(); // Commit transaction

        res.status(200).json({ success: true, message: 'Đặt bàn thành công! Mã đặt chỗ của bạn là: ' + result.insertId });

    } catch (error) {
        if (connection) {
            await connection.rollback(); // Rollback nếu có lỗi
        }
        console.error('Lỗi khi xử lý đặt bàn:', error); //
        res.status(500).json({ success: false, error: 'Lỗi server nội bộ khi đặt bàn. Vui lòng thử lại.' });
    } finally {
        if (connection) {
            connection.release(); // Trả kết nối về pool (thay vì connection.end())
        }
    }
});

// API Endpoint để xử lý tin nhắn liên hệ từ contact.html
app.post('/api/contact', async (req, res) => { //
    const { name, mail, comment } = req.body; // 'name', 'mail', 'comment' là các trường trong form contact.html

    if (!name || !mail || !comment) { //
        return res.status(400).json({ error: 'Vui lòng điền đầy đủ thông tin bắt buộc (Tên, Email, Tin nhắn).' }); //
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) { //
        return res.status(400).json({ error: 'Địa chỉ email không hợp lệ.' }); //
    }

    try {
        const sql = "INSERT INTO contact_messages (sender_name, sender_email, subject, message) VALUES (?, ?, ?, ?)"; //
        const [result] = await pool.query(sql, [name, mail, "Contact Form Message", comment]); // "Contact Form Message" là subject mặc định
        
        res.json({ success: true, message: 'Tin nhắn của bạn đã được gửi thành công!', messageId: result.insertId }); //
    } catch (error) {
        console.error('Lỗi khi lưu tin nhắn liên hệ:', error); //
        res.status(500).json({ error: 'Lỗi máy chủ khi gửi tin nhắn liên hệ.' }); //
    }
});

app.listen(port, () => { // Khởi động server
    console.log(`Máy chủ Node.js đang chạy tại http://localhost:${port}`); //
    console.log(`Phục vụ các tệp tĩnh từ thư mục: ${__dirname}`); //
});
