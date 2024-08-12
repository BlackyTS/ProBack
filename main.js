const pgp = require('pg-promise')()
const express = require('express')
const app = express()
const bcrypt = require('bcrypt')
const bodyParser = require('body-parser')
const cookieParser = require('cookie-parser')
const jwt = require('jsonwebtoken');
const cors = require('cors')

require('dotenv').config();

const corsOptions = {
    origin: 'http://localhost:3000',
    credentials: true,  
    optionsSuccessStatus: 200
}

app.use(cors(corsOptions));
app.use(express.json());
app.use(bodyParser.json());
app.use(cookieParser());

const secret = process.env.JWT_SECRET;

const port = 8000

const connectionOptions = {
    host: 'localhost',
    port: 5432,
    database: 'ProjectTEST',
    user: 'postgres',
    password: 'admin'
}

const db = pgp(connectionOptions);

//JWT function
const generateToken = (user) => {
    return jwt.sign({ id: user.user_id, role: user.user_role }, secret, { expiresIn: '72h' });
};

// ฟังก์ชัน Middleware สำหรับการตรวจสอบ JWT token
const authenticateToken = (req, res, next) => {
    const token = req.cookies['token'];
    if (token == null) {
        console.log('No token provided');
        return res.sendStatus(401); 
    }

    jwt.verify(token, secret, (err, user) => {
        if (err) {
            console.log('Token verification failed:', err);
            return res.sendStatus(403); 
        }
        req.user = user; 
        next();
    });
};

// Register
app.post('/register', async (req, res) => {
    const { email, password, firstname, lastname } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);

    try {
        const existingUser = await db.oneOrNone('SELECT * FROM users WHERE user_email = $1', [email]);
        if (existingUser) {
            return res.status(400).json({ message: 'Email already in use' });
        }
        await db.none('INSERT INTO users(user_email, user_password, user_firstname, user_lastname) VALUES($1, $2, $3, $4)', [email, hashedPassword, firstname, lastname]);
        res.status(200).json({ 
            message: 'User registered successfully',
            type: "ok"
         });
    } catch (error) {
        console.error('ERROR:', error);
        res.status(500).json({ massge : 'Error registering user'});
    }
});

// Login
app.post('/login', (req, res) => {
    const { email, password } = req.body;

    db.oneOrNone('SELECT * FROM users WHERE user_email = $1', [email])
        .then(async user => {
            if (!user) {
                return res.status(400).json({ message: 'Invalid email or password' });
            }
            const match = await bcrypt.compare(password, user.user_password);
            if (match) {
                const token = generateToken(user);
                res.cookie('token', token, { maxAge: 72*60*60*1000, httpOnly: true, secure: true, sameSite: 'none' }); // ตั้งค่า cookie สำหรับ JWT token
                res.status(200).json({ 
                    type: "ok",
                    message: 'Logged in successfully',
                    role: user.user_role
                });
            } else {
                res.status(400).json({ 
                    type: "no",
                    message: 'Invalid email or password' 
                });
            }
        })
        .catch(error => {
            console.error('ERROR:', error);
            res.status(500).json({ message: 'Server error' });
        });
});

// Logout
app.post('/logout', authenticateToken, (req, res) => {
    res.clearCookie('token', { httpOnly: true, secure: true, sameSite: 'none' });  // ลบ cookie ของ JWT token
    res.status(200).json({ 
        message: 'Logged out successfully',
        type: "ok"
    });
});

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// การเพิ่มชุดอุปกรณ์ใหม่
app.post('/devices/add', authenticateToken, async (req, res) => {
    const { id, name, description, limit } = req.body;
    try {
        // ตรวจสอบว่ามี device_id ซ้ำกันอยู่แล้วหรือไม่
        const existingDevice = await db.oneOrNone('SELECT * FROM device WHERE device_id = $1', [id]);
        if (existingDevice) {
            return res.status(400).json({ message: 'Device with this ID already exists' });
        }

        // เพิ่มอุปกรณ์
        await db.none(
            'INSERT INTO device(device_id, device_name, device_description, device_limit, device_availability) VALUES($1, $2, $3, $4, $5)',
            [id, name, description, limit, limit]
        );

        // เพิ่มรายการอุปกรณ์ใน each_device
        for (let i = 1; i <= limit; i++) {
            const itemId = `${i}`; // หรือวิธีการสร้าง ID ที่เหมาะสม
            await db.none(
                'INSERT INTO each_device(item_id, item_name, item_type, item_description, device_id, item_availability) VALUES($1, $2, $3, $4, $5, $6)',
                [itemId, `Item ${i}`, name, description, id, 'ready']
            );
        }

        res.status(200).json({ message: 'Device and items added successfully' });
    } catch (error) {
        console.error('ERROR:', error);
        res.status(500).json({ message: 'Error adding device and items' });
    }
});

/// เช็คชุดอุปกรณ์ที่เพิ่มมาทั้งหมด
app.get('/devices', authenticateToken, async (req, res) => {
    try {
        const devices = await db.any('SELECT * FROM device');
        res.status(200).json(devices);
    } catch (error) {
        console.error('ERROR:', error);
        res.status(500).json({ message: 'Error fetching devices' });
    }
});

// เช็คชุดอุปกรณ์แต่ละชุด
app.get('/devices/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        const device = await db.query('SELECT * FROM device WHERE device_id = $1', [id]);
        // ตรวจสอบว่ามีผลลัพธ์หรือไม่
        if (!device || device.length == 0) {
            return res.status(404).json({ massge: 'Device not found' });
        }

        // ส่งข้อมูลอุปกรณ์กลับไปยังผู้ใช้
        res.status(200).json(device[0]); // หรือใช้ device ถ้ามันไม่ใช่อาร์เรย์
    } catch (error) {
        console.error('ERROR:', error);
        res.status(500).json({ message: 'Error fetching device' });
    }
});

// แก้ไขชุดอุปกรณ์
app.put('/device/update', authenticateToken, async (req, res) => {
    const { id, name, approve, limit, description } = req.body;
    try {
        // ดึงค่า limit และ availability ปัจจุบันจากฐานข้อมูล
        const device = await db.one('SELECT device_limit, device_availability FROM device WHERE device_id = $1', [id]);

        // คำนวณความแตกต่างของค่า limit
        const limitDifference = limit - device.device_limit;

        // อัพเดตค่า limit และ availability ในตาราง device
        await db.none(
            'UPDATE device SET device_name = $1, device_approve = $2, device_limit = $3, device_availability = device_availability + $4 WHERE device_id = $5',
            [name, approve, limit, limitDifference, id]
        );

        // เพิ่มรายการใหม่ใน each_device ถ้าจำนวน limit เพิ่มขึ้น
        if (limitDifference > 0) {
            // ดึงรายการทั้งหมดที่มี device_id นี้จากฐานข้อมูล
            const existingItems = await db.any('SELECT item_id FROM each_device WHERE device_id = $1', [id]);

            const existingItemIds = new Set(existingItems.map(item => item.item_id));

            for (let i = 1; i <= limitDifference; i++) {
                const itemId = `${id}-${i + existingItems.length}`; // เพิ่มความยาวรายการปัจจุบันไปยัง i

                if (!existingItemIds.has(itemId)) {
                    console.log(`Adding Item ID: ${itemId}`); // เพิ่ม Debugging Log

                    await db.none(
                        'INSERT INTO each_device (item_id, item_name, item_type, item_description, device_id, item_availability) VALUES($1, $2, $3, $4, $5, $6)',
                        [itemId, `Item ${i + existingItems.length}`, 'some_type', description, id, 'ready']
                    );
                } else {
                    console.log(`Item ID ${itemId} already exists.`);
                }
            }
        } else if (limitDifference < 0) {
            // กรณีที่ limit ลดลง ลบรายการใน each_device ให้ตรงกับ limit ใหม่
            await db.none('DELETE FROM each_device WHERE device_id = $1 AND item_id > $2', [id, limit]);
        }

        res.status(200).json({ message: 'Device updated successfully' });
    } catch (error) {
        console.error('ERROR:', error);
        res.status(500).json({ message: 'Error updating device' });
    }
});

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// เช็คอุปกรณ์ทุกตัว
app.get('/device/each-item', authenticateToken, async (req, res) => {
    try {
        // ดึงข้อมูลอุปกรณ์ทั้งหมด
        const items = await db.any('SELECT * FROM each_device');

        // ตรวจสอบว่ามีอุปกรณ์ในฐานข้อมูลหรือไม่
        if (items.length == 0) {
            return res.status(404).json({ message: 'No device to view' });
        }

        // นับจำนวน item_availability ที่เป็น true และ false
        const availabilityCounts = await db.one(`
            SELECT 
                COUNT(*) FILTER (WHERE item_availability = 'ready') AS ready_count,
                COUNT(*) FILTER (WHERE item_availability = 'waiting for approve') AS waiting_for_approve_count,
                COUNT(*) FILTER (WHERE item_availability = 'borrowed') AS borrowed_count,
                COUNT(*) FILTER (WHERE item_availability = 'broken') AS broken_count
            FROM each_device
        `);

        // ส่งค่าตอบกลับ
        res.status(200).json({
            items,
            ready_count: availabilityCounts.ready_count,
            waiting_for_approve_count: availabilityCounts.waiting_for_approve_count,
            borrowed_count: availabilityCounts.borrowed_count,
            broken_count: availabilityCounts.broken_count
        });
    } catch (error) {
        console.error('ERROR:', error);
        res.status(500).json({ message: 'Error fetching each devices' });
    }
});

// เช็คอุปกรณ์แต่ละตัว
app.get('/device/each-item/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        const item = await db.query('SELECT * FROM each_device WHERE item_id = $1', [id]);
        // ตรวจสอบว่ามีผลลัพธ์หรือไม่
        if (!item || item == 0) {
            return res.status(404).json({ massge: 'Device not found' });
        }

        // ส่งข้อมูลอุปกรณ์กลับไปยังผู้ใช้
        res.status(200).json(item[0]); // หรือใช้ device ถ้ามันไม่ใช่อาร์เรย์
    } catch (error) {
        console.error('ERROR:', error);
        res.status(500).json({ message: 'Error fetching device' });
    }
});

// อัพเดทอุปกรณ์
app.put('/device/each-item/update', authenticateToken, async (req, res) => {
    const { id, name, type, description, availability } = req.body;  
    try {
        const result = await db.result('UPDATE each_device SET item_name = $1, item_type = $2, item_description = $3 , item_availability = $4 WHERE item_id = $5',[name, type, description, availability, id]);
        if (!result) {
            return res.status(404).json({ message: 'No device to update' });
        }
        res.status(200).json({ message: 'Items updated successfully.' });
    } catch (error) {
        console.error('ERROR:', error);
        res.status(500).json({ message: 'Error updating items.' });
    }
});

// ลบอุปกรณ์
app.delete('/device/each-item/delete', authenticateToken, async (req, res) => {
    const { id } = req.body; // รับค่า id จาก body ของคำขอ
    try {
        const result = await db.query('DELETE FROM each_device WHERE item_id = $1 RETURNING *', [id]);       
        res.status(200).json({ message: 'Device deleted successfully' });
    } catch (error) {
        console.error('ERROR:', error);
        res.status(500).json({ message: 'Error deleting device' });
    }
});
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// ดูคำร้องขอ
app.get('/admin/requests', authenticateToken, async (req,res) => {
    try {
        const requests = await db.any(`
            SELECT r.request_id, u.user_email, e.item_name, r.request_status, r.request_date, r.item_availability_status, r.admin_comment
            FROM requests r
            JOIN users u ON r.user_id = u.user_id
            JOIN each_device e ON r.item_id = e.item_id
            ORDER BY r.request_date DESC;
        `);

        if (requests.length == 0) {
            return res.status(404).json({ message: 'No requests found' });
        }

        res.status(200).json(requests);
    } catch (error) {
        console.error('ERROR:', error);
        res.status(500).json({ message: 'Error fetching requests' });
    }
});

// แก้ไขคำร้องขอ
app.put('/admin/requests/update', authenticateToken, async (req,res) => {
    const { id, request_status, admin_comment } = req.body;
    let item_availability_status;
    if (request_status == 'waiting for approve') {
        item_availability_status = 'ready';
    } else if (request_status == 'approve') {
        item_availability_status = 'borrowed';
    } else if (request_status == 'deny') {
        item_availability_status = 'deny';
    } else {
        item_availability_status = null;  
    }

    try {
        const result = await db.result('UPDATE requests SET request_status = $1, item_availability_status = $2, admin_comment = $3 WHERE request_id = $4'
        , [request_status, item_availability_status, admin_comment, id]);
        // request_status มี 3 แบบ waiting for apporve รออนุมัติ, approved อนุมัติแล้ว, deny ปฏิเสธ ใส่ 3 ค่านี้ลงไปแล้ว item_availability_status จะเปลี่ยนค่าตามเงื่อไขที่กำหนดให้
        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Request not found' });
        }

        res.status(200).json({ message: 'Request updated successfully' });
    } catch (error) {
        console.error('ERROR:', error);
        res.status(500).json({ message: 'Error updating request' });
    }
});









// Dashborad
app.get('/dashboard', authenticateToken, async (req, res) => {
    try {
        const data = [];
        const datau = await db.one('SELECT COUNT(user_id) AS total_users FROM users');
        const datal = await db.one('SELECT COUNT(device_id) AS total_devices FROM device');
        const loanDetails = await db.any('SELECT device_name, COUNT(loan_detail.item_id) AS borrow_count FROM loan_detail JOIN device ON loan_detail.item_id = device.device_id GROUP BY device_name ORDER BY borrow_count DESC LIMIT 10');
        
        data.push({ total_users: datau.total_users, total_devices: datal.total_devices });
        data.push({borrow_count: loanDetails.borrow_count});
        res.status(200).json(data);
    } catch (error) {
        console.error('Error fetching dashboard data:', error);
        res.status(500).send({ message: 'Error fetching dashboard data' });
    }
});

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
