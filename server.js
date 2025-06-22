// server.js
const mysql = require('mysql2/promise');
const express = require('express');
const path = require('path');
const bcrypt = require('bcryptjs'); 
const jwt = require('jsonwebtoken');

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
const SECRET_KEY = 'your_super_secret_key_for_jwt_signing_1234567890abcdef';

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
// Middleware để xác thực JWT từ header Authorization
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Định dạng: "Bearer TOKEN"

    if (token == null) {
        return res.status(401).json({ message: 'Không có token xác thực.' });
    }

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) {
            // console.error("JWT Verification Error:", err); // Để debug
            return res.status(403).json({ message: 'Token không hợp lệ hoặc hết hạn.' });
        }
        req.user = user; // Gán thông tin người dùng đã giải mã vào request
        next();
    });
};

// Middleware để kiểm tra vai trò người dùng
const authorizeRoles = (roles) => {
    return (req, res, next) => {
        // Đảm bảo req.user tồn tại và vai trò của người dùng nằm trong danh sách các vai trò được phép
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({ message: 'Bạn không có quyền truy cập vào tài nguyên này.' });
        }
        next();
    };
};
app.post('/api/auth/register', async (req, res) => {
    const { username, password, email, role = 'customer' } = req.body; // Mặc định là 'customer'

    if (!username || !password || !email) {
        return res.status(400).json({ success: false, message: 'Vui lòng cung cấp đầy đủ tên đăng nhập, mật khẩu và email.' });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10); // Hash mật khẩu với salt 10

        const [result] = await pool.query(
            'INSERT INTO users (username, password, email, role) VALUES (?, ?, ?, ?)',
            [username, hashedPassword, email, role]
        );
        res.status(201).json({ success: true, message: 'Đăng ký tài khoản thành công!', userId: result.insertId });
    } catch (error) {
        console.error('Lỗi khi đăng ký người dùng:', error);
        if (error.code === 'ER_DUP_ENTRY') { // Lỗi nếu username/email đã tồn tại
            return res.status(409).json({ success: false, message: 'Tên đăng nhập hoặc Email đã tồn tại.' });
        }
        res.status(500).json({ success: false, message: 'Lỗi máy chủ khi đăng ký.' });
    }
});

// API Đăng nhập
app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ success: false, message: 'Vui lòng nhập tên đăng nhập và mật khẩu.' });
    }

    try {
        const [rows] = await pool.query('SELECT id, username, password, role FROM users WHERE username = ?', [username]);
        const user = rows[0];

        if (!user) {
            return res.status(400).json({ success: false, message: 'Tên đăng nhập không tồn tại.' });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(400).json({ success: false, message: 'Mật khẩu không đúng.' });
        }

        // Tạo JWT
        const token = jwt.sign(
            { id: user.id, username: user.username, role: user.role },
            SECRET_KEY,
            { expiresIn: '1h' } // Token sẽ hết hạn sau 1 giờ
        );

        res.json({ success: true, message: 'Đăng nhập thành công!', token: token, user: { id: user.id, username: user.username, role: user.role } });

    } catch (error) {
        console.error('Lỗi đăng nhập:', error);
        res.status(500).json({ success: false, message: 'Lỗi máy chủ.' });
    }
});

// API Lấy thông tin người dùng hiện tại (để kiểm tra xem đã đăng nhập chưa)
app.get('/api/auth/me', authenticateToken, (req, res) => {
    res.json({ success: true, user: req.user });
});


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
// API Thêm món ăn mới (chỉ admin)
app.post('/api/admin/menu-items', authenticateToken, authorizeRoles(['admin']), async (req, res) => {
    const { name, description, price, image_url, category } = req.body;
    if (!name || !price || !category) {
        return res.status(400).json({ success: false, message: 'Vui lòng cung cấp tên, giá và danh mục món ăn.' });
    }
    try {
        const [result] = await pool.query('INSERT INTO menu_items (name, description, price, image_url, category) VALUES (?, ?, ?, ?, ?)', [name, description, price, image_url, category]);
        res.status(201).json({ success: true, message: 'Thêm món ăn thành công!', itemId: result.insertId });
    } catch (error) {
        console.error('Lỗi khi thêm món ăn:', error);
        res.status(500).json({ success: false, message: 'Lỗi máy chủ.' });
    }
});

// API Cập nhật món ăn (chỉ admin)
app.put('/api/admin/menu-items/:id', authenticateToken, authorizeRoles(['admin']), async (req, res) => {
    const itemId = req.params.id;
    const { name, description, price, image_url, category } = req.body;
    if (!name || !price || !category) {
        return res.status(400).json({ success: false, message: 'Vui lòng cung cấp tên, giá và danh mục món ăn.' });
    }
    try {
        const [result] = await pool.query('UPDATE menu_items SET name = ?, description = ?, price = ?, image_url = ?, category = ? WHERE id = ?', [name, description, price, image_url, category, itemId]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy món ăn.' });
        }
        res.json({ success: true, message: 'Cập nhật món ăn thành công.' });
    } catch (error) {
        console.error('Lỗi khi cập nhật món ăn:', error);
        res.status(500).json({ success: false, message: 'Lỗi máy chủ.' });
    }
});

// API Xóa món ăn (chỉ admin)
app.delete('/api/admin/menu-items/:id', authenticateToken, authorizeRoles(['admin']), async (req, res) => {
    const itemId = req.params.id;
    try {
        const [result] = await pool.query('DELETE FROM menu_items WHERE id = ?', [itemId]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy món ăn.' });
        }
        res.json({ success: true, message: 'Xóa món ăn thành công.' });
    } catch (error) {
        console.error('Lỗi khi xóa món ăn:', error);
        res.status(500).json({ success: false, message: 'Lỗi máy chủ.' });
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
app.put('/api/admin/tables/:id/status', authenticateToken, authorizeRoles(['admin']), async (req, res) => {
    const tableId = req.params.id;
    const { status } = req.body; // status có thể là 'available', 'reserved', 'occupied', 'maintenance'

    if (!status) {
        return res.status(400).json({ success: false, message: 'Vui lòng cung cấp trạng thái bàn.' });
    }

    try {
        const [result] = await pool.query('UPDATE tables SET status = ? WHERE id = ?', [status, tableId]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy bàn.' });
        }
        res.json({ success: true, message: 'Cập nhật trạng thái bàn thành công.' });
    } catch (error) {
        console.error('Lỗi khi cập nhật trạng thái bàn:', error);
        res.status(500).json({ success: false, message: 'Lỗi máy chủ.' });
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
// API Lấy tất cả đặt chỗ (chỉ admin)
app.get('/api/admin/reservations', authenticateToken, authorizeRoles(['admin']), async (req, res) => {
    try {
        // Có thể JOIN với bảng users và tables để lấy thêm thông tin
        const sql = `
            SELECT 
                r.id, r.customer_name, r.customer_phone, r.customer_email, r.number_of_guests, 
                r.reservation_date, r.reservation_time, r.status, r.notes, 
                t.name as table_name, t.capacity as table_capacity
            FROM reservations r
            JOIN tables t ON r.table_id = t.id
            ORDER BY r.reservation_date DESC, r.reservation_time DESC`;
        const [rows] = await pool.query(sql);
        res.json({ success: true, reservations: rows });
    } catch (error) {
        console.error('Lỗi khi lấy danh sách đặt chỗ:', error);
        res.status(500).json({ success: false, message: 'Lỗi máy chủ.' });
    }
});

// API Cập nhật trạng thái đặt chỗ (chỉ admin)
app.put('/api/admin/reservations/:id/status', authenticateToken, authorizeRoles(['admin']), async (req, res) => {
    const reservationId = req.params.id;
    const { status } = req.body; // Ví dụ: 'confirmed', 'cancelled', 'pending'

    if (!status) {
        return res.status(400).json({ success: false, message: 'Vui lòng cung cấp trạng thái đặt chỗ.' });
    }

    try {
        const [result] = await pool.query('UPDATE reservations SET status = ? WHERE id = ?', [status, reservationId]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy đặt chỗ.' });
        }
        res.json({ success: true, message: 'Cập nhật trạng thái đặt chỗ thành công.' });
    } catch (error) {
        console.error('Lỗi khi cập nhật trạng thái đặt chỗ:', error);
        res.status(500).json({ success: false, message: 'Lỗi máy chủ.' });
    }
});

// API lấy đặt chỗ của riêng người dùng (cho script.js của khách hàng)
// Yêu cầu người dùng phải đăng nhập (có token)
app.get('/api/my-reservations', authenticateToken, async (req, res) => {
    // Giả định bảng `reservations` có cột `user_id` để liên kết với `users`
    // Nếu không, bạn cần thêm cột này vào `reservations` trong restaurant.sql
    // và khi tạo đặt chỗ, lưu `user_id` của người đặt.
    try {
        const userId = req.user.id; // Lấy ID người dùng từ JWT đã xác thực
        const [rows] = await pool.query('SELECT * FROM reservations WHERE customer_email = ? ORDER BY reservation_date DESC, reservation_time DESC', [req.user.email]); // Hoặc dùng customer_id nếu có
        res.json({ success: true, reservations: rows });
    } catch (error) {
        console.error('Lỗi khi lấy đặt chỗ của khách hàng:', error);
        res.status(500).json({ success: false, message: 'Lỗi máy chủ.' });
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
// server.js

// ... (các đoạn code đã có: import, dbConfig, pool, testDbConnection, app.use, các API khác) ...

// API Endpoint để xử lý việc đặt bàn mới
app.post('/api/reservations', async (req, res) => {
    const { customer_name, customer_email, customer_phone, reservation_date, reservation_time, number_of_guests, table_id, notes } = req.body;

    // 1. Kiểm tra dữ liệu đầu vào cơ bản
    if (!customer_name || !customer_email || !customer_phone || !reservation_date || !reservation_time || !number_of_guests || !table_id) {
        return res.status(400).json({ success: false, message: 'Vui lòng điền đầy đủ các thông tin bắt buộc (Tên, Email, SĐT, Ngày, Giờ, Số khách, Bàn).' });
    }

    // 2. Validate dữ liệu đầu vào (ví dụ: số điện thoại, email hợp lệ, số khách > 0)
    if (isNaN(number_of_guests) || parseInt(number_of_guests) <= 0) {
        return res.status(400).json({ success: false, message: 'Số lượng khách không hợp lệ.' });
    }
    // Có thể thêm regex kiểm tra email/phone nếu cần

    // 3. Kiểm tra tính khả dụng của bàn (RẤT QUAN TRỌNG TRONG THỰC TẾ)
    // Để đơn giản hóa, ở đây ta chỉ kiểm tra xem bàn có tồn tại không.
    // Trong một ứng dụng thực tế, bạn cần kiểm tra xem bàn có bị đặt vào cùng thời gian đó không.
    try {
        const [tables] = await pool.query('SELECT * FROM tables WHERE id = ?', [table_id]);
        if (tables.length === 0) {
            return res.status(404).json({ success: false, message: 'Bàn bạn chọn không tồn tại.' });
        }
        // Thêm logic phức tạp hơn ở đây để kiểm tra trùng lặp lịch đặt
        // Ví dụ: SELECT * FROM reservations WHERE table_id = ? AND reservation_date = ? AND reservation_time = ?
        // Nếu có kết quả, trả về lỗi "Bàn đã có người đặt vào thời gian này".

    } catch (error) {
        console.error('Lỗi khi kiểm tra bàn:', error);
        return res.status(500).json({ success: false, message: 'Lỗi máy chủ khi kiểm tra bàn.' });
    }

    // 4. Lưu thông tin đặt bàn vào cơ sở dữ liệu
    try {
        const sql = `
            INSERT INTO reservations (customer_name, customer_email, customer_phone, reservation_date, reservation_time, number_of_guests, table_id, notes, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
        `;
        const [result] = await pool.query(sql, [
            customer_name,
            customer_email,
            customer_phone,
            reservation_date,
            reservation_time,
            parseInt(number_of_guests), // Đảm bảo là số nguyên
            table_id,
            notes || '', // Gán chuỗi rỗng nếu notes là null/undefined
        ]);

        // Cập nhật trạng thái bàn (nếu muốn)
        // Ví dụ: Đặt trạng thái bàn là 'reserved' hoặc 'occupied' ngay sau khi đặt thành công
        // await pool.query('UPDATE tables SET status = ? WHERE id = ?', ['reserved', table_id]);

        res.status(201).json({ success: true, message: 'Đặt bàn thành công!', reservationId: result.insertId });
    } catch (error) {
        console.error('Lỗi khi lưu đặt bàn:', error);
        res.status(500).json({ success: false, message: 'Lỗi máy chủ khi đặt bàn. Vui lòng thử lại sau.' });
    }
});


// API Endpoint để lấy danh sách bàn và trạng thái của chúng
app.get('/api/tables', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT id, name, capacity, status FROM tables');
        res.json({ success: true, tables: rows });
    } catch (error) {
        console.error('Lỗi khi lấy danh sách bàn:', error);
        res.status(500).json({ success: false, message: 'Lỗi máy chủ khi lấy danh sách bàn.' });
    }
});

// API Endpoint để lấy các đặt bàn của khách hàng theo số điện thoại (cho chức năng tra cứu)
app.get('/api/customer-reservations', async (req, res) => {
    const { phone } = req.query; // Lấy số điện thoại từ query parameter

    if (!phone) {
        return res.status(400).json({ success: false, message: 'Vui lòng cung cấp số điện thoại để tra cứu.' });
    }

    try {
        // Lấy thông tin đặt bàn dựa trên số điện thoại và sắp xếp theo ngày giờ
        const sql = `
            SELECT r.*, t.name AS table_name
            FROM reservations r
            JOIN tables t ON r.table_id = t.id
            WHERE r.customer_phone = ?
            ORDER BY r.reservation_date DESC, r.reservation_time DESC
        `;
        const [rows] = await pool.query(sql, [phone]);
        res.json({ success: true, reservations: rows });
    } catch (error) {
        console.error('Lỗi khi tra cứu đặt bàn của khách hàng:', error);
        res.status(500).json({ success: false, message: 'Lỗi máy chủ khi tra cứu đặt bàn.' });
    }
});

// API Endpoint để hủy đặt bàn (DELETE request)
app.delete('/api/reservations/:id', async (req, res) => {
    const reservationId = req.params.id; // Lấy ID đặt bàn từ URL

    try {
        // Cập nhật trạng thái đặt bàn thành 'cancelled' (hoặc xóa hẳn nếu muốn)
        const [result] = await pool.query('UPDATE reservations SET status = ? WHERE id = ?', ['cancelled', reservationId]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy đặt bàn để hủy.' });
        }

        // Nếu bạn muốn giải phóng bàn ngay lập tức sau khi hủy
        // Lấy table_id từ đặt bàn bị hủy
        const [reservation] = await pool.query('SELECT table_id FROM reservations WHERE id = ?', [reservationId]);
        if (reservation.length > 0) {
            const tableId = reservation[0].table_id;
            await pool.query('UPDATE tables SET status = ? WHERE id = ?', ['available', tableId]);
        }

        res.json({ success: true, message: `Đặt bàn #${reservationId} đã được hủy thành công.` });
    } catch (error) {
        console.error('Lỗi khi hủy đặt bàn:', error);
        res.status(500).json({ success: false, message: 'Lỗi máy chủ khi hủy đặt bàn.' });
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
// API Lấy tất cả người dùng (chỉ admin)
app.get('/api/admin/users', authenticateToken, authorizeRoles(['admin']), async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT id, username, email, role FROM users');
        res.json({ success: true, users: rows });
    } catch (error) {
        console.error('Lỗi khi lấy danh sách người dùng:', error);
        res.status(500).json({ success: false, message: 'Lỗi máy chủ.' });
    }
});

// API Cập nhật vai trò người dùng (chỉ admin)
app.put('/api/admin/users/:id/role', authenticateToken, authorizeRoles(['admin']), async (req, res) => {
    const userId = req.params.id;
    const { role } = req.body;

    if (!role) {
        return res.status(400).json({ success: false, message: 'Vui lòng cung cấp vai trò mới.' });
    }

    try {
        const [result] = await pool.query('UPDATE users SET role = ? WHERE id = ?', [role, userId]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng.' });
        }
        res.json({ success: true, message: 'Cập nhật vai trò người dùng thành công.' });
    } catch (error) {
        console.error('Lỗi khi cập nhật vai trò người dùng:', error);
        res.status(500).json({ success: false, message: 'Lỗi máy chủ.' });
    }
});

// API Xóa người dùng (chỉ admin)
app.delete('/api/admin/users/:id', authenticateToken, authorizeRoles(['admin']), async (req, res) => {
    const userId = req.params.id;

    // Không cho phép admin tự xóa chính mình hoặc xóa admin khác nếu không có siêu quyền
    if (req.user.id == userId && req.user.role === 'admin') {
        return res.status(403).json({ success: false, message: 'Admin không thể tự xóa tài khoản của mình.' });
    }

    try {
        const [result] = await pool.query('DELETE FROM users WHERE id = ?', [userId]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng.' });
        }
        res.json({ success: true, message: 'Xóa người dùng thành công.' });
    } catch (error) {
        console.error('Lỗi khi xóa người dùng:', error);
        res.status(500).json({ success: false, message: 'Lỗi máy chủ.' });
    }
});
// ... rest of your server.js code ...
