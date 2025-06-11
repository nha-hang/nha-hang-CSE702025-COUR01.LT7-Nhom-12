// server.js
const mysql = require('mysql2/promise');
const express = require('express');
const path = require('path');

const dbConfig = {
    host: 'localhost',
    user: 'root', // Thay bằng tên người dùng CSDL của bạn
    password: '', // Thay bằng mật khẩu CSDL của bạn
    database: 'restaurant', // Tên cơ sở dữ liệu của bạn
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

const pool = mysql.createPool(dbConfig);

async function testDbConnection() {
    try {
        const connection = await pool.getConnection();
        console.log('Đã kết nối thành công tới cơ sở dữ liệu MySQL!');
        connection.release();
    } catch (error) {
        console.error('Không thể kết nối tới cơ sở dữ liệu:', error);
    }
}

testDbConnection();

const app = express();
const port = 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(__dirname));

// API Endpoint để lấy danh sách các món ăn từ bảng menu_items
app.get('/api/menu-items', async (req, res) => {
    const category = req.query.category;

    try {
        let sql = "SELECT id, name, description, price, image_url, category FROM menu_items";
        const queryParams = [];

        if (category) {
            sql += " WHERE category = ?";
            queryParams.push(category);
        }

        const [rows] = await pool.query(sql, queryParams);
        res.json(rows);
    } catch (error) {
        console.error('Lỗi khi lấy dữ liệu menu_items:', error);
        res.status(500).json({ error: 'Lỗi máy chủ khi lấy thực đơn' });
    }
});

// Endpoint để lấy trạng thái tất cả các bàn
app.get('/api/tables', async (req, res) => {
    try {
        const [rows] = await pool.query("SELECT id, name, seat_capacity, status FROM tables");
        res.json(rows);
    } catch (err) {
        console.error('Lỗi khi lấy danh sách bàn:', err);
        res.status(500).json({ error: 'Lỗi khi truy vấn danh sách bàn' });
    }
});

// Endpoint để xử lý đặt bàn (bao gồm cập nhật trạng thái bàn)
app.post('/api/reservations', async (req, res) => {
    const { customer_name, customer_phone, customer_email, number_of_guests, reservation_date, reservation_time, notes, table_id } = req.body;

    if (!customer_name || !customer_phone || !number_of_guests || !reservation_date || !reservation_time || !table_id) {
        return res.status(400).json({ success: false, error: 'Vui lòng điền đầy đủ thông tin bắt buộc và chọn bàn.' });
    }
    // customer_email is optional, allow it to be empty string
    const email = customer_email || ''; 

    const guests = parseInt(number_of_guests);
    if (isNaN(guests) || guests <= 0) {
        return res.status(400).json({ success: false, error: 'Số khách không hợp lệ. Vui lòng nhập số nguyên dương.' });
    }

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        // 1. Kiểm tra trạng thái bàn và lấy thông tin bàn
        const [tables] = await connection.execute('SELECT status FROM tables WHERE id = ? FOR UPDATE', [table_id]);
        if (tables.length === 0) {
            await connection.rollback();
            return res.status(404).json({ success: false, error: 'Bàn không tồn tại.' });
        }
        if (tables[0].status === 'reserved') {
            await connection.rollback();
            return res.status(409).json({ success: false, error: 'Bàn này hiện đang được đặt. Vui lòng chọn bàn khác.' });
        }

        // 2. Cập nhật trạng thái bàn thành 'reserved'
        await connection.execute('UPDATE tables SET status = ? WHERE id = ?', ['reserved', table_id]);

        // 3. Chèn thông tin đặt chỗ vào bảng `reservations`
        const [result] = await connection.execute(
            'INSERT INTO reservations (customer_name, customer_phone, customer_email, number_of_guests, reservation_date, reservation_time, notes, table_id, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [customer_name, customer_phone, email, guests, reservation_date, reservation_time, notes || '', table_id, 'pending']
        );

        await connection.commit();

        res.status(200).json({ success: true, message: 'Đặt bàn thành công! Mã đặt chỗ của bạn là: ' + result.insertId, reservationId: result.insertId });

    } catch (error) {
        if (connection) {
            await connection.rollback();
        }
        console.error('Lỗi khi xử lý đặt bàn:', error);
        res.status(500).json({ success: false, error: 'Lỗi server nội bộ khi đặt bàn. Vui lòng thử lại.' });
    } finally {
        if (connection) {
            connection.release();
        }
    }
});

// NEW: Endpoint để hủy đặt bàn
app.delete('/api/reservations/:id', async (req, res) => {
    const reservationId = req.params.id;
    let connection;

    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        // 1. Lấy thông tin đặt chỗ để xác định table_id
        const [reservations] = await connection.execute('SELECT table_id, status FROM reservations WHERE id = ? FOR UPDATE', [reservationId]);

        if (reservations.length === 0) {
            await connection.rollback();
            return res.status(404).json({ success: false, error: 'Không tìm thấy đặt chỗ này.' });
        }

        const reservation = reservations[0];
        if (reservation.status === 'cancelled' || reservation.status === 'completed') {
            await connection.rollback();
            return res.status(400).json({ success: false, error: 'Đặt chỗ này đã được hủy hoặc đã hoàn thành.' });
        }

        const tableId = reservation.table_id;

        // 2. Cập nhật trạng thái đặt chỗ thành 'cancelled'
        await connection.execute('UPDATE reservations SET status = ? WHERE id = ?', ['cancelled', reservationId]);

        // 3. Cập nhật trạng thái bàn thành 'available'
        await connection.execute('UPDATE tables SET status = ? WHERE id = ?', ['available', tableId]);

        await connection.commit();

        res.status(200).json({ success: true, message: 'Hủy đặt chỗ thành công!' });

    } catch (error) {
        if (connection) {
            await connection.rollback();
        }
        console.error('Lỗi khi hủy đặt bàn:', error);
        res.status(500).json({ success: false, error: 'Lỗi server nội bộ khi hủy đặt bàn. Vui lòng thử lại.' });
    } finally {
        if (connection) {
            connection.release();
        }
    }
});

// NEW: Endpoint để lấy danh sách đặt bàn của khách hàng (ví dụ dựa trên số điện thoại hoặc email)
app.get('/api/customer-reservations', async (req, res) => {
    const { phone, email } = req.query; // Lấy thông tin từ query parameters

    if (!phone && !email) {
        return res.status(400).json({ success: false, error: 'Vui lòng cung cấp số điện thoại hoặc email để tìm kiếm đặt bàn.' });
    }

    try {
        let sql = `
            SELECT r.id, r.customer_name, r.customer_phone, r.customer_email,
                   r.number_of_guests, r.reservation_date, r.reservation_time,
                   r.notes, r.status, t.name as table_name
            FROM reservations r
            JOIN tables t ON r.table_id = t.id
            WHERE 1=1
        `;
        const queryParams = [];

        if (phone) {
            sql += ` AND r.customer_phone = ?`;
            queryParams.push(phone);
        }
        if (email) {
            sql += ` AND r.customer_email = ?`;
            queryParams.push(email);
        }
        // Thêm điều kiện để chỉ lấy các đặt chỗ chưa hoàn thành hoặc chưa hủy
        sql += ` AND r.status IN ('pending', 'confirmed') ORDER BY r.reservation_date DESC, r.reservation_time DESC`;

        const [rows] = await pool.query(sql, queryParams);
        res.json({ success: true, reservations: rows });

    } catch (error) {
        console.error('Lỗi khi lấy đặt bàn của khách hàng:', error);
        res.status(500).json({ success: false, error: 'Lỗi máy chủ khi lấy danh sách đặt bàn.' });
    }
});


// API Endpoint để xử lý tin nhắn liên hệ từ contact.html
app.post('/api/contact', async (req, res) => {
    const { name, mail, comment } = req.body;

    if (!name || !mail || !comment) {
        return res.status(400).json({ error: 'Vui lòng điền đầy đủ thông tin bắt buộc (Tên, Email, Tin nhắn).' });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) {
        return res.status(400).json({ error: 'Địa chỉ email không hợp lệ.' });
    }

    try {
        const sql = "INSERT INTO contact_messages (sender_name, sender_email, subject, message) VALUES (?, ?, ?, ?)";
        const [result] = await pool.query(sql, [name, mail, "Contact Form Message", comment]);
        
        res.json({ success: true, message: 'Tin nhắn của bạn đã được gửi thành công!', messageId: result.insertId });
    } catch (error) {
        console.error('Lỗi khi lưu tin nhắn liên hệ:', error);
        res.status(500).json({ error: 'Lỗi máy chủ khi gửi tin nhắn liên hệ.' });
    }
});

app.listen(port, () => {
    console.log(`Máy chủ Node.js đang chạy tại http://localhost:${port}`);
    console.log(`Phục vụ các tệp tĩnh từ thư mục: ${__dirname}`);
});
// ... existing server.js code ...

// API Endpoint để xử lý đánh giá từ khách hàng
app.post('/api/reviews', async (req, res) => {
    const { name, rating, comment } = req.body;

    // Basic validation
    if (!name || !rating || !comment) {
        return res.status(400).json({ success: false, error: 'Vui lòng điền đầy đủ thông tin (Tên, Số sao, Bình luận).' });
    }
    if (rating < 1 || rating > 5) {
        return res.status(400).json({ success: false, error: 'Số sao đánh giá phải từ 1 đến 5.' });
    }

    try {
        const sql = "INSERT INTO user_reviews (reviewer_name, rating, comment) VALUES (?, ?, ?)";
        const [result] = await pool.query(sql, [name, rating, comment]);

        res.json({ success: true, message: 'Đánh giá của bạn đã được gửi thành công!', reviewId: result.insertId });
    } catch (error) {
        console.error('Lỗi khi lưu đánh giá của khách hàng:', error);
        res.status(500).json({ success: false, error: 'Lỗi máy chủ khi lưu đánh giá.' });
    }
});

// API Endpoint để lấy các đánh giá (nếu bạn muốn hiển thị các đánh giá đã lưu)
app.get('/api/reviews', async (req, res) => {
    try {
        const sql = "SELECT reviewer_name, rating, comment, review_date FROM user_reviews ORDER BY review_date DESC";
        const [rows] = await pool.query(sql);
        res.json({ success: true, reviews: rows });
    } catch (error) {
        console.error('Lỗi khi lấy đánh giá của khách hàng:', error);
        res.status(500).json({ success: false, error: 'Lỗi máy chủ khi lấy danh sách đánh giá.' });
    }
});

// ... rest of your server.js code ...
