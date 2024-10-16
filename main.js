const express = require('express')
const app = express()
const bcrypt = require('bcrypt')
const bodyParser = require('body-parser')
const cookieParser = require('cookie-parser')
const jwt = require('jsonwebtoken')
const cors = require('cors')
const multer = require('multer')
const path = require('path')
const fs = require('fs')
const QRCode = require('qrcode')
const cron = require('node-cron')
const moment = require('moment-timezone')
const fetch = require('node-fetch')
const ExcelJS = require('exceljs');
const { ChartJSNodeCanvas } = require('chartjs-node-canvas');
const PDFDocument = require('pdfkit');
// const { PrismaClient } = require('@prisma/client')
// const prisma = new PrismaClient()

require('dotenv').config()

const corsOptions = {
    origin: 'http://localhost:3000',
    credentials: true,  
    optionsSuccessStatus: 200
}

app.use(express.urlencoded({ extended: true }));
app.use(cors(corsOptions));
app.use(express.json());
app.use(bodyParser.json());
app.use(cookieParser());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const secret = process.env.JWT_SECRET;

const port = 8000
const { db } = require('./Config/db')

app.use(cookieParser());

// ตั้งค่า multer สำหรับการอัปโหลดรูปภาพ
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads'); // ที่เก็บไฟล์รูปถ่าย
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + path.extname(file.originalname);
        cb(null, uniqueSuffix); 
    }
});
const upload = multer({ storage: storage });

//JWT function
const generateToken = (user) => {
    return jwt.sign({ id: user.user_id, role: user.user_role }, secret, { expiresIn: '72h' });
};

// ฟังก์ชัน Middleware สำหรับการตรวจสอบ JWT token
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // แยก Bearer ออก
    if (!token) {
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

app.get('/', (req, res) => {
    res.send(`
        <h1>Welcome</h1>
        <img src="/uploads/1726513400898.jpg" alt="Test Image"/>
    `);
});

// Register
app.post('/register', async (req, res) => {
    const { id, email, password, firstname, lastname, phone, duty, faculty, branch } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    console.log(req.body)

    try {
        const existingUser = await db.oneOrNone('SELECT * FROM users WHERE user_email = $1', [email]);

        if (existingUser) {
            return res.status(400).json({ message: 'Email already in use' });
        }

        await db.none(
            'INSERT INTO users(user_id, user_email, user_password, user_firstname, user_lastname, user_phone, user_duty, user_role, user_branch, user_faculty) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)',
            [id, email, hashedPassword, firstname, lastname, phone, duty, 1, branch, faculty]
        );
        
        res.status(200).json({ 
            message: 'User registered successfully',
            type: "ok"
        });
    } catch (error) {
        console.error('ERROR:', error);
        res.status(500).json({ message: 'Error registering user' });
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
                console.log(token)
                //res.cookie('token', token, { maxAge: 72*60*60*1000, httpOnly: true, secure: true, sameSite: 'none' });
                res.status(200).json({ 
                    type: "ok",
                    message: 'Logged in successfully',
                    role: user.user_role,
                    user_id: user.user_id,
                    token: token
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
    res.clearCookie('token', { httpOnly: true, secure: true, sameSite: 'none' }); 
    res.status(200).json({ 
        message: 'Logged out successfully',
        type: "ok"
    });
});
// Delete User
app.delete('/delete-user', authenticateToken, async (req, res) => {
    const { user_id } = req.body; // รับค่า user_id จาก body ของ request
    console.log(`Delete user_id: ${user_id}`);
    if (!user_id) {
        return res.status(400).json({ message: 'กรุณาใส่ user_id' });
    }

    try {
        await db.query('DELETE FROM loan_detail WHERE user_id = $1', [user_id]);

        const result = await db.query('DELETE FROM users WHERE user_id = $1 RETURNING *', [user_id]);
 
        if (result.rowCount == 0) {
            return res.status(404).json({ message: `ไม่พบ user_id ${user_id}` });
        }

        res.status(200).json({ message: `User_id ${user_id} ถูกลบเรียบร้อยแล้ว` });
    } catch (error) {
        console.error('ERROR:', error);
        res.status(500).json({ message: 'เกิดข้อผิดพลาดในการลบ user' });
    }
});
// เพิ่ม Admin
app.put('/admin/edit-user', authenticateToken, async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ message: 'Please enter email and password' });
    }

    try {
        const existingUser = await db.oneOrNone('SELECT * FROM users WHERE user_email = $1', [email]);
        if (!existingUser) {
            return res.status(404).json({ message: 'User not found.' });
        }

        const newRole = existingUser.user_role == 2 ? 1 : 2;
        const hashedPassword = await bcrypt.hash(password, 10);

        await db.none('UPDATE users SET user_password = $1, user_role = $2 WHERE user_email = $3', 
            [hashedPassword, newRole, email]);

        res.status(200).json({ message: 'User role has been updated successfully.' });
    } catch (error) {
        console.error('ERROR:', error);
        res.status(500).json({ message: 'Error updating user' });
    }
});
// ดู list user
app.get('/admin/list-user', authenticateToken, async (req, res) => {
    try {
        const users = await db.any(`
            SELECT 
                user_id,
                user_firstname,
                user_lastname,
                user_email,
                CASE 
                    WHEN user_role = 1 THEN 'user'
                    WHEN user_role = 2 THEN 'admin'
                    ELSE 'unknown'
                END AS user_role, 
                user_phone
            FROM users
            ORDER BY user_id ASC
        `);
        res.status(200).json(users);
    } catch (error) {
        console.error('Error fetching user list:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// การเพิ่มชุดอุปกรณ์ใหม่
app.post('/devices/add', authenticateToken, async (req, res) => {
    const { name, description, limit, serial, type, brand, model, location, responsible } = req.body;

    const validTypes = [
        'ครุภัณฑ์ประจำห้องปฏิบัติการ',
        'วัสดุคงทนถาวรประจำห้องปฏิบัติการ',
        'วัสดุสิ้นเปลืองประจำห้องปฏิบัติการ'
    ];

    if (!validTypes.includes(type)) {
        return res.status(400).json({ message: 'ประเภทอุปกรณ์ไม่ถูกต้อง' });
    }

    try {
        const result = await db.one(
            `INSERT INTO device(
                device_name, 
                device_description, 
                device_limit, 
                device_serial, 
                device_availability, 
                device_type, 
                device_brand, 
                device_model, 
                device_location, 
                device_responsible
            ) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) 
            RETURNING device_id`,
            [name, description, limit, serial, limit, type, brand, model, location, responsible]
        );

        const deviceId = result.device_id;

        // สร้างโฟลเดอร์สำหรับ QR Code ในโฟลเดอร์ qrcodes
        const qrCodeDir = path.join(__dirname, 'qrcodes', serial);
        if (!fs.existsSync(qrCodeDir)) {
            fs.mkdirSync(qrCodeDir, { recursive: true });
        }

        for (let i = 1; i <= limit; i++) {
            const itemSerial = `${serial}-${i}`;
            const qrCodeData = `${itemSerial}`;

            // สร้างโฟลเดอร์ย่อยสำหรับแต่ละลำดับ (เช่น 58)
            const subFolderDir = path.join(qrCodeDir, `${i}`);
            if (!fs.existsSync(subFolderDir)) {
                fs.mkdirSync(subFolderDir, { recursive: true });
            }

            // สร้างชื่อไฟล์แบบ no.x เช่น no.1, no.2
            const qrCodeFileName = `no.${i}.png`;
            const qrCodeFilePath = path.join(subFolderDir, qrCodeFileName);

            // สร้าง QR Code และบันทึกเป็นไฟล์
            await QRCode.toFile(qrCodeFilePath, qrCodeData);

            // อ่านไฟล์ QR Code เป็น base64
            const qrCodeBase64 = fs.readFileSync(qrCodeFilePath, { encoding: 'base64' });
            const qrCodeUrl = `data:image/png;base64,${qrCodeBase64}`;

            await db.none(
                `INSERT INTO device_item(
                    item_name, 
                    item_description, 
                    device_id, 
                    item_availability, 
                    item_serial, 
                    item_qrcode, 
                    item_type
                ) VALUES($1, $2, $3, $4, $5, $6, $7)`,
                [name, description, deviceId, 'ready', itemSerial, qrCodeUrl, type]
            );
        }

        res.status(200).json({ message: 'Device and items added successfully with QR codes' });
    } catch (error) {
        console.error('ERROR:', error);
        res.status(500).json({ message: 'Error adding device and items' });
    }
});

/// เช็คชุดอุปกรณ์ที่เพิ่มมาทั้งหมด
app.get('/devices',  async (req, res) => {
    try {
        const device = await db.any('SELECT * FROM device');
        res.status(200).json(device);
    } catch (error) {
        console.error('ERROR:', error);
        res.status(500).json({ message: 'Error fetching device' });
    }
});

// เช็คชุดอุปกรณ์แต่ละชุด
app.get('/devices/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        const device = await db.query('SELECT * FROM device WHERE device_id = $1', [id]);
        if (!device) {
            return res.status(404).json({ massge: 'Device not found' });
        }
        const items = await db.any('SELECT * FROM device_item WHERE device_id = $1',[id])
        res.status(200).json({device,items});
    } catch (error) {
        console.error('ERROR:', error);
        res.status(500).json({ message: 'Error fetching device' });
    }
});

// แก้ไขชุดอุปกรณ์
app.put('/device/update', authenticateToken, async (req, res) => {
    const { id, name, limit, description, approve } = req.body;
    try {
        const device = await db.one('SELECT device_limit, device_availability, device_serial, device_approve FROM device WHERE device_id = $1', [id]);
        const limitDifference = limit - device.device_limit;

        await db.none(
            'UPDATE device SET device_name = $1, device_limit = $2, device_availability = device_availability + $3, device_approve = $4, device_description = $5 WHERE device_id = $6',
            [name, limit, limitDifference, approve, description, id]
        );

        // ถ้าจำนวน limit เพิ่มขึ้น, เพิ่มรายการใหม่ใน device_items
        if (limitDifference > 0) {
            for (let i = device.device_limit + 1; i <= limit; i++) {
                await db.none(
                    'INSERT INTO device_item (item_name, item_description, item_availability, device_id, item_serial) VALUES($1, $2, $3, $4, $5)',
                    [name, description, 'ready', id, `${device.device_serial}/${i}`]
                );
            }
        } 
        // ถ้าจำนวน limit ลดลง, ลบรายการใน device_items
        else if (limitDifference < 0) {
            const itemsToDelete = await db.any(
                'SELECT item_id FROM device_item WHERE device_id = $1 AND item_id > $2 ORDER BY item_id DESC LIMIT $3',
                [id, limit, -limitDifference]
            );

            for (const item of itemsToDelete) {
                await db.none('DELETE FROM device_item WHERE item_id = $1', [item.item_id]);
            }
        }

        // ตรวจสอบการเปลี่ยนแปลง device_approve
        if (device.device_approve == true && approve == false) {
            // เปลี่ยน 'ready' เป็น 'not ready'
            await db.none(
                'UPDATE device_item SET item_availability = $1 WHERE device_id = $2 AND item_availability = $3',
                ['not ready', id, 'ready']
            );
        } else if (device.device_approve == false && approve == true) {
            // เปลี่ยน 'not ready' เป็น 'ready'
            await db.none(
                'UPDATE device_item SET item_availability = $1 WHERE device_id = $2 AND item_availability = $3',
                ['ready', id, 'not ready']
            );
        }

        res.status(200).json({ message: 'Device updated successfully' });
    } catch (error) {
        console.error('ERROR:', error);
        res.status(500).json({ message: 'Error updating device', error: error.message });
    }
});

// ลบชุดอุปกรณ์
app.delete('/devices/delete', authenticateToken, async (req, res) => {
    const { id } = req.body;
    if (!id) {
        return res.status(400).json({ message: 'ID is required' });
    }
    try {
        const user_id = req.user.id;
        console.log('User ID:', user_id);
        const user_role = req.user.role;

        if (user_role != 2) {
            return res.status(403).json({ message: 'Forbidden: Only admins can delete devices' });
        }

        const device = await db.oneOrNone('SELECT device_serial FROM device WHERE device_id = $1', [id]);
        if (!device) {
            return res.status(404).json({ message: 'Device not found' });
        }

        const serial = device.device_serial;

        await db.tx(async t => {
            // ลบข้อมูลจาก return_detail ที่มี item_id ที่เกี่ยวข้องกับ device_id
            await t.none('DELETE FROM return_detail WHERE item_id IN (SELECT item_id FROM device_item WHERE device_id = $1)', [id]);

            // ลบข้อมูลจาก loan_detail ที่มี device_id
            await t.none('DELETE FROM loan_detail WHERE device_id = $1', [id]);

            // ลบข้อมูลจาก device_item ที่มี device_id
            await t.none('DELETE FROM device_item WHERE device_id = $1', [id]);

            // ลบข้อมูลจาก device ที่มี device_id
            await t.none('DELETE FROM device WHERE device_id = $1', [id]);
        });

        // ลบโฟลเดอร์ที่มีชื่อเป็น serial
        const qrCodeDir = path.join(__dirname, 'qrcodes', serial);
        if (fs.existsSync(qrCodeDir)) {
            fs.rmSync(qrCodeDir, { recursive: true, force: true });
        }

        res.status(200).json({ message: 'Device, related items, and folder deleted successfully' });
    } catch (error) {
        console.error('ERROR:', error);
        res.status(500).json({ message: 'Error deleting device, related items, or folder' });
    }
});

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// แก้ไขสถานะอุปกรณ์แต่ละตัว (แก้สถานะ device_item ตาม item_id)
app.put('/device_item/update', authenticateToken, async (req, res) => {
    const { item_id, item_availability } = req.body;

    if (!item_id || !item_availability) {
        return res.status(400).json({ message: 'Please provide item_id and item_availability' });
    }

    try {
        const oldItem = await db.oneOrNone(`
            SELECT item_availability, device_id
            FROM device_item
            WHERE item_id = $1
        `, [item_id]);

        if (!oldItem) {
            return res.status(404).json({ message: 'Item not found' });
        }

        // เงื่อนไขไม่อนุญาตให้แก้สถานะที่เป็น pending, borrowed
        if (oldItem.item_availability == 'pending' || oldItem.item_availability == 'borrowed') {
            return res.status(403).json({ message: 'Cannot update the status of an item with status "pending", "borrowed".' });
        }

        // อัปเดตสถานะใหม่
        const result = await db.result(`
            UPDATE device_item
            SET item_availability = $1
            WHERE item_id = $2
        `, [item_availability, item_id]);

        if (result.rowCount == 0) {
            return res.status(404).json({ message: 'Item not found or no change in availability status' });
        }

        // ปรับปรุงจำนวนในตาราง device ตามสถานะที่เปลี่ยนแปลง
        if (oldItem.item_availability == 'ready' && item_availability !== 'ready') {
            await db.none(`
                UPDATE device
                SET device_availability = device_availability - 1
                WHERE device_id = $1
            `, [oldItem.device_id]);
        } else if (oldItem.item_availability !== 'ready' && item_availability == 'ready') {
            await db.none(`
                UPDATE device
                SET device_availability = device_availability + 1
                WHERE device_id = $1
            `, [oldItem.device_id]);
        }

        res.status(200).json({ message: 'Item availability status updated successfully' });
    } catch (error) {
        console.error('ERROR:', error);
        res.status(500).json({ message: 'Error updating item availability status' });
    }
});

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// ดูคำร้องขอของแต่ละ user
app.get('/admin/loan_detail/:user_id/:transaction_id', authenticateToken, async (req, res) => {
    try {
        const user_id = parseInt(req.params.user_id, 10); // รับ user_id จากพารามิเตอร์ใน URL
        const transaction_id = parseInt(req.params.transaction_id, 10); // รับ transaction_id จากพารามิเตอร์ใน URL

        if (isNaN(user_id) || isNaN(transaction_id)) {
            return res.status(400).json({ message: 'Invalid user ID or transaction ID' });
        }

        const requests = await db.any(`
            SELECT r.loan_id, e.item_name, e.item_serial, u.user_id, u.user_email, 
                   r.loan_date, r.due_date, r.item_availability_status, r.item_id
            FROM loan_detail r
            JOIN users u ON r.user_id = u.user_id
            JOIN device_item e ON r.item_id = e.item_id
            WHERE r.user_id = $1 AND r.transaction_id = $2
            ORDER BY r.loan_date DESC;
        `, [user_id, transaction_id]);

        if (requests.length == 0) {
            return res.status(404).json({ user_id, transaction_id, requests: [], message: 'No requests found' });
        }
        // แปลงวันเวลาเป็น Timezone ที่ต้องการ
        const formattedRequests = requests.map(request => ({
            ...request,
            loan_date: moment.utc(request.loan_date).tz('Asia/Bangkok').format('YYYY-MM-DD HH:mm:ss'),
            due_date: moment.utc(request.due_date).tz('Asia/Bangkok').format('YYYY-MM-DD HH:mm:ss')
        }));
        res.status(200).json({ user_id, transaction_id, requests: formattedRequests });
    } catch (error) {
        console.error('ERROR:', error);
        res.status(500).json({ message: 'Error fetching requests' });
    }
});


// ดู user ที่ขอคำร้องมา
app.get('/admin/loan_detail', authenticateToken, async (req, res) => {
    try {
        const requests = await db.any(`
            SELECT t.user_id, t.transaction_id, u.user_firstname, u.user_email, u.user_phone, t.loan_date, t.due_date, t.item_quantity, ld.loan_status
            FROM transaction t
            JOIN users u ON t.user_id = u.user_id
            LEFT JOIN loan_detail ld ON t.transaction_id = ld.transaction_id
            ORDER BY t.loan_date DESC;
        `);

        if (requests.length == 0) {
            return res.status(404).json({ message: 'No transactions found' });
        }

        const groupedRequests = requests.reduce((acc, curr) => {
            const existingRequest = acc.find(req => req.user_id == curr.user_id && req.transaction_id == curr.transaction_id);
            if (existingRequest) {
                existingRequest.loan_status = curr.loan_status;
            } else {
                acc.push({
                    user_id: curr.user_id,
                    transaction_id: curr.transaction_id,
                    user_firstname: curr.user_firstname,
                    user_email: curr.user_email,
                    user_phone: curr.user_phone,
                    loan_date: moment.utc(curr.loan_date).tz('Asia/Bangkok').format('YYYY-MM-DD HH:mm:ss'),
                    due_date: moment.utc(curr.due_date).tz('Asia/Bangkok').format('YYYY-MM-DD HH:mm:ss'),
                    item_quantity: curr.item_quantity,
                    loan_status: curr.loan_status
                });
            }
            return acc;
        }, []);

        res.status(200).json(groupedRequests);
    } catch (error) {
        console.error('ERROR:', error);
        res.status(500).json({ message: 'Error fetching transactions' });
    }
});


// ดูคำร้องรอยืนยัน pending
app.get('/admin/loan_detail/pending', authenticateToken, async (req, res) => {
    try {
        const requests = await db.any(`
            SELECT t.user_id, t.transaction_id, u.user_firstname, u.user_email, t.loan_date, t.due_date, t.item_quantity, ld.loan_status, ld.item_id
            FROM transaction t
            JOIN users u ON t.user_id = u.user_id
            LEFT JOIN loan_detail ld ON t.transaction_id = ld.transaction_id
            WHERE ld.loan_status = 'pending'
            ORDER BY t.loan_date DESC;
        `);
        const groupedRequests = requests.reduce((acc, curr) => {
            const existingRequest = acc.find(req => req.user_id == curr.user_id && req.transaction_id == curr.transaction_id);
            if (existingRequest) {
                existingRequest.item_ids.push(curr.item_id); 
                existingRequest.loan_status = curr.loan_status; 
            } else {
                acc.push({
                    user_id: curr.user_id,
                    transaction_id: curr.transaction_id,
                    user_firstname: curr.user_firstname,
                    user_email: curr.user_email,
                    loan_date: moment.utc(curr.loan_date).tz('Asia/Bangkok').format('YYYY-MM-DD HH:mm:ss'),
                    due_date: moment.utc(curr.due_date).tz('Asia/Bangkok').format('YYYY-MM-DD HH:mm:ss'),
                    item_quantity: curr.item_quantity,
                    loan_status: curr.loan_status,
                    item_ids: [curr.item_id] 
                });
            }
            return acc;
        }, []);
        groupedRequests.forEach(req => req.item_ids = req.item_ids.join(','));
        res.status(200).json(groupedRequests);
    } catch (error) {
        console.error('ERROR:', error);
        res.status(500).json({ message: 'Error fetching transactions' });
    }
});
// ดูคำร้องยืนยัน approve
app.get('/admin/loan_detail/approve', authenticateToken, async (req, res) => {
    try {
        const requests = await db.any(`
            SELECT t.user_id, t.transaction_id, u.user_firstname, u.user_email, u.user_phone, t.loan_date, t.due_date, t.item_quantity, ld.loan_status, ld.item_id
            FROM transaction t
            JOIN users u ON t.user_id = u.user_id
            LEFT JOIN loan_detail ld ON t.transaction_id = ld.transaction_id
            WHERE ld.loan_status = 'approve'
            ORDER BY t.loan_date DESC;
        `);
        const groupedRequests = requests.reduce((acc, curr) => {
            const existingRequest = acc.find(req => req.user_id == curr.user_id && req.transaction_id == curr.transaction_id);
            if (existingRequest) {
                existingRequest.item_ids.push(curr.item_id); 
                existingRequest.loan_status = curr.loan_status;
            } else {
                acc.push({
                    user_id: curr.user_id,
                    transaction_id: curr.transaction_id,
                    user_firstname: curr.user_firstname,
                    user_email: curr.user_email,
                    user_phone: curr.user_phone, 
                    loan_date: moment.utc(curr.loan_date).tz('Asia/Bangkok').format('YYYY-MM-DD HH:mm:ss'),
                    due_date: moment.utc(curr.due_date).tz('Asia/Bangkok').format('YYYY-MM-DD HH:mm:ss'),
                    item_quantity: curr.item_quantity,
                    loan_status: curr.loan_status,
                    item_ids: [curr.item_id] 
                });
            }
            return acc;
        }, []);
        groupedRequests.forEach(req => req.item_ids = req.item_ids.join(','));
        res.status(200).json(groupedRequests);
    } catch (error) {
        console.error('ERROR:', error);
        res.status(500).json({ message: 'Error fetching transactions' });
    }
});
// ดูคำร้องยืนยัน borrowed
app.get('/admin/loan_detail/borrowed', authenticateToken, async (req, res) => {
    try {
        const requests = await db.any(`
            SELECT t.user_id, t.transaction_id, u.user_firstname, u.user_email, u.user_phone, t.loan_date, t.due_date, t.item_quantity, ld.loan_status, ld.item_id
            FROM transaction t
            JOIN users u ON t.user_id = u.user_id
            LEFT JOIN loan_detail ld ON t.transaction_id = ld.transaction_id
            WHERE ld.loan_status = 'borrowed'
            ORDER BY t.loan_date DESC;
        `);
        const groupedRequests = requests.reduce((acc, curr) => {
            const existingRequest = acc.find(req => req.user_id == curr.user_id && req.transaction_id == curr.transaction_id);
            if (existingRequest) {
                existingRequest.item_ids.push(curr.item_id); 
                existingRequest.loan_status = curr.loan_status; 
            } else {
                acc.push({
                    user_id: curr.user_id,
                    transaction_id: curr.transaction_id,
                    user_firstname: curr.user_firstname,
                    user_email: curr.user_email,
                    user_phone: curr.user_phone,
                    loan_date: moment.utc(curr.loan_date).tz('Asia/Bangkok').format('YYYY-MM-DD HH:mm:ss'),
                    due_date: moment.utc(curr.due_date).tz('Asia/Bangkok').format('YYYY-MM-DD HH:mm:ss'),
                    item_quantity: curr.item_quantity,
                    loan_status: curr.loan_status,
                    item_ids: [curr.item_id] 
                });
            }
            return acc;
        }, []);
        groupedRequests.forEach(req => req.item_ids = req.item_ids.join(','));
        res.status(200).json(groupedRequests);
    } catch (error) {
        console.error('ERROR:', error);
        res.status(500).json({ message: 'Error fetching transactions' });
    }
});
// ดูคำร้องปฏิเสธ deny
app.get('/admin/loan_detail/deny', authenticateToken, async (req, res) => {
    try {
        const requests = await db.any(`
            SELECT 
                t.user_id, 
                t.transaction_id, 
                u.user_firstname, 
                u.user_email, 
                u.user_phone,  -- เพิ่ม user_phone
                t.loan_date, 
                t.due_date, 
                t.item_quantity, 
                ld.loan_status, 
                ld.item_id
            FROM transaction t
            JOIN users u ON t.user_id = u.user_id
            LEFT JOIN loan_detail ld ON t.transaction_id = ld.transaction_id
            WHERE ld.loan_status = 'deny'
            ORDER BY t.loan_date DESC;
        `);
        const groupedRequests = requests.reduce((acc, curr) => {
            const existingRequest = acc.find(req => req.user_id == curr.user_id && req.transaction_id == curr.transaction_id);
            if (existingRequest) {
                existingRequest.item_ids.push(curr.item_id);
                existingRequest.loan_status = curr.loan_status; 
            } else {
                acc.push({
                    user_id: curr.user_id,
                    transaction_id: curr.transaction_id,
                    user_firstname: curr.user_firstname,
                    user_email: curr.user_email,
                    user_phone: curr.user_phone, 
                    loan_date: moment.utc(curr.loan_date).tz('Asia/Bangkok').format('YYYY-MM-DD HH:mm:ss'),
                    due_date: moment.utc(curr.due_date).tz('Asia/Bangkok').format('YYYY-MM-DD HH:mm:ss'),
                    item_quantity: curr.item_quantity,
                    loan_status: curr.loan_status,
                    item_ids: [curr.item_id]
                });
            }
            return acc;
        }, []);

        groupedRequests.forEach(req => req.item_ids = req.item_ids.join(','));

        res.status(200).json(groupedRequests);
    } catch (error) {
        console.error('ERROR:', error);
        res.status(500).json({ message: 'Error fetching transactions' });
    }
});

// ดูคำร้องที่สำเร็จ complete
app.get('/admin/loan_detail/complete', authenticateToken, async (req, res) => {
    try {
        const requests = await db.any(`
            SELECT t.user_id, t.transaction_id, u.user_firstname, u.user_email, t.loan_date, t.due_date, t.item_quantity, ld.loan_status, ld.item_id
            FROM transaction t
            JOIN users u ON t.user_id = u.user_id
            LEFT JOIN loan_detail ld ON t.transaction_id = ld.transaction_id
            WHERE ld.loan_status = 'complete'
            ORDER BY t.loan_date DESC;
        `);
        if (requests.length == 0) {
            return res.status(404).json({ message: 'No completed transactions found' });
        }
        const groupedRequests = requests.reduce((acc, curr) => {
            const existingRequest = acc.find(req => req.user_id == curr.user_id && req.transaction_id == curr.transaction_id);
            if (existingRequest) {
                existingRequest.item_ids.push(curr.item_id); 
                existingRequest.loan_status = curr.loan_status;
            } else {
                acc.push({
                    user_id: curr.user_id,
                    transaction_id: curr.transaction_id,
                    user_firstname: curr.user_firstname,
                    user_email: curr.user_email,
                    loan_date: moment.utc(curr.loan_date).tz('Asia/Bangkok').format('YYYY-MM-DD HH:mm:ss'),
                    due_date: moment.utc(curr.due_date).tz('Asia/Bangkok').format('YYYY-MM-DD HH:mm:ss'),
                    item_quantity: curr.item_quantity,
                    loan_status: curr.loan_status,
                    item_ids: [curr.item_id] 
                });
            }
            return acc;
        }, []);
        groupedRequests.forEach(req => req.item_ids = req.item_ids.join(','));

        res.status(200).json(groupedRequests);
    } catch (error) {
        console.error('ERROR:', error);
        res.status(500).json({ message: 'Error fetching transactions' });
    }
});

// ยืนยัน/ปฏิเสธ คำร้องขอ
const{ sendLineNotifyClaim } = require('./Function/nontify_claim')
app.put('/admin/loan_detail/update', authenticateToken, async (req, res) => {
    const { transaction_id, loan_status } = req.body;
    let item_availability_status;
    let confirm_date;
    // กำหนดค่า item_availability_status ตาม loan_status
    if (loan_status == 'pending') {
        item_availability_status = 'pending';
    } else if (loan_status == 'approve') {
        item_availability_status = 'pending';
        confirm_date = new Date();
        confirm_date.setDate(confirm_date.getDate() + 7);
    } else if (loan_status == 'deny') {
        item_availability_status = 'ready';
    } else {
        item_availability_status = null;
    }

    try {
        await db.tx(async t => {
            const transaction = await t.oneOrNone(
                'SELECT user_id FROM transaction WHERE transaction_id = $1',
                [transaction_id]
            );

            if (!transaction) {
                return res.status(404).json({ message: `Transaction ID: ${transaction_id} not found` });
            }

            const user_id = transaction.user_id;

            const user = await t.oneOrNone(
                'SELECT user_firstname, user_lastname FROM users WHERE user_id = $1',
                [user_id]
            );

            if (!user) {
                return res.status(404).json({ message: `User with id ${user_id} not found` });
            }
            const { user_firstname, user_lastname } = user;

            const items = await t.any(
                'SELECT item_id, device_id FROM loan_detail WHERE user_id = $1 AND return_date IS NULL AND transaction_id = $2',
                [user_id, transaction_id]
            );

            if (items.length == 0) {
                return res.status(404).json({ message: `No loan details updated for transaction_id ${transaction_id}` });
            }

            const result = await t.result(
                'UPDATE loan_detail SET loan_status = $1, item_availability_status = $2, due_date = $3 WHERE transaction_id = $4',
                [loan_status, item_availability_status, confirm_date, transaction_id]
            );

            if (result.rowCount == 0) {
                return res.status(404).json({ message: `ไม่พบการอัปเดตรายละเอียดการยืมสำหรับ Transaction ID ${transaction_id}` });
            }

            // อัปเดต due_date และ loan_status ในตาราง transaction
            await t.none(
                'UPDATE transaction SET loan_status = $1, due_date = $2 WHERE transaction_id = $3',
                [loan_status, confirm_date, transaction_id]
            );

            const itemIds = items.map(item => item.item_id);
            const deviceIds = items.map(item => item.device_id);

            if (loan_status == 'approve') {
                await t.none(
                    'UPDATE device_item SET item_loaning = true, item_availability = $1 WHERE item_id = ANY($2::int[])',
                    [item_availability_status, itemIds]
                );
                const message = `รายการยืมอุปกรณ์ของ ${user_firstname} ${user_lastname}(User ID: ${user_id}) ได้เตรียมอุปกรณ์เสร็จเรียบร้อย กรุณามารับได้ครับ กำหนดคืนวันที่: ${confirm_date.toLocaleDateString()}`;
                await sendLineNotifyClaim(message);

            } else if (loan_status == 'pending') {
                await t.none(
                    'UPDATE device_item SET item_loaning = false, item_availability = $1 WHERE item_id = ANY($2::int[])',
                    [item_availability_status, itemIds]
                );

            } else if (loan_status == 'deny') {
                await t.none(
                    'UPDATE device_item SET item_loaning = false, item_availability = $1 WHERE item_id = ANY($2::int[])',
                    [item_availability_status, itemIds]
                );

                await t.none(
                    'UPDATE device SET device_availability = device_availability + (SELECT COUNT(*) FROM device_item WHERE item_id = ANY($1::int[]) AND item_availability = $2) WHERE device_id = ANY($3::int[])',
                    [itemIds, item_availability_status, deviceIds]
                );

                const message = `รายการยืมอุปกรณ์ของ ${user_firstname} ${user_lastname}, (User ID: ${user_id}) ถูกปฏิเสธคำขอเนื่องจากอุปกรณ์มีปัญหา ถ้าต้องการยืมกรุณาเลือกอุปกรณ์และส่งคำร้องยืมมาใหม่`;
                await sendLineNotifyClaim(message);
            }
        });

        res.status(200).json({ message: 'Requests updated successfully' });
    } catch (error) {
        console.error('ERROR:', error);
        res.status(500).json({ message: 'Error updating requests' });
    }
});
// ยืนยันการรับอุปกรณ์
//ผ่านเว็บ
app.put('/confirm-loan', authenticateToken, async (req, res) => {
    const { transaction_id } = req.body;
    if (!transaction_id) {
        return res.status(400).json({ message: 'Transaction ID is required' });
    }
    console.log(transaction_id)
    try {
        // ตรวจสอบว่ามี transaction_id นี้อยู่ในฐานข้อมูลหรือไม่
        const transactionExists = await db.oneOrNone(
            'SELECT * FROM transaction WHERE transaction_id = $1',
            [transaction_id]
        );
        if (!transactionExists) {
            return res.status(404).json({ message: 'Transaction not found.' });
        }
        console.log(transactionExists)

        const pendingLoans = await db.any(
            'SELECT loan_id FROM loan_detail WHERE transaction_id = $1 AND item_availability_status = $2',
            [transaction_id, 'pending']
        );
        if (pendingLoans.length == 0) {
            return res.status(400).json({ message: 'No pending loans found for this transaction.' });
        }

        await db.tx(async t => {
            // อัปเดต loan_status เป็น 'borrowed' และ item_availability_status เป็น 'borrowed' สำหรับ loan_id ที่เกี่ยวข้องกับ transaction นี้
            await t.none(
                'UPDATE loan_detail SET loan_status = $1, item_availability_status = $2 WHERE transaction_id = $3 AND item_availability_status = $4',
                ['borrowed', 'borrowed', transaction_id, 'pending']
            );
            // อัปเดตสถานะอุปกรณ์ในตาราง device_item
            await t.none(
                'UPDATE device_item SET item_availability = $1 WHERE item_id IN (SELECT item_id FROM loan_detail WHERE transaction_id = $2)',
                ['borrowed', transaction_id]
            );
        });
        res.status(200).json({ message: 'Transaction loaning confirm' });
    } catch (error) {
        console.error('Error confirming loan:', error);
        res.status(500).json({ message: 'Server error while confirming loan.' });
    }
});
// ผ่าน Qrcode แต่ละอุปกรณ์
app.get('/confirm-loan-data', async (req, res) => {
    const data = req.query.data;

    try {
        // ตรวจสอบว่ามีข้อมูลจาก QR code หรือไม่
        if (!data) {
            return res.status(400).json({ message: 'ไม่มีข้อมูลจาก QR code' });
        }

        const response = await fetch('http://localhost:8000/confirm-loan-qrcode', { // เปลี่ยน URL ให้ตรงกับเส้นทางที่ต้องการเรียก
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': req.headers.authorization, // ส่งต่อ token สำหรับการยืนยันตัวตน
            },
            body: JSON.stringify({
                data: data, // ส่งข้อมูล QR code ไปยังฟังก์ชัน POST
            }),
        });

        const result = await response.json();

        if (!response.ok) {
            return res.status(response.status).json(result);
        }

        // ส่งผลลัพธ์จาก POST กลับไปยังผู้เรียก GET
        res.status(200).json(result);

    } catch (error) {
        console.error('เกิดข้อผิดพลาด:', error);
        res.status(500).json({ message: 'เกิดข้อผิดพลาดในการประมวลผลข้อมูล QR code.' });
    }
});
app.put('/confirm-loan-qrcode', authenticateToken, async (req, res) => {
    const { transaction_id, items } = req.body;  // รับ items เป็น array ที่มี item_id และ status ของแต่ละรายการ

    if (!transaction_id || !items || !items.length) {
        return res.status(400).json({ message: 'Transaction ID and at least one item with status are required' });
    }

    try {
        // ตรวจสอบว่ามี transaction_id นี้อยู่ในฐานข้อมูลหรือไม่
        const transactionExists = await db.oneOrNone(
            'SELECT * FROM transaction WHERE transaction_id = $1',
            [transaction_id]
        );
        if (!transactionExists) {
            return res.status(404).json({ message: 'Transaction not found.' });
        }

        await db.tx(async t => {
            // Loop ผ่าน items แต่ละตัวเพื่ออัปเดตสถานะตามที่ได้รับ
            for (const item of items) {
                const { item_id, status } = item;

                if (status == 'borrowed') {
                    // ถ้าสถานะเป็น 'borrowed' อัปเดตสถานะ loan_detail และ device_item
                    await t.none(
                        'UPDATE loan_detail SET loan_status = $1, item_availability_status = $2 WHERE transaction_id = $3 AND item_id = $4 AND item_availability_status = $5',
                        ['borrowed', 'borrowed', transaction_id, item_id, 'pending']
                    );
                    await t.none(
                        'UPDATE device_item SET item_availability = $1 WHERE item_id = $2',
                        ['borrowed', item_id]
                    );
                } else if (status == 'deny') {
                    // ถ้าสถานะเป็น 'deny' อัปเดตสถานะ loan_detail และ device_item เป็น 'deny'
                    await t.none(
                        'UPDATE loan_detail SET loan_status = $1, item_availability_status = $2 WHERE transaction_id = $3 AND item_id = $4 AND item_availability_status = $5',
                        ['deny', 'deny', transaction_id, item_id, 'pending']
                    );
                    await t.none(
                        'UPDATE device_item SET item_availability = $1 WHERE item_id = $2',
                        ['deny', item_id]
                    );
                }
            }
        });
        res.status(200).json({ message: 'Items loan confirmed for all scanned items.' });
    } catch (error) {
        console.error('Error confirming loan:', error);
        res.status(500).json({ message: 'Server error while confirming loan.' });
    }
});

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// ***ฟังก์ชัน การยืม***
// user ขอคำร้องยืนยันการยืม
// ฟังก์ชันเพื่อแปลงข้อมูลจาก QR code เป็นรายการอุปกรณ์
const { sendLineNotify } = require('./Function/nontify');
const parseQRCodeData = (qrCodeData) => {
    try {
        // แปลงข้อมูล JSON ที่รับมาจาก QR code เป็น object
        const data = JSON.parse(qrCodeData);

        // ตรวจสอบว่าข้อมูลมีโครงสร้างที่คาดหวัง
        if (Array.isArray(data) && data.every(item => 
            item.device_id && 
            typeof item.quantity == 'number' && item.quantity > 0 && 
            item.due_date && 
            item.id)) {
            return data.map(item => ({
                device_id: item.device_id,
                quantity: item.quantity,
                due_date: item.due_date, // รวมวันที่กำหนดคืน
                user_id: item.id, // รวม user_id ด้วย
            }));
        } else {
            throw new Error('Invalid QR code data format.');
        }
    } catch (error) {
        console.error('Error parsing QR code data:', error.message); // แสดงข้อความข้อผิดพลาดที่ชัดเจน
        throw new Error('Invalid QR code data.');
    }
};

// Endpoint สำหรับรับข้อมูลจาก QR code และส่งไปยัง POST /loan
app.get('/loan-data', async (req, res) => {
    const qrCodeData = req.query.data;

    try {
        if (!qrCodeData) {
            return res.status(400).json({ message: 'QR code data is missing.' });
        }

        // แปลงข้อมูลจาก QR code เป็นรายการอุปกรณ์
        const devices = parseQRCodeData(qrCodeData); // สมมติว่ามีฟังก์ชันนี้อยู่

        // ตรวจสอบว่ามีข้อมูลใน devices หรือไม่
        if (devices.length == 0) {
            return res.status(400).json({ message: 'No devices found in QR code data.' });
        }

        const response = await fetch('http://localhost:8000/loan', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': req.headers.authorization, // ส่งต่อ token สำหรับการยืนยันตัวตน
            },
            body: JSON.stringify({
                devices: devices, // ส่งข้อมูลอุปกรณ์ที่เลือกไป
                due_date: devices[0].due_date, // วันที่กำหนดคืน
                id: devices[0].user_id // ใช้ user_id ที่ได้มาจาก QR code
            }),
        });

        const result = await response.json();

        // ตรวจสอบว่ามีข้อผิดพลาดจาก POST หรือไม่
        if (!response.ok) {
            return res.status(response.status).json(result);
        }

        // ส่งผลลัพธ์จาก POST กลับไปยังผู้เรียก GET
        res.status(200).json(result);

    } catch (error) {
        console.error('Error processing QR code data:', error.message);
        res.status(500).json({ message: 'Error processing QR code data.' });
    }
});

// ยืมอุปกรณ์
app.post('/loan', async (req, res) => {
    const { devices, due_date, id } = req.body;
    let itemAvailabilityStatus = 'ready';
    const loan_status = 'pending';

    if (loan_status === 'pending') {
        itemAvailabilityStatus = 'pending';
    }

    try {
        if (!Array.isArray(devices) || devices.length == 0) {
            return res.status(400).json({ message: 'Invalid selection. Please provide at least one device.' });
        }

        if (!due_date || isNaN(new Date(due_date).getTime())) {
            return res.status(400).json({ message: 'Invalid due date.' });
        }

        const user_id = id;
        const loan_date = new Date();
        const cancelable_until = new Date(loan_date.getTime() + 12 * 60 * 60 * 1000); // 12 ชั่วโมงถัดไป

        await db.tx(async t => {
            let totalItemQuantity = 0;

            const user = await t.one(
                'SELECT user_firstname, user_lastname FROM users WHERE user_id = $1',
                [user_id]
            );

            if (!user) {
                return res.status(404).json({ message: `ไม่พบผู้ใช้ที่มี ID ${user_id}` });
            }
            const { user_firstname, user_lastname } = user;

            const maxTransaction = await t.one('SELECT COALESCE(MAX(transaction_id), 0) AS max_id FROM transaction');
            const nextTransactionId = maxTransaction.max_id + 1;

            const serialNumber = `TRANS-${nextTransactionId}-${Date.now()}`;

            await t.none(
                'INSERT INTO transaction(transaction_id, user_id, loan_date, due_date, item_quantity, loan_status, transaction_qrcode) VALUES($1, $2, $3, $4, $5, $6, $7)',
                [nextTransactionId, user_id, loan_date, due_date, totalItemQuantity, loan_status, serialNumber]
            );

            const maxLoan = await t.one('SELECT COALESCE(MAX(loan_id), 0) AS max_id FROM loan_detail');
            let nextLoanId = maxLoan.max_id + 1;

            for (const { device_id, quantity } of devices) {
                if (!device_id || !quantity || quantity <= 0) {
                    throw new Error('Invalid device_id or quantity.');
                }

                const availableItems = await t.any(
                    'SELECT item_id FROM device_item WHERE device_id = $1 AND item_availability = $2 ORDER BY item_id ASC',
                    [device_id, 'ready']
                );

                if (availableItems.length < quantity) {
                    throw new Error(`Not enough items available for device_id ${device_id}.`);
                }

                const selectedItems = availableItems.slice(0, quantity);
                totalItemQuantity += quantity;

                for (const item of selectedItems) {
                    const item_id = item.item_id;

                    await t.none(
                        'INSERT INTO loan_detail(loan_id, user_id, item_id, loan_status, due_date, item_availability_status, device_id, loan_date, transaction_id, cancelable_until) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)',
                        [nextLoanId, user_id, item_id, loan_status, due_date, itemAvailabilityStatus, device_id, loan_date, nextTransactionId, cancelable_until]
                    );
                    nextLoanId++;

                    if (loan_status === 'pending') {
                        await t.none(
                            'UPDATE device_item SET item_availability = $1 WHERE item_id = $2',
                            [itemAvailabilityStatus, item_id]
                        );
                    }
                }

                const updatedAvailability = await t.one(
                    'SELECT COUNT(*) AS ready_count FROM device_item WHERE device_id = $1 AND item_availability = $2',
                    [device_id, 'ready']
                );

                await t.none(
                    'UPDATE device SET device_availability = $1 WHERE device_id = $2',
                    [updatedAvailability.ready_count, device_id]
                );
            }

            // อัปเดต item_quantity ในตาราง transaction
            await t.none(
                'UPDATE transaction SET item_quantity = $1 WHERE transaction_id = $2',
                [totalItemQuantity, nextTransactionId]
            );

            // ส่ง JSON กลับไป
            res.status(200).json('ส่งคำร้องการยืมสำเร็จ');
            // ส่งการแจ้งเตือนผ่าน Line Notify พร้อมชื่อผู้ยืม
            const notifyMessage = `มีการขอยืมอุปกรณ์ใหม่แล้ว. ชื่อผู้ยืม: ${user_firstname} ${user_lastname}(User ID: ${user_id}), จำนวนรวม: ${totalItemQuantity}, จะมารับอุปกรณ์ภายในวันที่ ${new Date(due_date).toLocaleDateString()}` ;
            await sendLineNotify(notifyMessage);
        });
    } catch (error) {
        console.error('Error processing loan request:', error.message);
        if (!res.headersSent) {
            res.status(500).json('ส่งคำร้องการยืมไม่สำเร็จ');
        }
    }
});

// ยกเลิกการยืม
app.post('/cancel-loan/:transaction_id', authenticateToken, async (req, res) => {
    const { transaction_id } = req.params;
    try {
        const user_id = req.user.id;
        const now = new Date();

        // ดึงข้อมูลการยืมที่เกี่ยวข้องกับ transaction_id
        const loanDetails = await db.any(
            'SELECT * FROM loan_detail WHERE transaction_id = $1 AND user_id = $2',
            [transaction_id, user_id]
        );

        if (loanDetails.length == 0) {
            return res.status(404).json({ message: 'No loans found for this transaction or not authorized.' });
        }

        const loanStatuses = await db.any(
            'SELECT DISTINCT loan_status FROM loan_detail WHERE transaction_id = $1',
            [transaction_id]
        );

        const hasBeenCancelled = loanStatuses.some(status => status.loan_status == 'cancel');
        if (hasBeenCancelled) {
            return res.status(400).json({ message: 'Loan has already been canceled.' });
        }

        const firstLoanDetail = loanDetails[0];
        const cancelableUntil = new Date(firstLoanDetail.loan_date.getTime() + 12 * 60 * 60 * 1000);

        if (now > cancelableUntil) {
            return res.status(400).json({ message: 'Loan cancellation period has expired.' });
        }

        await db.tx(async t => {
            // เปลี่ยนสถานะของการยืมเป็น "cancel"
            await t.none(
                'UPDATE loan_detail SET loan_status = $1, item_availability_status = $2 WHERE transaction_id = $3',
                ['cancel', 'cancel', transaction_id]
            );

            // อัปเดตสถานะ item_availability กลับเป็น "ready"
            await t.none(
                'UPDATE device_item SET item_availability = $1 FROM loan_detail WHERE loan_detail.item_id = device_item.item_id AND loan_detail.transaction_id = $2',
                ['ready', transaction_id]
            );

            // ตรวจสอบและอัปเดตสถานะของอุปกรณ์ในตาราง device
            await t.none(
                'UPDATE device SET device_availability = (SELECT SUM(CASE WHEN item_availability = $1 THEN 1 ELSE 0 END) FROM device_item WHERE device_id = device.device_id) WHERE device_id IN (SELECT device_id FROM loan_detail WHERE transaction_id = $2)',
                ['ready', transaction_id]
            );

            // อัปเดต loan_status ในตาราง transaction ให้ตรงกับสถานะใน loan_detail
            const updatedLoanStatus = await t.one(
                'SELECT loan_status FROM loan_detail WHERE transaction_id = $1 LIMIT 1',
                [transaction_id]
            );

            await t.none(
                'UPDATE transaction SET loan_status = $1 WHERE transaction_id = $2',
                [updatedLoanStatus.loan_status, transaction_id]
            );

            // อัปเดต item_quantity ในตาราง transaction
            await t.none(
                'UPDATE transaction SET item_quantity = (SELECT COUNT(*) FROM loan_detail WHERE transaction_id = $1) WHERE transaction_id = $2',
                [transaction_id, transaction_id]
            );

            // ดึงข้อมูลชื่อและนามสกุลของผู้ยืมจากตาราง users
            const userInfo = await t.one(
                'SELECT user_firstname, user_lastname FROM users WHERE user_id = $1',
                [user_id]
            );

            res.status(200).json({ message: 'Loan canceled successfully.' });
            // ส่งการแจ้งเตือนผ่าน Line Notify พร้อมกับชื่อผู้ยืม
            const notifyMessage = `การยืมอุปกรณ์ถูกยกเลิกแล้ว. Transaction ID: ${transaction_id}, ผู้ยืม: ${userInfo.user_firstname} ${userInfo.user_lastname}`;
            await sendLineNotify(notifyMessage);
        });
    } catch (error) {
        console.error('ERROR:', error);
        if (!res.headersSent) {
            res.status(500).json({ message: 'Error canceling loan request' });
        }
    }
});

// ดูรายการที่ cancel
app.get('/admin/loan_detail/cancel', authenticateToken, async (req, res) => {
    try {
        const requests = await db.any(`
            SELECT t.user_id, t.transaction_id, u.user_firstname, u.user_email, t.loan_date, t.due_date, t.item_quantity, ld.loan_status, ld.item_id
            FROM transaction t
            JOIN users u ON t.user_id = u.user_id
            LEFT JOIN loan_detail ld ON t.transaction_id = ld.transaction_id
            WHERE ld.loan_status = 'cancel'
            ORDER BY t.loan_date DESC;
        `);
        const groupedRequests = requests.reduce((acc, curr) => {
            const existingRequest = acc.find(req => req.user_id == curr.user_id && req.transaction_id == curr.transaction_id);
            if (existingRequest) {
                existingRequest.item_ids.push(curr.item_id); 
                existingRequest.loan_status = curr.loan_status;
            } else {
                acc.push({
                    user_id: curr.user_id,
                    transaction_id: curr.transaction_id,
                    user_firstname: curr.user_firstname,
                    user_email: curr.user_email,
                    loan_date: moment.utc(curr.loan_date).tz('Asia/Bangkok').format('YYYY-MM-DD HH:mm:ss'),
                    due_date: moment.utc(curr.due_date).tz('Asia/Bangkok').format('YYYY-MM-DD HH:mm:ss'),
                    item_quantity: curr.item_quantity,
                    loan_status: curr.loan_status,
                    item_ids: [curr.item_id]
                });
            }
            return acc;
        }, []);

        groupedRequests.forEach(req => req.item_ids = req.item_ids.join(','));
        res.status(200).json(groupedRequests);
    } catch (error) {
        console.error('ERROR:', error);
        res.status(500).json({ message: 'Error fetching transactions' });
    }
});
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// ***ฟังก์ชันการคืน***
// ยืนยันการคืนแบบ manual
app.post('/return', authenticateToken, upload.single('device_photo'), async (req, res) => {
    let items;
    let tempPhotoPath;
    let finalPhotoName;

    try {
        console.log('Request body:', req.body);
        console.log('File info:', req.file);

        items = req.body.items ? JSON.parse(req.body.items) : [];
        tempPhotoPath = req.file ? req.file.path : null;

        if (!items || !Array.isArray(items) || items.length == 0) {
            if (tempPhotoPath) {
                fs.unlinkSync(tempPhotoPath);
            }
            return res.status(400).json({ message: 'Please provide a list of items to return.' });
        }

        const returnDate = new Date();
        const adminUserId = req.user.user_id;

        await db.tx(async t => {
            let deviceUpdates = new Map();

            for (const { item_id, return_status } of items) {
                const transactions = await t.any(
                    'SELECT transaction_id, user_id, due_date FROM loan_detail WHERE item_id = $1 AND return_date IS NULL',
                    [item_id]
                );

                if (transactions.length == 0) {
                    if (tempPhotoPath) {
                        fs.unlinkSync(tempPhotoPath);
                    }
                    return res.status(400).json({ message: `Item ${item_id} does not have an active loan.` });
                }

                const transaction_id = transactions[0].transaction_id;
                const transaction_user_id = transactions[0].user_id;
                const dueDate = new Date(transactions[0].due_date); // เก็บวันที่ครบกำหนด

                const result = await t.one('SELECT COALESCE(MAX(return_id), 0) AS max_id FROM return_detail');
                const nextId = result.max_id + 1;

                // ใช้ชื่อไฟล์แทนเส้นทาง
                finalPhotoName = req.file ? req.file.filename : null;

                // Insert into return_detail with only filename
                await t.none(
                    'INSERT INTO return_detail(return_id, user_id, item_id, return_status, device_photo, return_date, transaction_id) VALUES($1, $2, $3, $4, $5, $6, $7)',
                    [nextId, transaction_user_id, item_id, return_status, finalPhotoName, returnDate, transaction_id]
                );

                // ตรวจสอบว่าเกินวันครบกำหนดหรือไม่
                let loanStatus = 'complete';
                if (returnDate > dueDate) {
                    loanStatus = 'overdue';
                }

                await t.none(
                    'UPDATE loan_detail SET return_date = $1, loan_status = $2, item_availability_status = $3 WHERE item_id = $4 AND return_date IS NULL',
                    [returnDate, loanStatus, 'complete', item_id]
                );

                if (return_status == 'returned') {
                    await t.none(
                        'UPDATE device_item SET item_availability = $1, item_loaning = false WHERE item_id = $2',
                        ['ready', item_id]
                    );

                    const { device_id } = await t.one(
                        'SELECT device_id FROM device_item WHERE item_id = $1',
                        [item_id]
                    );

                    if (!deviceUpdates.has(device_id)) {
                        deviceUpdates.set(device_id, 0);
                    }

                    deviceUpdates.set(device_id, deviceUpdates.get(device_id) + 1);
                } else if (return_status == 'lost') {
                    await t.none(
                        'UPDATE device_item SET item_availability = $1, item_loaning = false WHERE item_id = $2',
                        ['lost', item_id]
                    );
                } else if (return_status == 'damaged') {
                    await t.none(
                        'UPDATE device_item SET item_availability = $1, item_loaning = false WHERE item_id = $2',
                        ['broken', item_id]
                    );
                }

                await t.none(
                    'UPDATE transaction SET return_date = $1, device_photo = $2, loan_status = $3 WHERE transaction_id = $4',
                    [returnDate, finalPhotoName, loanStatus, transaction_id] // อัปเดต loan_status ตามเงื่อนไข
                );
            }

            for (const [device_id, returnedCount] of deviceUpdates) {
                await t.none(
                    'UPDATE device SET device_availability = device_availability + $1 WHERE device_id = $2',
                    [returnedCount, device_id]
                );
            }

            if (tempPhotoPath) {
                const finalPhotoPath = path.join('uploads', finalPhotoName);
                fs.renameSync(tempPhotoPath, finalPhotoPath);
            }

            res.status(200).json({ message: 'Return processed successfully.' });
        });
    } catch (error) {
        console.error('ERROR:', error);
        if (tempPhotoPath && fs.existsSync(tempPhotoPath)) {
            fs.unlinkSync(tempPhotoPath);
        }
        if (!res.headersSent) {
            res.status(500).json({ message: 'Error processing return' });
        }
    }
});

// ดูข้อมูลใน qr-code
app.get('/return-data-transaction', async (req, res) => {
    const data = req.query.data;

    try {
        // ตรวจสอบว่ามีข้อมูลจาก QR code หรือไม่
        if (!data) {
            return res.status(400).json({ message: 'ไม่มีข้อมูลจาก QR code' });
        }

        const response = await fetch('http://localhost:8000/return/scan-transaction', { // เปลี่ยน URL ให้ตรงกับเส้นทางที่ต้องการเรียก
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': req.headers.authorization, // ส่งต่อ token สำหรับการยืนยันตัวตน
            },
            body: JSON.stringify({
                data: data, // ส่งข้อมูล QR code ไปยังฟังก์ชัน POST
            }),
        });

        const result = await response.json();

        if (!response.ok) {
            return res.status(response.status).json(result);
        }

        // ส่งผลลัพธ์จาก POST กลับไปยังผู้เรียก GET
        res.status(200).json(result);

    } catch (error) {
        console.error('เกิดข้อผิดพลาด:', error);
        res.status(500).json({ message: 'เกิดข้อผิดพลาดในการประมวลผลข้อมูล QR code.' });
    }
});
app.get('/return-data-transaction', async (req, res) => {
    const data = req.query.data;

    try {
        // ตรวจสอบว่ามีข้อมูลจาก QR code หรือไม่
        if (!data) {
            return res.status(400).json({ message: 'ไม่มีข้อมูลจาก QR code' });
        }

        const response = await fetch('http://localhost:8000/return/scan-item', { // เปลี่ยน URL ให้ตรงกับเส้นทางที่ต้องการเรียก
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': req.headers.authorization, // ส่งต่อ token สำหรับการยืนยันตัวตน
            },
            body: JSON.stringify({
                data: data, // ส่งข้อมูล QR code ไปยังฟังก์ชัน POST
            }),
        });

        const result = await response.json();

        if (!response.ok) {
            return res.status(response.status).json(result);
        }

        // ส่งผลลัพธ์จาก POST กลับไปยังผู้เรียก GET
        res.status(200).json(result);

    } catch (error) {
        console.error('เกิดข้อผิดพลาด:', error);
        res.status(500).json({ message: 'เกิดข้อผิดพลาดในการประมวลผลข้อมูล QR code.' });
    }
});

// สแกนตาม transaction_id 
app.post('/return/scan-transaction', async (req, res) => {
    try {
        const { transaction_id } = req.body;

        if (!transaction_id) {
            return res.status(400).json({ message: 'กรุณาระบุ transaction_id.' });
        }

        // ดึงข้อมูลรายการยืมทั้งหมดจาก transaction_id นั้น
        const loanDetails = await db.any(
            `SELECT item_id, loan_status, return_date
            FROM loan_detail
            WHERE transaction_id = $1`,
            [transaction_id]
        );

        if (!loanDetails || loanDetails.length == 0) {
            return res.status(400).json({ message: 'ไม่พบรายการยืมใด ๆ สำหรับ transaction_id นี้.' });
        }

        // ตรวจสอบว่ามีรายการยืมที่ยังไม่ถูกคืนหรือไม่ (return_date IS NULL)
        const unreturnedItems = loanDetails.filter(item => item.return_date == null);

        if (unreturnedItems.length == 0) {
            return res.status(200).json({ message: 'รายการทั้งหมดได้ทำการคืนแล้ว.' });
        }

        res.status(200).json({ 
            message: 'พบรายการยืม กรุณาสแกนอุปกรณ์แต่ละตัวในรายการที่ต้องการคืน.',
            items: unreturnedItems // ส่งข้อมูล item_id ที่ยังไม่ได้คืนไปที่หน้าถัดไป
        });
    } catch (error) {
        console.error('เกิดข้อผิดพลาดในการดึงรายการยืม:', error);
        res.status(500).json({ message: 'เกิดข้อผิดพลาดในการดึงรายการยืม.' });
    }
});
// สแกนตาม item_id ใน transaction_id นั้นๆ
app.post('/return/scan-item', async (req, res) => {
    const { transaction_id, item_ids } = req.body;

    try {
        if (!transaction_id || !item_ids || !Array.isArray(item_ids) || item_ids.length == 0) {
            return res.status(400).json({ message: 'กรุณาระบุ transaction_id และ item_ids.' });
        }

        console.log('Received transaction_id:', transaction_id);
        console.log('Received item_ids:', item_ids);

        const returnDate = new Date();

        await db.tx(async t => {
            // ตรวจสอบว่า item_id ที่คืนถูกยืมใน transaction_id
            const loanDetails = await t.any(
                `SELECT item_id FROM loan_detail 
                 WHERE transaction_id = $1 AND return_date IS NULL`,
                [transaction_id]
            );

            console.log('Loan details found:', loanDetails);

            const itemIdsInteger = item_ids.map(id => parseInt(id, 10));
            const loanedItemIds = loanDetails.map(ld => ld.item_id);

            console.log('Loaned item IDs:', loanedItemIds);

            for (const item_id of itemIdsInteger) {
                if (!loanedItemIds.includes(item_id)) {
                    throw new Error(`รายการ ${item_id} ไม่ได้ถูกยืมใน transaction_id นี้.`);
                }
            }

            // อัปเดตสถานะการคืนและสถานะสินค้าทั้งหมด
            await t.none(
                `UPDATE transaction 
                 SET return_date = $1, loan_status = 'complete' 
                 WHERE transaction_id = $2`,
                [returnDate, transaction_id]
            );

            for (const item_id of itemIdsInteger) {
                // อัปเดต loan_detail
                await t.none(
                    `UPDATE loan_detail
                     SET return_date = $1, loan_status = 'complete', item_availability_status = 'complete'
                     WHERE transaction_id = $2 AND item_id = $3`,
                    [returnDate, transaction_id, item_id]
                );                
                // อัปเดต device_item
                await t.none(
                    `UPDATE device_item 
                     SET item_availability = 'ready', item_loaning = false 
                     WHERE item_id = $1`,
                    [item_id]
                );
                // แทรกหรืออัปเดต return_detail โดยใช้ RETURNING เพื่อจัดการกับค่า return_id
                await t.none(
                    `INSERT INTO return_detail (user_id, item_id, return_status, return_date, transaction_id)
                     VALUES (
                        (SELECT user_id FROM loan_detail WHERE transaction_id = $1 AND item_id = $2 LIMIT 1), 
                        $2, 
                        'complete', 
                        $3, 
                        $1
                     )
                     ON CONFLICT (transaction_id, item_id) DO UPDATE
                     SET return_status = EXCLUDED.return_status, return_date = EXCLUDED.return_date
                     WHERE return_detail.transaction_id = EXCLUDED.transaction_id AND return_detail.item_id = EXCLUDED.item_id`,
                    [transaction_id, item_id, returnDate]
                );
                // เพิ่มค่า device_availability ตามจำนวนที่คืน
                await t.none(
                    `UPDATE device 
                     SET device_availability = device_availability + 1
                     WHERE device_id = (
                        SELECT device_id FROM device_item WHERE item_id = $1
                     )`,
                    [item_id]
                );
            }
        });

        res.status(200).json({ message: `คืน ${item_ids.length} รายการสำเร็จ.` });
    } catch (error) {
        if (!res.headersSent) {
            console.error('เกิดข้อผิดพลาดในการคืน:', error);
            res.status(500).json({ message: error.message });
        }
    }
});

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// ประวัติการยืม-คืนที่สำเร็จแล้ว
app.get('/admin/history', authenticateToken, async (req, res) => {
    try {
        const history = await db.any(`
            SELECT 
                t.user_id,
                t.transaction_id,
                u.user_firstname,
                u.user_email,
                u.user_phone,
                t.loan_date,
                t.due_date,
                t.return_date,
                t.item_quantity,
                CASE
                    WHEN t.loan_status = 'overdue' THEN 'คืนเกินกำหนด'
                    WHEN t.loan_status = 'deny' THEN 'ถูกปฏิเสธ'
                    WHEN t.loan_status = 'cancel' THEN 'ถูกยกเลิก'
                    WHEN t.return_date IS NOT NULL THEN 'คืนแล้ว'
                END AS return_status
            FROM transaction t
            JOIN users u ON t.user_id = u.user_id
              AND (
                t.loan_status = 'deny'
                OR t.loan_status = 'cancel'
                OR t.return_date IS NOT NULL
              )
            ORDER BY t.loan_date DESC
        `);

        res.status(200).json(history);
    } catch (error) {
        console.error('Error fetching history:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// ประวัติการยืม-คืนที่สำเร็จแล้วแบบละเอียด
app.get('/admin/history/:user_id/:transaction_id', authenticateToken, async (req, res) => {
    const { user_id, transaction_id } = req.params;

    try {
        const history = await db.any(`
            SELECT DISTINCT
                di.item_name,
                di.item_serial,
                t.user_id,
                u.user_email,
                t.loan_date,
                t.due_date,
                t.return_date,
                COALESCE(
                    CASE 
                        WHEN l.loan_status = 'cancel' THEN 'ถูกยกเลิก'
                        WHEN l.loan_status = 'deny' THEN 'ถูกปฏิเสธ'
                        WHEN l.loan_status = 'borrowed' THEN 'กำลังยืม'
                        WHEN l.loan_status = 'complete' AND r.return_status IS NOT NULL THEN r.return_status
                        ELSE r.return_status
                    END, r.return_status
                ) AS status,
                r.return_id,
                di.item_id,
                CASE 
                    WHEN r.device_photo IS NOT NULL THEN CONCAT('http://localhost:8000/uploads/', REPLACE(r.device_photo, 'uploads\\', ''))
                    ELSE NULL
                END AS device_photo
            FROM transaction t
            LEFT JOIN loan_detail l ON t.transaction_id = l.transaction_id
            LEFT JOIN return_detail r ON l.item_id = r.item_id AND t.transaction_id = r.transaction_id
            LEFT JOIN device_item di ON l.item_id = di.item_id
            LEFT JOIN users u ON t.user_id = u.user_id
            WHERE t.user_id = $1
            AND t.transaction_id = $2
            ORDER BY di.item_id, t.loan_date DESC, t.return_date DESC
        `, [user_id, transaction_id]);

        if (history.length == 0) {
            return res.status(404).json({ message: 'ไม่พบข้อมูลสำหรับผู้ใช้หรือรายการที่ระบุ' });
        }

        res.status(200).json(history);
    } catch (error) {
        console.error('Error fetching history:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// แจ้งเตือนการคืน
const { checkDueDates } = require('./checkDueDates');
// เรียกใช้ฟังก์ชันโดยตรงเพื่อทดสอบ
// checkDueDates()
//     .then(() => console.log('checkDueDates executed successfully'))
//     .catch(err => console.error('Error executing checkDueDates:', err));
// แจ้งเตือนอัตโนมัตินับ
cron.schedule('0 0 * * *', () => {
    console.log('Checking due dates at 00:00...');
    checkDueDates();
});
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// ดูรายการตาม user-id ที่ล็อกอินมา 
app.get('/user/loan_detail', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        console.log(userId);
        const requests = await db.any(`
            SELECT t.user_id, t.transaction_id, u.user_firstname, u.user_email, t.loan_date, t.due_date, t.item_quantity, ld.loan_status, t.transaction_qrcode
            FROM transaction t
            JOIN users u ON t.user_id = u.user_id
            LEFT JOIN loan_detail ld ON t.transaction_id = ld.transaction_id
            WHERE t.user_id = $1 AND ld.loan_status = 'pending'
            ORDER BY t.loan_date DESC;
        `, [userId]);

        if (requests.length == 0) {
            return res.status(404).json({ message: 'No transactions found for this user' });
        }

        // Group the results by user_id and transaction_id
        const groupedRequests = requests.reduce((acc, curr) => {
            const existingRequest = acc.find(req => req.user_id == curr.user_id && req.transaction_id == curr.transaction_id);
            if (existingRequest) {
                existingRequest.loan_status = curr.loan_status;
            } else {
                acc.push({
                    user_id: curr.user_id,
                    transaction_id: curr.transaction_id,
                    user_firstname: curr.user_firstname,
                    user_email: curr.user_email,
                    loan_date: moment.utc(curr.loan_date).tz('Asia/Bangkok').format('YYYY-MM-DD HH:mm:ss'),
                    due_date: moment.utc(curr.due_date).tz('Asia/Bangkok').format('YYYY-MM-DD HH:mm:ss'),
                    item_quantity: curr.item_quantity,
                    loan_status: curr.loan_status,
                    transaction_qrcode: curr.transaction_qrcode
                });
            }
            return acc;
        }, []);

        res.status(200).json(groupedRequests);
    } catch (error) {
        console.error('ERROR:', error);
        res.status(500).json({ message: 'Error fetching transactions' });
    }
});
// ดูรายการตาม user-id ที่ล็อกอินมาแบบละเอียด
app.get('/user/loan_detail/:user_id/:transaction_id', authenticateToken, async (req, res) => {
    try {
        const user_id = parseInt(req.params.user_id, 10); 
        const transaction_id = parseInt(req.params.transaction_id, 10); 

        if (isNaN(user_id) || isNaN(transaction_id)) {
            return res.status(400).json({ message: 'Invalid user ID or transaction ID' });
        }

        const requests = await db.any(`
            SELECT r.loan_id, e.item_name, e.item_serial, u.user_id, u.user_email, 
                   r.loan_date, r.due_date, r.item_availability_status, r.item_id
            FROM loan_detail r
            JOIN users u ON r.user_id = u.user_id
            JOIN device_item e ON r.item_id = e.item_id
            WHERE r.user_id = $1 AND r.transaction_id = $2
            ORDER BY r.loan_date DESC;
        `, [user_id, transaction_id]);

        if (requests.length == 0) {
            return res.status(404).json({ user_id, transaction_id, requests: [], message: 'No requests found' });
        }
        // แปลงวันเวลาเป็น Timezone ที่ต้องการ
        const formattedRequests = requests.map(request => ({
            ...request,
            loan_date: moment.utc(request.loan_date).tz('Asia/Bangkok').format('YYYY-MM-DD HH:mm:ss'),
            due_date: moment.utc(request.due_date).tz('Asia/Bangkok').format('YYYY-MM-DD HH:mm:ss')
        }));

        res.status(200).json({ user_id, transaction_id, requests: formattedRequests });
    } catch (error) {
        console.error('ERROR:', error);
        res.status(500).json({ message: 'Error fetching requests' });
    }
});
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// ดูสถิติการยืมทั้งหมด
app.get('/admin/summary_report', authenticateToken, async (req, res) => {
    try {
        // สร้างรายงานโดยใช้ SQL CTEs (Common Table Expressions)
        const summary = await db.one(`
            WITH borrowed AS (
                SELECT COALESCE(COUNT(*), 0) AS total_borrowed
                FROM loan_detail
                WHERE loan_status = 'borrowed'
            ),
            returned AS (
                SELECT COALESCE(COUNT(*), 0) AS total_returned
                FROM loan_detail
                WHERE loan_status = 'complete'
            ),
            total_transactions AS (
                SELECT COALESCE(COUNT(DISTINCT transaction_id), 0) AS total_transactions
                FROM loan_detail
            ),
            lost_or_broken AS (
                SELECT COALESCE(SUM(total_lost_broken), 0) AS total_lost_broken
                FROM (
                    SELECT COUNT(*) AS total_lost_broken
                    FROM device_item
                    WHERE item_availability = 'broken'
                    UNION ALL
                    SELECT COUNT(*) AS total_lost_broken
                    FROM loan_detail l
                    JOIN device_item di ON l.item_id = di.item_id
                    WHERE di.item_availability = 'disappear'
                ) AS combined
            ),
            available AS (
                SELECT COALESCE(COUNT(*), 0) AS total_available
                FROM device_item
                WHERE item_availability = 'ready'
            ),
            most_borrowed AS (
                SELECT di.item_name, COUNT(l.item_id) AS borrow_count
                FROM loan_detail l
                JOIN device_item di ON l.item_id = di.item_id
                GROUP BY di.item_name
                ORDER BY borrow_count DESC
                LIMIT 10
            )
            SELECT 
                COALESCE((SELECT total_borrowed FROM borrowed), 0) AS total_borrowed,
                COALESCE((SELECT total_returned FROM returned), 0) AS total_returned,
                COALESCE((SELECT total_transactions FROM total_transactions), 0) AS total_transactions,
                COALESCE((SELECT total_lost_broken FROM lost_or_broken), 0) AS total_lost_broken,
                COALESCE((SELECT total_available FROM available), 0) AS total_available,
                json_agg(json_build_object('item_name', item_name, 'borrow_count', borrow_count)) AS most_borrowed_items
            FROM most_borrowed;
        `);

        res.status(200).json(summary);
    } catch (error) {
        console.error('ERROR:', error);
        res.status(500).json({ message: 'Error generating report' });
    }
});

// report แบบ execl
// ทดสอบการเชื่อมต่อฐานข้อมูล
// ทดสอบการเชื่อมต่อฐานข้อมูล
async function testDatabase() {
    try {
        const result = await db.query('SELECT NOW()');
        if (result && result.length > 0) {
            console.log('Database connected successfully:', result[0].now);
        } else {
            console.log('Database connection result is empty.');
        }
    } catch (error) {
        console.error('Database connection error:', error);
    }
}

// ฟังก์ชันดึงข้อมูลรายการยืม-คืน
async function getLoanReturnData() {
    try {
        const result = await db.query(`
        WITH grouped_devices AS (
            SELECT
                ld.transaction_id,  -- ใช้ transaction_id เพื่อให้แต่ละรายการแยกกัน
                d.device_name,
                ROW_NUMBER() OVER (ORDER BY ld.transaction_id) AS group_index  -- ใช้ transaction_id แทน
            FROM loan_detail ld
            JOIN device_item di ON ld.item_id = di.item_id
            JOIN device d ON di.device_id = d.device_id
            GROUP BY ld.transaction_id, d.device_name  -- ทำการจัดกลุ่มให้เฉพาะ transaction_id และ device_name
        )
        SELECT
            gd.group_index AS index,
            d.device_name AS device_name,
            di.item_serial AS device_serial,
            d.device_location AS location,
            ld.user_id AS user_id,
            CONCAT(u.user_firstname, ' ', u.user_lastname) AS user_name,
            u.user_phone AS user_phone,
            TO_CHAR(ld.loan_date, 'DD/MM/YYYY') AS loan_date,
            CASE 
                WHEN ld.return_date IS NULL THEN 'ยังไม่ได้คืน'
                ELSE TO_CHAR(ld.return_date, 'DD/MM/YYYY')
            END AS return_date,
            CASE
                WHEN ld.loan_status = 'complete' THEN 'คืนแล้ว'
                WHEN ld.loan_status = 'deny' THEN 'ถูกปฏิเสธ'
                WHEN ld.loan_status = 'cancel' THEN 'ถูกยกเลิก'
                WHEN ld.loan_status = 'pending' THEN 'รอดำเนินการ'
                WHEN ld.loan_status = 'approve' THEN 'อนุมัติ'
                WHEN ld.loan_status = 'borrowed' THEN 'กำลังถูกยืม'
                WHEN ld.loan_status = 'overdue' THEN 'คืนเกินกำหนด'
                ELSE ld.loan_status
            END AS สถานะรายการ
        FROM loan_detail ld
        JOIN device_item di ON ld.item_id = di.item_id
        JOIN device d ON di.device_id = d.device_id  
        JOIN users u ON ld.user_id = u.user_id
        JOIN grouped_devices gd ON ld.transaction_id = gd.transaction_id  -- ใช้ transaction_id แทน device_name
        ORDER BY gd.group_index, d.device_name, di.item_serial;
        `);
        if (result && result.length > 0) {
            console.log('Loan Return Query Result:', result);
            return result;
        } else {
            console.log('No loan/return data found.');
            return [];
        }
    } catch (error) {
        console.error('Error fetching loan/return data:', error);
        throw error;
    }
}

// ฟังก์ชันดึงข้อมูลอุปกรณ์ตามสถานะ
async function getDeviceByStatus(status) {
    const result = await db.query(`
        SELECT di.item_serial, di.item_availability, d.device_name, d.device_brand, d.device_model, d.device_location, d.device_responsible
        FROM device_item di
        JOIN device d ON di.device_id = d.device_id
        WHERE di.item_availability = $1 
        ORDER BY di.item_serial
    `, [status]);
    return result;
}

// ฟังก์ชันดึงข้อมูลอุปกรณ์ตามประเภท
async function getDeviceByType(type) {
    const result = await db.query(`
        SELECT di.item_serial, d.device_name, d.device_brand, d.device_model, d.device_location, d.device_responsible
        FROM device_item di
        JOIN device d ON di.device_id = d.device_id
        WHERE d.device_type = $1 
        ORDER BY di.item_serial
    `, [type]);
    return result;
}

// ฟังก์ชันดึงข้อมูลสรุปยอดรวม
async function getDeviceSummary() {
    try {
        const result = await db.query(`
            SELECT
                COUNT(*) AS total_items,
                SUM(CASE WHEN item_availability = 'ready' THEN 1 ELSE 0 END) AS ready,
                SUM(CASE WHEN item_availability = 'broken' THEN 1 ELSE 0 END) AS broken,
                SUM(CASE WHEN item_availability = 'lost' THEN 1 ELSE 0 END) AS lost 
            FROM device_item
        `);
        if (result && result.length > 0) {
            console.log('Device Summary Query Result:', result[0]);
            return result[0];
        } else {
            console.log('No device summary data found.');
            return {};
        }
    } catch (error) {
        console.error('Error fetching device summary:', error);
        throw error;
    }
}

// ฟังก์ชันสร้างรายงานประวัติการยืม-คืนอุปกรณ์ทั้งหมด
async function generateLoanReturnReport() {
    try {
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('รายการยืม-คืนทั้งหมด');
        worksheet.columns = [
            { header: 'รายการที่', key: 'index', width: 20 },
            { header: 'ชื่อครุภัณฑ์', key: 'device_name', width: 50 },
            { header: 'รหัสครุภัณฑ์', key: 'device_serial', width: 50 },
            { header: 'สถานที่ใช้งาน', key: 'location', width: 30 },
            { header: 'รหัสนิสิต/อาจารย์', key: 'user_id', width: 20 },
            { header: 'ชื่อ-สกุลผู้ยืม', key: 'user_name', width: 25 },
            { header: 'เบอร์โทรศัพท์', key: 'user_phone', width: 20 },
            { header: 'วันที่ยืม', key: 'loan_date', width: 20 },
            { header: 'วันที่คืน', key: 'return_date', width: 20 },
            { header: 'สถานะรายการ', key: 'transaction_status', width: 15 }
        ];

        worksheet.getRow(1).font = { bold: true };
        worksheet.getRow(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFD3D3D3' }
        };

        const loanReturnData = await getLoanReturnData(); // ดึงข้อมูลจากฐานข้อมูล

        let totalTransactions = 0;
        let notReturnedCount = 0;
        let returnedCount = 0;

        if (loanReturnData.length > 0) {
            let currentIndex = null;
            let startRow = 2;
            let endRow = 2;

            loanReturnData.forEach((record, idx) => {
                worksheet.addRow({
                    index: record.index,
                    device_name: record.device_name,
                    device_serial: record.device_serial,
                    location: record.location,
                    user_id: record.user_id,
                    user_name: record.user_name,
                    user_phone: record.user_phone,
                    loan_date: record.loan_date,
                    return_date: record.return_date,
                    transaction_status: record.สถานะรายการ
                });

                totalTransactions++;

                // นับจำนวนรายการที่ยังไม่ได้คืน และคืนแล้ว
                if (record.สถานะรายการ === 'กำลังถูกยืม' || record.return_date === 'ยังไม่ได้คืน') {
                    notReturnedCount++;
                } else if (record.สถานะรายการ === 'คืนแล้ว' || record.สถานะรายการ === 'คืนเกินกำหนด') {
                    returnedCount++;
                }

                // ตรวจสอบว่ารายการ index เปลี่ยนหรือไม่
                if (currentIndex !== record.index) {
                    // Merge เซลล์ในคอลัมน์ A สำหรับกลุ่มรายการก่อนหน้านี้
                    if (currentIndex !== null) {
                        worksheet.mergeCells(`A${startRow}:A${endRow}`);
                    }
                    // ตั้งค่าเริ่มต้นสำหรับกลุ่มรายการใหม่
                    currentIndex = record.index;
                    startRow = idx + 2; // เริ่มต้นแถวใหม่
                }
                endRow = idx + 2; // ปรับค่า endRow ทุกครั้งที่วนลูป
            });

            // Merge เซลล์สำหรับกลุ่มสุดท้ายหลังจากวนลูปเสร็จ
            worksheet.mergeCells(`A${startRow}:A${endRow}`);

            // เว้น 1 บรรทัดแล้วเพิ่มผลรวมด้านล่าง
            worksheet.addRow([]); // เว้น 1 บรรทัด
            worksheet.addRow({
                device_name: 'จำนวนรายการอุปกรณ์ที่ถูกยืม-คืนทั้งหมด',
                device_serial: totalTransactions
            }).font = { bold: true };
            worksheet.addRow({
                device_name: 'จำนวนรายการอุปกรณ์ที่ยังไม่ได้คืน',
                device_serial: notReturnedCount
            }).font = { bold: true };
            worksheet.addRow({
                device_name: 'จำนวนรายการอุปกรณ์ที่คืนแล้ว',
                device_serial: returnedCount
            }).font = { bold: true };

        } else {
            worksheet.addRow(['ไม่มีข้อมูลการยืม-คืน']);
        }

        // จัดตำแหน่งข้อมูลให้อยู่ตรงกลาง
        worksheet.eachRow((row, rowNumber) => {
            row.eachCell((cell, colNumber) => {
                cell.alignment = { vertical: 'middle', horizontal: 'center' };
            });
        });

        // บันทึกไฟล์ Excel
        const fileName = 'รายงานประวัติการยืม-คืนอุปกรณ์ทั้งหมด.xlsx';
        const filePath = path.join(__dirname, 'report', fileName);

        console.log('Saving Loan Return report to:', filePath);

        await workbook.xlsx.writeFile(filePath);
        console.log('Loan Return report saved successfully.');

        return filePath;

    } catch (error) {
        console.error('Error generating Loan Return report:', error);
        throw error;
    }
}

// ฟังก์ชันสร้างรายงานสถานะอุปกรณ์ทั้งหมด
async function generateDeviceStatusReport() {
    try {
        const workbook = new ExcelJS.Workbook();

        const statuses = ['ready', 'pending', 'borrowed', 'broken', 'lost'];
        const statusNames = {
            'ready': 'พร้อมใช้งาน',
            'pending': 'รอดำเนินการ',
            'borrowed': 'กำลังถูกยืม',
            'broken': 'ชำรุด',
            'lost': 'สูญหาย'
        };

        for (const status of statuses) {
            const worksheet = workbook.addWorksheet(`สถานะ ${statusNames[status]}`);
            worksheet.columns = [
                { header: 'ชื่อครุภัณฑ์', key: 'device_name', width: 50 },
                { header: 'หมายเลขครุภัณฑ์', key: 'item_serial', width: 50 },
                { header: 'ยี่ห้อ', key: 'device_brand', width: 20 },
                { header: 'รุ่น/โมเดล', key: 'device_model', width: 20 },
                { header: 'สถานที่ใช้งาน', key: 'device_location', width: 20 },
                { header: 'ชื่อผู้รับผิดชอบ', key: 'device_responsible', width: 20 },
                { header: 'สถานะ', key: 'item_availability', width: 20 }
            ];
            worksheet.getRow(1).font = { bold: true };
            worksheet.getRow(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFD3D3D3' }
            };

            // ดึงข้อมูลอุปกรณ์ตามสถานะ
            try {
                const devices = await getDeviceByStatus(status);
                devices.forEach(record => {
                    worksheet.addRow({
                        device_name: record.device_name,
                        item_serial: record.item_serial,
                        device_brand: record.device_brand,
                        device_model: record.device_model,
                        device_location: record.device_location,
                        device_responsible: record.device_responsible,
                        item_availability: statusNames[status]
                    });
                });

                // เพิ่มแถวสรุปจำนวนอุปกรณ์
                worksheet.addRow({
                    item_serial: `จำนวนอุปกรณ์ที่ ${statusNames[status]} ทั้งหมด`,
                    item_availability: devices.length
                }).font = { bold: true };

                // จัดตำแหน่งข้อมูลให้อยู่ตรงกลาง
                worksheet.eachRow((row, rowNumber) => {
                    row.eachCell((cell, colNumber) => {
                        cell.alignment = { vertical: 'middle', horizontal: 'center' };
                    });
                });

            } catch (error) {
                console.error(`Error fetching devices with status ${status}:`, error);
            }
        }

        // บันทึกไฟล์ Excel
        const fileName = 'รายงานสถานะอุปกรณ์ทั้งหมด.xlsx';
        const filePath = path.join(__dirname, 'report', fileName);

        console.log('Saving Device Status report to:', filePath);

        await workbook.xlsx.writeFile(filePath);
        console.log('Device Status report saved successfully.');

        return filePath;

    } catch (error) {
        console.error('Error generating Device Status report:', error);
        throw error;
    }
}

// ฟังก์ชันสร้างรายงานข้อมูลอุปกรณ์ทั้งหมดในห้องปฏิบัติการ
async function generateDeviceTypeReport() {
    try {
        const workbook = new ExcelJS.Workbook();

        // ฟังก์ชันสำหรับการเพิ่มคอลัมน์ทั่วไป
        function setupCommonColumns(worksheet) {
            worksheet.columns = [
                { header: 'ลำดับที่', key: 'index', width: 10 },
                { header: 'ชื่อครุภัณฑ์', key: 'device_name', width: 50 },
                { header: 'หมายเลขครุภัณฑ์', key: 'item_serial', width: 50 },
                { header: 'ยี่ห้อ', key: 'device_brand', width: 20 },
                { header: 'รุ่น/โมเดล', key: 'device_model', width: 20 },
                { header: 'สถานที่ใช้งาน', key: 'device_location', width: 20 },
                { header: 'ชื่อผู้รับผิดชอบ', key: 'device_responsible', width: 20 }
            ];
            worksheet.getRow(1).font = { bold: true };
            worksheet.getRow(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFD3D3D3' }
            };
        }

        // ประเภทอุปกรณ์ที่ต้องการรายงาน
        const deviceTypes = [
            'ครุภัณฑ์ประจำห้องปฏิบัติการ',
            'วัสดุคงทนถาวรประจำห้องปฏิบัติการ',
            'วัสดุสิ้นเปลืองประจำห้องปฏิบัติการ'
        ];

        for (const type of deviceTypes) {
            const worksheet = workbook.addWorksheet(type);
            setupCommonColumns(worksheet);
            const devices = await getDeviceByType(type);
            devices.forEach((record, index) => {
                worksheet.addRow({
                    index: index + 1,
                    device_name: record.device_name,
                    item_serial: record.item_serial,
                    device_brand: record.device_brand,
                    device_model: record.device_model,
                    device_location: record.device_location,
                    device_responsible: record.device_responsible
                });
            });
            // จัดตำแหน่งข้อมูลให้อยู่ตรงกลาง
            worksheet.eachRow((row, rowNumber) => {
                row.eachCell((cell, colNumber) => {
                    cell.alignment = { vertical: 'middle', horizontal: 'center' };
                });
            });
        }

        // บันทึกไฟล์ Excel
        const fileName = 'รายงานข้อมูลอุปกรณ์ทั้งหมดในห้องปฏิบัติการ.xlsx';
        const filePath = path.join(__dirname, 'report', fileName);

        console.log('Saving Device Type report to:', filePath);

        await workbook.xlsx.writeFile(filePath);
        console.log('Device Type report saved successfully.');

        return filePath;

    } catch (error) {
        console.error('Error generating Device Type report:', error);
        throw error;
    }
}

// Route สำหรับดาวน์โหลดรายงานประวัติการยืม-คืนอุปกรณ์ทั้งหมด
app.get('/report/download/loan-return', async (req, res) => {
    try {
        await testDatabase(); // ทดสอบการเชื่อมต่อฐานข้อมูล
        const filePath = await generateLoanReturnReport();
        res.download(filePath, 'รายงานประวัติการยืม-คืนอุปกรณ์ทั้งหมด.xlsx', err => {
            if (err) {
                console.error('Error downloading Loan Return report:', err);
                res.status(500).send('Failed to download Loan Return report.');
            }
        });
    } catch (error) {
        console.error('Failed to generate Loan Return report:', error);
        res.status(500).send('Failed to generate Loan Return report.');
    }
});

// Route สำหรับดาวน์โหลดรายงานสถานะอุปกรณ์ทั้งหมด
app.get('/report/download/status', async (req, res) => {
    try {
        await testDatabase(); // ทดสอบการเชื่อมต่อฐานข้อมูล
        const filePath = await generateDeviceStatusReport();
        res.download(filePath, 'รายงานสถานะอุปกรณ์ทั้งหมด.xlsx', err => {
            if (err) {
                console.error('Error downloading Device Status report:', err);
                res.status(500).send('Failed to download Device Status report.');
            }
        });
    } catch (error) {
        console.error('Failed to generate Device Status report:', error);
        res.status(500).send('Failed to generate Device Status report.');
    }
});

// Route สำหรับดาวน์โหลดรายงานข้อมูลอุปกรณ์ทั้งหมดในห้องปฏิบัติการ
app.get('/report/download/device-type', async (req, res) => {
    try {
        await testDatabase(); // ทดสอบการเชื่อมต่อฐานข้อมูล
        const filePath = await generateDeviceTypeReport();
        res.download(filePath, 'รายงานข้อมูลอุปกรณ์ทั้งหมดในห้องปฏิบัติการ.xlsx', err => {
            if (err) {
                console.error('Error downloading Device Type report:', err);
                res.status(500).send('Failed to download Device Type report.');
            }
        });
    } catch (error) {
        console.error('Failed to generate Device Type report:', error);
        res.status(500).send('Failed to generate Device Type report.');
    }
});
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// approve แค่ละ user
app.get('/loan_detail/approve/:user_id', authenticateToken, async (req, res) => {
    const { user_id } = req.params; // ดึง user_id จากพารามิเตอร์ URL

    try {
        const requests = await db.any(`
            SELECT t.user_id, t.transaction_id, u.user_firstname, u.user_email, u.user_phone, t.loan_date, t.due_date, t.item_quantity, ld.loan_status, ld.item_id
            FROM transaction t
            JOIN users u ON t.user_id = u.user_id
            LEFT JOIN loan_detail ld ON t.transaction_id = ld.transaction_id
            WHERE ld.loan_status = 'approve' AND t.user_id = $1
            ORDER BY t.loan_date DESC;
        `, [user_id]);

        // Group the results by transaction_id and aggregate item_ids
        const groupedRequests = requests.reduce((acc, curr) => {
            const existingRequest = acc.find(req => req.transaction_id == curr.transaction_id);
            if (existingRequest) {
                existingRequest.item_ids.push(curr.item_id); // Aggregate item_ids
                existingRequest.loan_status = curr.loan_status; // Update loan_status
            } else {
                acc.push({
                    user_id: curr.user_id,
                    transaction_id: curr.transaction_id,
                    user_firstname: curr.user_firstname,
                    user_email: curr.user_email,
                    user_phone: curr.user_phone, // Add user_phone
                    loan_date: moment.utc(curr.loan_date).tz('Asia/Bangkok').format('YYYY-MM-DD HH:mm:ss'),
                    due_date: moment.utc(curr.due_date).tz('Asia/Bangkok').format('YYYY-MM-DD HH:mm:ss'),
                    item_quantity: curr.item_quantity,
                    loan_status: curr.loan_status,
                    item_ids: [curr.item_id] // Initialize item_ids array
                });
            }
            return acc;
        }, []);

        // Optionally, convert item_ids to a string
        groupedRequests.forEach(req => req.item_ids = req.item_ids.join(','));
        res.status(200).json(groupedRequests);
    } catch (error) {
        console.error('ERROR:', error);
        res.status(500).json({ message: 'Error fetching transactions' });
    }
});
// approve ของทุกคนที่ต้องกดยืนยัน
app.get('/loan_detail/approve', authenticateToken, async (req, res) => {
    try {
        const requests = await db.any(`
            SELECT t.user_id, t.transaction_id, u.user_firstname, u.user_email, u.user_phone, t.loan_date, t.due_date, t.item_quantity, ld.loan_status, ld.item_id
            FROM transaction t
            JOIN users u ON t.user_id = u.user_id
            LEFT JOIN loan_detail ld ON t.transaction_id = ld.transaction_id
            WHERE ld.loan_status = 'approve'
            ORDER BY t.loan_date DESC;
        `);

        // Group the results by transaction_id and aggregate item_ids
        const groupedRequests = requests.reduce((acc, curr) => {
            const existingRequest = acc.find(req => req.transaction_id == curr.transaction_id);
            if (existingRequest) {
                existingRequest.item_ids.push(curr.item_id); // Aggregate item_ids
                existingRequest.loan_status = curr.loan_status; // Update loan_status
            } else {
                acc.push({
                    user_id: curr.user_id,
                    transaction_id: curr.transaction_id,
                    user_firstname: curr.user_firstname,
                    user_email: curr.user_email,
                    user_phone: curr.user_phone, // Add user_phone
                    loan_date: moment.utc(curr.loan_date).tz('Asia/Bangkok').format('YYYY-MM-DD HH:mm:ss'),
                    due_date: moment.utc(curr.due_date).tz('Asia/Bangkok').format('YYYY-MM-DD HH:mm:ss'),
                    item_quantity: curr.item_quantity,
                    loan_status: curr.loan_status,
                    item_ids: [curr.item_id] // Initialize item_ids array
                });
            }
            return acc;
        }, []);

        // Optionally, convert item_ids to a string
        groupedRequests.forEach(req => req.item_ids = req.item_ids.join(','));
        res.status(200).json(groupedRequests);
    } catch (error) {
        console.error('ERROR:', error);
        res.status(500).json({ message: 'Error fetching transactions' });
    }
});
// borrowed ของแต่ละ user
app.get('/loan_detail/borrowed/:user_id', authenticateToken, async (req, res) => {
    const { user_id } = req.params; // ดึง user_id จากพารามิเตอร์ URL

    try {
        const requests = await db.any(`
            SELECT t.user_id, t.transaction_id, u.user_firstname, u.user_email, u.user_phone, t.loan_date, t.due_date, t.item_quantity, ld.loan_status, ld.item_id
            FROM transaction t
            JOIN users u ON t.user_id = u.user_id
            LEFT JOIN loan_detail ld ON t.transaction_id = ld.transaction_id
            WHERE ld.loan_status = 'borrowed' AND t.user_id = $1
            ORDER BY t.loan_date DESC;
        `, [user_id]);

        // Group the results by transaction_id and aggregate item_ids
        const groupedRequests = requests.reduce((acc, curr) => {
            const existingRequest = acc.find(req => req.transaction_id == curr.transaction_id);
            if (existingRequest) {
                existingRequest.item_ids.push(curr.item_id); // Aggregate item_ids
                existingRequest.loan_status = curr.loan_status; // Update loan_status
            } else {
                acc.push({
                    user_id: curr.user_id,
                    transaction_id: curr.transaction_id,
                    user_firstname: curr.user_firstname,
                    user_email: curr.user_email,
                    user_phone: curr.user_phone, // Add user_phone
                    loan_date: moment.utc(curr.loan_date).tz('Asia/Bangkok').format('YYYY-MM-DD HH:mm:ss'),
                    due_date: moment.utc(curr.due_date).tz('Asia/Bangkok').format('YYYY-MM-DD HH:mm:ss'),
                    item_quantity: curr.item_quantity,
                    loan_status: curr.loan_status,
                    item_ids: [curr.item_id] // Initialize item_ids array
                });
            }
            return acc;
        }, []);

        // Optionally, convert item_ids to a string
        groupedRequests.forEach(req => req.item_ids = req.item_ids.join(','));
        res.status(200).json(groupedRequests);
    } catch (error) {
        console.error('ERROR:', error);
        res.status(500).json({ message: 'Error fetching transactions' });
    }
});
// รายการที่ยืมของแต่ละ user
app.get('/user/history/:user_id', authenticateToken, async (req, res) => {
    const { user_id } = req.params; // ดึง user_id จากพารามิเตอร์ URL

    try {
        const history = await db.any(`
            SELECT 
                t.user_id,
                t.transaction_id,
                u.user_firstname,
                u.user_email,
                u.user_phone,
                t.loan_date,
                t.due_date,
                t.return_date,
                t.item_quantity,
                CASE
                    WHEN t.loan_status = 'overdue' THEN 'คืนเกินกำหนด'
                    WHEN t.loan_status = 'deny' THEN 'ถูกปฏิเสธ'
                    WHEN t.loan_status = 'cancel' THEN 'ถูกยกเลิก'
                    WHEN t.return_date IS NOT NULL THEN 'คืนแล้ว'
                END AS return_status
            FROM transaction t
            JOIN users u ON t.user_id = u.user_id
            WHERE t.user_id = $1
              AND (
                t.loan_status = 'deny'
                OR t.loan_status = 'cancel'
                OR t.return_date IS NOT NULL
              )
            ORDER BY t.loan_date DESC
        `, [user_id]);

        if (history.length == 0) {
            return res.status(404).json({ message: 'ไม่พบประวัติสำหรับผู้ใช้ที่ระบุ' });
        }

        res.status(200).json(history);
    } catch (error) {
        console.error('Error fetching history:', error);
        res.status(500).json({ message: 'Server error' });
    }
});
app.get('/user/history/:user_id/:transaction_id', authenticateToken, async (req, res) => {
    const { user_id, transaction_id } = req.params;

    try {
        const history = await db.any(`
            SELECT DISTINCT
                di.item_name,
                di.item_serial,
                t.user_id,
                u.user_email,
                t.loan_date,
                t.due_date,
                t.return_date,
                COALESCE(
                    CASE 
                        WHEN l.loan_status = 'cancel' THEN 'ถูกยกเลิก'
                        WHEN l.loan_status = 'deny' THEN 'ถูกปฏิเสธ'
                        WHEN l.loan_status = 'borrowed' THEN 'กำลังยืม'
                        WHEN l.loan_status = 'complete' AND r.return_status IS NOT NULL THEN r.return_status
                        ELSE r.return_status
                    END, r.return_status
                ) AS status,
                r.return_id,
                di.item_id,
                CASE 
                    WHEN r.device_photo IS NOT NULL THEN CONCAT('http://localhost:8000/uploads/', REPLACE(r.device_photo, 'uploads\\', ''))
                    ELSE NULL
                END AS device_photo
            FROM transaction t
            LEFT JOIN loan_detail l ON t.transaction_id = l.transaction_id
            LEFT JOIN return_detail r ON l.item_id = r.item_id AND t.transaction_id = r.transaction_id
            LEFT JOIN device_item di ON l.item_id = di.item_id
            LEFT JOIN users u ON t.user_id = u.user_id
            WHERE t.user_id = $1
            AND t.transaction_id = $2
            ORDER BY di.item_id, t.loan_date DESC, t.return_date DESC
        `, [user_id, transaction_id]);

        if (history.length == 0) {
            return res.status(404).json({ message: 'ไม่พบข้อมูลสำหรับผู้ใช้หรือรายการที่ระบุ' });
        }

        // ลองพิมพ์ผลลัพธ์เพื่อดูค่า
        console.log('History:', history);

        res.status(200).json(history);
    } catch (error) {
        console.error('Error fetching history:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

app.get('/uploads/test', (req, res) => {
    res.send('Uploads directory is working');
});
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// ประวัติการยืม-คืน pdf //
// Endpoint สำหรับดึงข้อมูลรายงาน
app.post('/fetch-report', async (req, res) => {
    const { user_id, device_type, loan_date } = req.body;

    try {
        const data = await db.any(`
        SELECT
            di.item_name,
            di.item_serial,
            ld.loan_date AT TIME ZONE 'Asia/Bangkok' AS loan_date,
            rd.return_date AT TIME ZONE 'Asia/Bangkok' AS return_date,
            rd.return_status,
            CASE
                WHEN ld.loan_status = 'pending' THEN 'pending'
                WHEN rd.return_date IS NULL AND ld.loan_date < CURRENT_DATE THEN 'overdue'
                WHEN rd.return_date IS NULL THEN 'borrowed'
                ELSE 'returned'
            END AS loan_status
        FROM
            loan_detail ld
        JOIN
            device_item di ON ld.item_id = di.item_id
        LEFT JOIN
            return_detail rd ON ld.loan_id = rd.return_id
        WHERE
            ld.user_id = $1
            AND di.item_type = $2
            AND ld.loan_date AT TIME ZONE 'Asia/Bangkok' BETWEEN $3::DATE AND $3::DATE + INTERVAL '1 DAY';

        `, [user_id, device_type, loan_date]);

        if (data.length === 0) {
            return res.status(404).json({ message: 'ไม่พบข้อมูลการยืม-คืน' });
        }

        return res.status(200).json(data);
    } catch (error) {
        console.error('Error fetching report:', error);
        return res.status(500).json({ message: 'Internal Server Error' });
    }
});

// Endpoint สำหรับสร้างรายงาน PDF
app.get('/generate-report', async (req, res) => {
    const { user_id, device_type, loan_date } = req.query;

    try {
        // ดึงข้อมูล loan details และรวมชื่อผู้ใช้
        const loanDetails = await db.any(`
            SELECT
                di.item_name,
                di.item_serial,
                ld.loan_date AT TIME ZONE 'Asia/Bangkok' AS loan_date,
                rd.return_date AT TIME ZONE 'Asia/Bangkok' AS return_date,
                rd.return_status,
                ld.loan_status,
                CONCAT(u.user_firstname, ' ', u.user_lastname) AS user_name,
                u.user_faculty,
                u.user_branch,
                u.user_duty,
                u.user_phone
            FROM
                loan_detail ld
            JOIN
                device_item di ON ld.item_id = di.item_id
            LEFT JOIN
                return_detail rd ON ld.loan_id = rd.return_id
            JOIN
                users u ON ld.user_id = u.user_id
            WHERE
                ld.user_id = $1
                AND di.item_type = $2
                AND ld.loan_date AT TIME ZONE 'Asia/Bangkok' BETWEEN $3::DATE AND $3::DATE + INTERVAL '1 DAY'
        `, [user_id, device_type, loan_date]);

        if (loanDetails.length === 0) {
            return res.status(404).json({ message: 'No data found' });
        }

        // ข้อมูลผู้ใช้
        const user = loanDetails[0];
        const reportTitle = `ใบยืม-คืน${device_type}-${user_id}-${loan_date}`;
        const fileName = `${reportTitle}.pdf`; // สร้างชื่อไฟล์จากชื่อรายงาน
        const dirPath = path.join(__dirname, 'history-pdf'); // สร้างพาธสำหรับโฟลเดอร์
        const filePath = path.join(dirPath, fileName); // ใช้ชื่อไฟล์เป็นแบบที่กำหนด

        // ตรวจสอบว่าโฟลเดอร์ history-pdf มีอยู่หรือไม่ ถ้าไม่มีก็สร้างใหม่
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true }); // สร้างโฟลเดอร์พร้อมกันหลายชั้นได้
        }

        const doc = new PDFDocument({ size: 'A4', margin: 20 });
        doc.pipe(fs.createWriteStream(filePath));
        doc.font('./history-pdf/fonts/TH Niramit AS.ttf');

        // ส่วนหัว
        doc.fontSize(10).text('CPE-LAB-02', { align: 'left' });
        doc.text('เลขที่..................................................', { align: 'right' });
        doc.image('./history-pdf/logo/ict-up.jpg', doc.page.width / 2 - 30, 40, { width: 60, align: 'center' });

        doc.moveDown(5);
        doc.fontSize(16).text(`ใบยืม-คืน${device_type}`, { align: 'center' }); // ปรับหัวข้อให้แสดงตามที่ต้องการ
        doc.fontSize(14).text('อาคารคณะเทคโนโลยีสารสนเทศและการสื่อสาร', { align: 'center' });
        doc.fontSize(12);
        doc.text(`ข้าพเจ้า ..........${user.user_name}.......... สาขาวิชา ................${user.user_branch}................ คณะ ................${user.user_faculty}................`);
        doc.text(`ตำแหน่ง .......${user.user_duty}....... โทร .......${user.user_phone}....... หมายเลขเอกสารอ้างอิง (1).............................................. (2)..............................................`);
        doc.text('ขอยืมครุภัณฑ์ □ ห้องปฏิบัติการระบบเครือข่าย □ ห้องปฏิบัติการระบบดิจิทัลและไมโครโพรเซสเซอร์ □ ห้องปฏิบัติการคอมพิวเตอร์สารสนเทศและการสื่อสาร');
        doc.text('โดยกำหนดระยะเวลาในการยืม จำนวน........................วัน (กรณีขอขยายระยะเวลา เอกสารเลขที่........................................................) ดังรายการต่อไปนี้');
        doc.fillColor('red').text('***หมายเหตุ แถวที่มีอักษรเป็นสีแดง หมายถึง อุปกรณ์ตัวนั้นคืนเกินกำหนด***');
        doc.fillColor('black');
        doc.moveDown();
        
        // ฟังก์ชันสำหรับวาดหัวตาราง
        function drawTableHeader(doc, startX, startY, columnWidths, rowHeight) {
            const headers = ['ลำดับที่', 'รายการ', 'หมายเลขครุภัณฑ์', 'วันที่ยืม', 'วันที่คืน', 'สถานะ'];
            doc.rect(startX, startY, doc.page.width - 40, rowHeight).stroke();
            headers.forEach((header, i) => {
                const columnStartX = startX + columnWidths.slice(0, i).reduce((a, b) => a + b, 0);
                doc.text(header, columnStartX, startY + 5, { width: columnWidths[i], align: 'center' });
                // วาดเส้นแนวตั้งสำหรับทุกคอลัมน์
                doc.moveTo(columnStartX, startY).lineTo(columnStartX, startY + rowHeight).stroke();
            });
            // วาดเส้นแนวตั้งสุดท้าย
            doc.moveTo(startX + doc.page.width - 40, startY).lineTo(startX + doc.page.width - 40, startY + rowHeight).stroke();
        }

        // ฟังก์ชันสำหรับวาดแถวของข้อมูล
        function drawTableRow(doc, loan, index, startX, currentY, columnWidths, rowHeight) {
            doc.rect(startX, currentY, doc.page.width - 40, rowHeight).stroke();
            columnWidths.forEach((width, i) => {
                const columnStartX = startX + columnWidths.slice(0, i).reduce((a, b) => a + b, 0);
                // วาดเส้นแนวตั้งสำหรับทุกคอลัมน์
                doc.moveTo(columnStartX, currentY).lineTo(columnStartX, currentY + rowHeight).stroke();
            });
            // วาดเส้นแนวตั้งสุดท้าย
            doc.moveTo(startX + doc.page.width - 40, currentY).lineTo(startX + doc.page.width - 40, currentY + rowHeight).stroke();

            if (loan.loan_status === 'overdue') {
                doc.fillColor('red');
            } else {
                doc.fillColor('black');
            }

            doc.text(index + 1, startX, currentY + 5, { width: columnWidths[0], align: 'center' });
            doc.text(loan.item_name, startX + columnWidths[0], currentY + 5, { width: columnWidths[1], align: 'center' });
            doc.text(loan.item_serial, startX + columnWidths[0] + columnWidths[1], currentY + 5, { width: columnWidths[2], align: 'center' });
            doc.text(new Date(loan.loan_date).toLocaleDateString('th-TH'), startX + columnWidths[0] + columnWidths[1] + columnWidths[2], currentY + 5, { width: columnWidths[3], align: 'center' });
            doc.text(loan.return_date ? new Date(loan.return_date).toLocaleDateString('th-TH') : 'ยังไม่คืน', startX + columnWidths[0] + columnWidths[1] + columnWidths[2] + columnWidths[3], currentY + 5, { width: columnWidths[4], align: 'center' });

            let returnStatusText = '';
            if (loan.loan_status) {
                switch (loan.loan_status) {
                    case 'pending': 
                        returnStatusText = 'รอดำเนินการ'; 
                        break;
                    case 'approve': 
                        returnStatusText = 'รอรับอุปกรณ์'; 
                        break;
                    case 'borrowed': 
                        returnStatusText = 'กำลังยืม'; 
                        break;
                    default: 
                        // ถ้าไม่ตรงกับเงื่อนไขใน loan_status ก็ให้เช็ค return_status ต่อไป
                        if (loan.return_status) {
                            switch (loan.return_status) {
                                case 'returned': 
                                    returnStatusText = 'คืนแล้ว'; 
                                    break;
                                case 'lost': 
                                    returnStatusText = 'สูญหาย'; 
                                    break;
                                case 'damaged': 
                                    returnStatusText = 'ชำรุด'; 
                                    break;
                                case 'cancel': 
                                    returnStatusText = 'ถูกยกเลิก'; 
                                    break;
                                case 'deny': 
                                    returnStatusText = 'ปฏิเสธ'; 
                                    break;
                                default: 
                                    returnStatusText = 'ไม่ระบุ'; 
                                    break;
                            }
                        } else {
                            returnStatusText = 'ไม่ระบุ'; // ถ้าไม่มีสถานะใน return_status เลยก็ใส่ค่าเริ่มต้น
                        }
                        break;
                }
            } else {
                // ถ้าไม่มี loan_status ให้ตรวจสอบ return_status
                if (loan.return_status) {
                    switch (loan.return_status) {
                        case 'returned': 
                            returnStatusText = 'คืนแล้ว'; 
                            break;
                        case 'lost': 
                            returnStatusText = 'สูญหาย'; 
                            break;
                        case 'damaged': 
                            returnStatusText = 'ชำรุด'; 
                            break;
                        case 'cancel': 
                            returnStatusText = 'ถูกยกเลิก'; 
                            break;
                        case 'deny': 
                            returnStatusText = 'ปฏิเสธ'; 
                            break;
                        default: 
                            returnStatusText = 'ไม่ระบุ'; 
                            break;
                    }
                } else {
                    returnStatusText = 'ไม่ระบุ'; // ถ้าไม่มีสถานะใน return_status เลยก็ใส่ค่าเริ่มต้น
                }
            }
            
            doc.text(returnStatusText, startX + columnWidths.slice(0, 5).reduce((a, b) => a + b, 0), currentY + 5, { width: columnWidths[5], align: 'center' });
        }
        

        // ในส่วนของการสร้าง PDF
        const startX = 20;
        let startY = 200; 
        const rowHeight = 20;
        const columnWidths = [30, 175, 175, 60, 60, 58];

        drawTableHeader(doc, startX, startY, columnWidths, rowHeight);
        let currentY = startY + rowHeight;

        loanDetails.forEach((loan, index) => {
            if (currentY + rowHeight > doc.page.height - 150) {
                doc.addPage();
                currentY = 50;
                drawTableHeader(doc, startX, currentY, columnWidths, rowHeight);
                currentY += rowHeight;
            }

            drawTableRow(doc, loan, index, startX, currentY, columnWidths, rowHeight);
            currentY += rowHeight;
        });

        // วาดเส้นขอบล่างสุดของตาราง
        doc.moveTo(startX, currentY).lineTo(startX + doc.page.width - 40, currentY).stroke();

        // Signatures
        const signatureY = doc.page.height - 200;
        doc.fontSize(10);
        doc.text('ลงชื่อ', 50, signatureY);
        doc.text('ผู้ยืมครุภัณฑ์', 140, signatureY);
        doc.text('ลงชื่อ', 300, signatureY);
        doc.text('ผู้คืนครุภัณฑ์', 390, signatureY);
        doc.text('  (........................................................)', 50, signatureY + 20);
        doc.text('      วันที่........................................', 50, signatureY + 40);
        doc.text('  (........................................................)', 300, signatureY + 20);
        doc.text('      วันที่........................................', 300, signatureY + 40);

        doc.text('ลงชื่อ', 50, signatureY + 70);
        doc.text('ผู้จ่ายครุภัณฑ์', 140, signatureY + 70);
        doc.text('ลงชื่อ', 300, signatureY + 70);
        doc.text('ผู้รับคืนครุภัณฑ์', 390, signatureY + 70);
        doc.text('  (........................................................)', 50, signatureY + 90);
        doc.text('      วันที่........................................', 50, signatureY + 110);
        doc.text('  (........................................................)', 300, signatureY + 90);
        doc.text('      วันที่........................................', 300, signatureY + 110);

        // Footer
        doc.fontSize(8).text('ปรับปรุงครั้งที่ 2', doc.page.width - 100, doc.page.height - 30, { align: 'right' });

        doc.end();

        // ส่ง PDF กลับไป
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
        fs.createReadStream(filePath).pipe(res);
    } catch (error) {
        console.error('Error generating report:', error);
        res.status(500).json({ message: 'Error generating report' });
    }
});



app.get('/dashboard', authenticateToken, async (req, res) => {
    try {
        // ดึงจำนวนผู้ใช้ทั้งหมด
        const totalUsers = await db.one('SELECT COUNT(user_id) AS total_users FROM users');
        // ดึงจำนวนอุปกรณ์ทั้งหมด
        const totalDevices = await db.one(`
            SELECT COUNT(item_id) AS total_devices
            FROM device_item
            WHERE item_availability = 'ready'
        `);
        // ดึงจำนวนรายการการยืมที่กำลังดำเนินการอยู่
        const totalTransactions = await db.one(`
            SELECT COUNT(loan_id) AS total_transactions
            FROM loan_detail
            WHERE loan_status = 'borrowed' OR loan_status = 'pending' OR loan_status = 'approve'
        `);

        // ดึงข้อมูลการจัดอันดับชุดอุปกรณ์ที่ยืมมากที่สุดจากประวัติทั้งหมด
        const topDevices = await db.any(`
            WITH most_borrowed AS (
                SELECT di.item_name, COUNT(l.item_id) AS borrow_count
                FROM loan_detail l
                JOIN device_item di ON l.item_id = di.item_id
                GROUP BY di.item_name
                ORDER BY borrow_count DESC
            )
            SELECT * FROM most_borrowed
        `);

        // ส่งข้อมูลกลับ
        res.status(200).json({
            total_users: totalUsers.total_users,
            total_devices: totalDevices.total_devices,
            total_transactions: totalTransactions.total_transactions,
            top_devices: topDevices // ข้อมูลการจัดอันดับชุดอุปกรณ์ที่ยืมมากที่สุดจากประวัติทั้งหมด
        });
    } catch (error) {
        console.error('Error fetching dashboard data:', error);
        res.status(500).send({ message: 'Error fetching dashboard data' });
    }
});

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
