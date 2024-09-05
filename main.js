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
    const token = req.cookies['token'];
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

app.get('/', (req,res)=> {
    res.send('Welcome to Back-end')
})

// Register
app.post('/register', async (req, res) => {
    const { email, password, firstname, lastname, phone } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    console.log(req.body)
    try {
        const existingUser = await db.oneOrNone('SELECT * FROM users WHERE user_email = $1', [email]);

        if (existingUser) {
            return res.status(400).json({ message: 'Email already in use' });
        }
        await db.none(
            'INSERT INTO users( user_email, user_password, user_firstname, user_lastname, user_phone) VALUES($1, $2, $3, $4, $5)',
            [email, hashedPassword, firstname, lastname, phone]
        );
       
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
                console.log(token)
                res.cookie('token', token, { maxAge: 72*60*60*1000, httpOnly: true, secure: true, sameSite: 'none' });
                res.status(200).json({ 
                    type: "ok",
                    message: 'Logged in successfully',
                    role: user.user_role,
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
app.delete('/delete', authenticateToken, async (req, res) => {
    const { id } = req.body;
    try {
        const result = await db.query('DELETE FROM users WHERE user_id = $1 RETURNING *', [id]);       
        res.status(200).json({ message: 'User deleted successfully' });
    } catch (error) {
        console.error('ERROR:', error);
        res.status(500).json({ message: 'Error deleting user' });
    }
})
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// การเพิ่มชุดอุปกรณ์ใหม่
app.post('/devices/add', authenticateToken, async (req, res) => {
    const { name, description, limit, serial } = req.body;
    try {
        // เพิ่มข้อมูลอุปกรณ์ใหม่
        const result = await db.one(
            'INSERT INTO device(device_name, device_description, device_limit, device_serial, device_availability) VALUES($1, $2, $3, $4, $5) RETURNING device_id',
            [name, description, limit, serial, limit]
        );

        const deviceId = result.device_id;

        // สร้างโฟลเดอร์สำหรับ QR Code ในโฟลเดอร์ qrcodes
        const qrCodeDir = path.join(__dirname, 'qrcodes', serial);
        if (!fs.existsSync(qrCodeDir)) {
            fs.mkdirSync(qrCodeDir, { recursive: true });
        }

        for (let i = 1; i <= limit; i++) {
            const itemSerial = `${serial}/${i}`;
            const qrCodeData = `${itemSerial}`; // ข้อมูลที่ใช้ใน QR Code
            
            // สร้าง QR Code และบันทึกเป็นไฟล์
            const qrCodeFileName = `${serial}-${i}.png`; // ใช้เพียงเลขลำดับเป็นชื่อไฟล์
            const qrCodeFilePath = path.join(qrCodeDir, qrCodeFileName);
            await QRCode.toFile(qrCodeFilePath, qrCodeData);

            // อ่านไฟล์ QR Code เป็น base64
            const qrCodeBase64 = fs.readFileSync(qrCodeFilePath, { encoding: 'base64' });
            const qrCodeUrl = `data:image/png;base64,${qrCodeBase64}`;

            // เพิ่มข้อมูลลงในตาราง device_item
            await db.none(
                'INSERT INTO device_item(item_name, item_description, device_id, item_availability, item_serial, item_qrcode) VALUES($1, $2, $3, $4, $5, $6)',
                [name, description, deviceId, 'ready', itemSerial, qrCodeUrl]
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
        // ตรวจสอบว่ามีผลลัพธ์หรือไม่
        if (!device) {
            return res.status(404).json({ massge: 'Device not found' });
        }
        const items = await db.any('SELECT * FROM device_item WHERE device_id = $1',[id])
        // ส่งข้อมูลอุปกรณ์กลับไปยังผู้ใช้
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
        // ดึงข้อมูลปัจจุบันของอุปกรณ์จากฐานข้อมูล
        const device = await db.one('SELECT device_limit, device_availability, device_serial FROM device WHERE device_id = $1', [id]);

        // คำนวณความแตกต่างของ limit
        const limitDifference = limit - device.device_limit;

        // อัพเดตค่า limit, availability, approve, และ description ในตาราง device
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
            // หาลิสต์ item_ids ที่จะถูกลบ
            const itemsToDelete = await db.any(
                'SELECT item_id FROM device_item WHERE device_id = $1 AND item_id > $2 ORDER BY item_id DESC LIMIT $3',
                [id, limit, -limitDifference]
            );

            for (const item of itemsToDelete) {
                await db.none('DELETE FROM device_item WHERE item_id = $1', [item.item_id]);
            }
        }

        res.status(200).json({ message: 'Device updated successfully' });
    } catch (error) {
        console.error('ERROR:', error);
        res.status(500).json({ message: 'Error updating device' });
    }
});

// ลบชุดอุปกรณ์
app.delete('/devices/delete', authenticateToken, async (req, res) => {
    const { id } = req.body;
    if (!id) {
        // ตรวจสอบว่ามี id หรือไม่
        return res.status(400).json({ message: 'ID is required' });
    }
    try {
        const user_id = req.user.id;
        console.log('User ID:', user_id);
        const user_role = req.user.role;

        // ตรวจสอบว่าผู้ใช้มีบทบาทเป็น admin หรือไม่
        if (user_role != 2) {
            return res.status(403).json({ message: 'Forbidden: Only admins can delete devices' });
        }

        const device = await db.oneOrNone('SELECT device_serial FROM device WHERE device_id = $1', [id]);
        if (!device) {
            // ตรวจสอบว่ามี device ที่ต้องการลบอยู่ในฐานข้อมูลหรือไม่
            return res.status(404).json({ message: 'Device not found' });
        }

        const serial = device.device_serial;

        await db.tx(async t => {
            await t.none('DELETE FROM device_item WHERE device_id = $1', [id]);
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

        //upadate สถานะใหม่
        const result = await db.result(`
            UPDATE device_item
            SET item_availability = $1
            WHERE item_id = $2
        `, [item_availability, item_id]);

        if (result.rowCount == 0) {
            return res.status(404).json({ message: 'Item not found or no change in availability status' });
        }

        // ตรวจว่าready หรือไม่
        if (oldItem.item_availability == 'ready' && item_availability != 'ready') {
            await db.none(`
                UPDATE device
                SET device_availability = device_availability - 1
                WHERE device_id = $1
            `, [oldItem.device_id]);
        } else if (oldItem.item_availability != 'ready' && item_availability == 'ready') {
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

        if (requests.length === 0) {
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
            SELECT t.user_id, t.transaction_id, u.user_firstname, u.user_email, t.loan_date, t.due_date, t.item_quantity, ld.loan_status
            FROM transaction t
            JOIN users u ON t.user_id = u.user_id
            LEFT JOIN loan_detail ld ON t.transaction_id = ld.transaction_id
            ORDER BY t.loan_date DESC;
        `);

        if (requests.length == 0) {
            return res.status(404).json({ message: 'No transactions found' });
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
        // Group the results by user_id and transaction_id and aggregate item_ids
        const groupedRequests = requests.reduce((acc, curr) => {
            const existingRequest = acc.find(req => req.user_id === curr.user_id && req.transaction_id === curr.transaction_id);
            if (existingRequest) {
                existingRequest.item_ids.push(curr.item_id); // Aggregate item_ids
                existingRequest.loan_status = curr.loan_status; // Update loan_status
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
                    item_ids: [curr.item_id] // Initialize item_ids array
                });
            }
            return acc;
        }, []);
        // Optionally, you can convert item_ids to a string if needed
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

        // Group the results by user_id and transaction_id and aggregate item_ids
        const groupedRequests = requests.reduce((acc, curr) => {
            const existingRequest = acc.find(req => req.user_id == curr.user_id && req.transaction_id == curr.transaction_id);
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

        // Optionally, you can convert item_ids to a string if needed
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
            SELECT t.user_id, t.transaction_id, u.user_firstname, u.user_email, t.loan_date, t.due_date, t.item_quantity, ld.loan_status, ld.item_id
            FROM transaction t
            JOIN users u ON t.user_id = u.user_id
            LEFT JOIN loan_detail ld ON t.transaction_id = ld.transaction_id
            WHERE ld.loan_status = 'deny'
            ORDER BY t.loan_date DESC;
        `);
        // Group the results by user_id and transaction_id and aggregate item_ids
        const groupedRequests = requests.reduce((acc, curr) => {
            const existingRequest = acc.find(req => req.user_id == curr.user_id && req.transaction_id == curr.transaction_id);
            if (existingRequest) {
                existingRequest.item_ids.push(curr.item_id); // Aggregate item_ids
                existingRequest.loan_status = curr.loan_status; // Update loan_status
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
                    item_ids: [curr.item_id] // Initialize item_ids array
                });
            }
            return acc;
        }, []);
        // Optionally, you can convert item_ids to a string if needed
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
        // Group the results by user_id and transaction_id and aggregate item_ids
        const groupedRequests = requests.reduce((acc, curr) => {
            const existingRequest = acc.find(req => req.user_id == curr.user_id && req.transaction_id == curr.transaction_id);
            if (existingRequest) {
                existingRequest.item_ids.push(curr.item_id); // Aggregate item_ids
                existingRequest.loan_status = curr.loan_status; // Update loan_status
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
                    item_ids: [curr.item_id] // Initialize item_ids array
                });
            }
            return acc;
        }, []);
        // Optionally, you can convert item_ids to a string if needed
        groupedRequests.forEach(req => req.item_ids = req.item_ids.join(','));

        res.status(200).json(groupedRequests);
    } catch (error) {
        console.error('ERROR:', error);
        res.status(500).json({ message: 'Error fetching transactions' });
    }
});

// ยืนยันและแก้ไขคำร้องขอ
app.put('/admin/loan_detail/update', authenticateToken, async (req, res) => {
    const { transaction_id, loan_status, admin_comment, location } = req.body;
    let item_availability_status;

    if (loan_status == 'pending') {
        item_availability_status = 'pending';
    } else if (loan_status == 'approve') {
        item_availability_status = 'borrowed';
    } else if (loan_status == 'deny') {
        item_availability_status = 'ready';
    } else {
        item_availability_status = null;
    }

    try {
        await db.tx(async t => {
            // ดึงข้อมูลของ user_id ที่เกี่ยวข้องกับ transaction_id
            const transaction = await t.oneOrNone(
                'SELECT user_id FROM transaction WHERE transaction_id = $1',
                [transaction_id]
            );

            if (!transaction) {
                return res.status(404).json({ message: `Transaction with id ${transaction_id} not found` });
            }

            const user_id = transaction.user_id;

            // ดึงรายการ item_id จาก loan_detail โดยอ้างอิงจาก transaction_id
            const items = await t.any(
                'SELECT item_id, device_id FROM loan_detail WHERE user_id = $1 AND return_date IS NULL AND transaction_id = $2',
                [user_id, transaction_id]
            );

            if (items.length == 0) {
                return res.status(404).json({ message: `No loan details found for transaction_id ${transaction_id}` });
            }

            // อัพเดทข้อมูลใน loan_detail
            const result = await t.result(
                'UPDATE loan_detail SET loan_status = $1, item_availability_status = $2, admin_comment = $3, location_to_loan = $4 WHERE transaction_id = $5',
                [loan_status, item_availability_status, admin_comment, location, transaction_id]
            );

            if (result.rowCount == 0) {
                return res.status(404).json({ message: `No loan details updated for transaction_id ${transaction_id}` });
            }

            // อัพเดทค่า loan_status ในตาราง transaction
            await t.none(
                'UPDATE transaction SET loan_status = $1 WHERE transaction_id = $2',
                [loan_status, transaction_id]
            );

            // อัพเดทข้อมูลใน device_item ตามเงื่อนไข
            const itemIds = items.map(item => item.item_id);
            const deviceIds = items.map(item => item.device_id);

            if (loan_status == 'approve') {
                await t.none(
                    'UPDATE device_item SET item_loaning = true, item_availability = $1 WHERE item_id = ANY($2::int[])',
                    ["borrowed", itemIds]
                );
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

                // เพิ่มจำนวน device_availability ในตาราง device
                await t.none(
                    'UPDATE device SET device_availability = device_availability + 1 WHERE device_id = ANY($1::int[])',
                    [deviceIds]
                );
            }
        });

        res.status(200).json({ message: 'Requests updated successfully' });
    } catch (error) {
        console.error('ERROR:', error);
        res.status(500).json({ message: 'Error updating requests' });
    }
});


//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// ***ฟังก์ชัน การยืม***
// user ขอคำร้องยืนยันการยืม
const { sendLineNotify } = require('./Function/nontify');
app.post('/loan', authenticateToken, async (req, res) => {
    const { devices, due_date } = req.body;
    let itemAvailabilityStatus = 'ready';
    const loan_status = 'pending';

    if (loan_status === 'pending') {
        itemAvailabilityStatus = 'pending';
    }

    try {
        if (!Array.isArray(devices) || devices.length === 0) {
            return res.status(400).json({ message: 'Invalid selection. Please provide at least one device.' });
        }

        const user_id = req.user.id;
        console.log('User ID:', user_id);

        const loan_date = new Date();
        const cancelable_until = new Date(loan_date.getTime() + 12 * 60 * 60 * 1000); // 12 ชั่วโมงถัดไป

        await db.tx(async t => {
            let totalItemQuantity = 0;

            // รับค่า transaction_id สูงสุดจากฐานข้อมูล
            const maxTransaction = await t.one('SELECT COALESCE(MAX(transaction_id), 0) AS max_id FROM transaction');
            const nextTransactionId = maxTransaction.max_id + 1;

            // สร้าง serial number สำหรับ transaction
            const serialNumber = `TRANS-${nextTransactionId}-${Date.now()}`;

            // บันทึกข้อมูลลงในตาราง transaction
            await t.none(
                'INSERT INTO transaction(transaction_id, user_id, loan_date, due_date, item_quantity, loan_status, transaction_qrcode) VALUES($1, $2, $3, $4, $5, $6, $7)',
                [nextTransactionId, user_id, loan_date, due_date, totalItemQuantity, loan_status, serialNumber]
            );

            // รับค่า loan_id สูงสุดจากฐานข้อมูล
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

            res.status(200).json({ message: 'Loan request processed successfully', transactionId: nextTransactionId, serialNumber: serialNumber });

            // ส่งการแจ้งเตือนผ่าน Line Notify
            const notifyMessage = `มีการขอยืมอุปกรณ์ใหม่แล้ว. User ID: ${user_id}, จำนวนรวม: ${totalItemQuantity}`;
            await sendLineNotify(notifyMessage);
        });
    } catch (error) {
        console.error('ERROR:', error);
        if (!res.headersSent) {
            res.status(500).json({ message: 'Error processing loan request' });
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

        if (loanDetails.length === 0) {
            return res.status(404).json({ message: 'No loans found for this transaction or not authorized.' });
        }

        // ตรวจสอบสถานะการยืมในตาราง loan_detail
        const loanStatuses = await db.any(
            'SELECT DISTINCT loan_status FROM loan_detail WHERE transaction_id = $1',
            [transaction_id]
        );

        const hasBeenCancelled = loanStatuses.some(status => status.loan_status === 'cancel');

        if (hasBeenCancelled) {
            return res.status(400).json({ message: 'Loan has already been canceled.' });
        }

        // ดึงข้อมูลการยืมแรกสุดเพื่อคำนวณ cancelable_until
        const firstLoanDetail = loanDetails[0];
        const cancelableUntil = new Date(firstLoanDetail.loan_date.getTime() + 12 * 60 * 60 * 1000); // 12 ชั่วโมงถัดไป

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

            // อัปเดตสถานะของอุปกรณ์ในตาราง device
            await t.any(
                'UPDATE device SET device_availability = (SELECT COUNT(*) FROM device_item WHERE device_id = device.device_id AND item_availability = $1) WHERE device_id IN (SELECT device_id FROM loan_detail WHERE transaction_id = $2)',
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

            res.status(200).json({ message: 'Loan canceled successfully.' });

            // ส่งการแจ้งเตือนการยกเลิกผ่าน Line Notify
            const notifyMessage = `การยืมอุปกรณ์ถูกยกเลิกแล้ว. Transaction ID: ${transaction_id}, User ID: ${user_id}`;
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
        // Group the results by user_id and transaction_id and aggregate item_ids
        const groupedRequests = requests.reduce((acc, curr) => {
            const existingRequest = acc.find(req => req.user_id == curr.user_id && req.transaction_id == curr.transaction_id);
            if (existingRequest) {
                existingRequest.item_ids.push(curr.item_id); // Aggregate item_ids
                existingRequest.loan_status = curr.loan_status; // Update loan_status
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
                    item_ids: [curr.item_id] // Initialize item_ids array
                });
            }
            return acc;
        }, []);

        // Optionally, you can convert item_ids to a string if needed
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
    let finalPhotoPath;

    try {
        const user_id = req.user.id;
        console.log('Request body:', req.body);
        console.log('File info:', req.file);

        // แปลง items จากสตริง JSON เป็นออบเจ็กต์ JavaScript
        items = req.body.items ? JSON.parse(req.body.items) : [];
        tempPhotoPath = req.file ? req.file.path : null; // path ของไฟล์ชั่วคราว

        if (!items || !Array.isArray(items) || items.length === 0) {
            // ถ้าไม่มีรายการคืน
            if (tempPhotoPath) {
                fs.unlinkSync(tempPhotoPath); // ลบไฟล์ชั่วคราวถ้าไม่มีรายการคืน
            }
            return res.status(400).json({ message: 'Please provide a list of items to return.' });
        }

        // ตรวจสอบรายการที่ยืมไว้โดย user
        const borrowedTransactions = await db.any(
            `SELECT item_id
             FROM loan_detail
             WHERE user_id = $1
             AND return_date IS NULL`,
            [user_id]
        );

        const borrowedItemIds = borrowedTransactions.map(tx => tx.item_id);

        for (const item of items) {
            if (!borrowedItemIds.includes(item.item_id)) {
                // ถ้ารายการคืนไม่ถูกต้อง
                if (tempPhotoPath) {
                    fs.unlinkSync(tempPhotoPath); // ลบไฟล์ชั่วคราวถ้าไม่ถูกต้อง
                }
                return res.status(400).json({ message: `Item ${item.item_id} was not borrowed by this user or has already been returned.` });
            }
        }

        const returnDate = new Date();

        await db.tx(async t => {
            let deviceUpdates = new Map();

            for (const { item_id, return_status } of items) {
                // ค้นหา transaction_id สำหรับรายการที่คืน
                const transactions = await t.any(
                    'SELECT transaction_id FROM loan_detail WHERE user_id = $1 AND item_id = $2 AND return_date IS NULL',
                    [user_id, item_id]
                );

                if (transactions.length === 0) {
                    if (tempPhotoPath) {
                        fs.unlinkSync(tempPhotoPath); // ลบไฟล์ชั่วคราวถ้าไม่พบ transaction_id
                    }
                    return res.status(400).json({ message: `Item ${item_id} does not have an active loan.` });
                }

                // ใช้ transaction_id แรกที่พบ
                const transaction_id = transactions[0].transaction_id;

                // หา return_id สูงสุด
                const result = await t.one('SELECT COALESCE(MAX(return_id), 0) AS max_id FROM return_detail');
                const nextId = result.max_id + 1;

                // บันทึกข้อมูลลงในตาราง return_detail
                await t.none(
                    'INSERT INTO return_detail(return_id, user_id, item_id, return_status, device_photo, return_date, transaction_id) VALUES($1, $2, $3, $4, $5, $6, $7)',
                    [nextId, user_id, item_id, return_status, tempPhotoPath ? finalPhotoPath : null, returnDate, transaction_id]
                );

                // อัปเดตสถานะคืนใน loan_detail
                await t.none(
                    'UPDATE loan_detail SET return_date = $1, loan_status = $2, item_availability_status = $3 WHERE user_id = $4 AND item_id = $5 AND return_date IS NULL',
                    [returnDate, 'complete', 'complete', user_id, item_id]
                );

                // อัปเดตสถานะของ item ใน device_item
                await t.none(
                    'UPDATE device_item SET item_availability = $1, item_loaning = false WHERE item_id = $2',
                    ['ready', item_id]
                );

                // อัปเดตข้อมูลในตาราง transaction
                await t.none(
                    'UPDATE transaction SET return_date = $1, device_photo = $2, loan_status = $3 WHERE transaction_id = $4',
                    [returnDate, tempPhotoPath ? finalPhotoPath : null, 'complete', transaction_id]
                );

                // ค้นหาค่า device_id สำหรับ item_id
                const { device_id } = await t.one(
                    'SELECT device_id FROM device_item WHERE item_id = $1',
                    [item_id]
                );

                if (!deviceUpdates.has(device_id)) {
                    deviceUpdates.set(device_id, 0);
                }

                deviceUpdates.set(device_id, deviceUpdates.get(device_id) + 1);
            }

            // อัปเดตจำนวนอุปกรณ์ที่คืนในตาราง device
            for (const [device_id, returnedCount] of deviceUpdates) {
                await t.none(
                    'UPDATE device SET device_availability = device_availability + $1 WHERE device_id = $2',
                    [returnedCount, device_id]
                );
            }

            // ถ้าทุกอย่างสำเร็จ, ย้ายไฟล์จากตำแหน่งชั่วคราวไปยังตำแหน่งสุดท้าย
            if (tempPhotoPath) {
                finalPhotoPath = path.join('uploads', path.basename(tempPhotoPath));
                fs.renameSync(tempPhotoPath, finalPhotoPath);
            }

            res.status(200).json({ message: 'Return processed successfully.' });
        });
    } catch (error) {
        console.error('ERROR:', error);
        if (tempPhotoPath && fs.existsSync(tempPhotoPath)) {
            fs.unlinkSync(tempPhotoPath); // ลบไฟล์ชั่วคราวถ้าเกิดข้อผิดพลาด
        }
        if (!res.headersSent) {
            res.status(500).json({ message: 'Error processing return' });
        }
    }
});

// ดูข้อมูลใน qr-code
app.get('/return-data', async (req, res) => {
    const data = req.query.data;

    try {
        // ตรวจสอบว่ามีข้อมูลจาก QR code หรือไม่
        if (!data) {
            return res.status(400).json({ message: 'ไม่มีข้อมูลจาก QR code' });
        }

        // เรียกฟังก์ชัน POST '/return' ด้วยข้อมูลจาก QR code
        const response = await fetch('https://079c-2001-fb1-10b-d0e-d489-ee88-a2b4-bc6b.ngrok-free.app/return-qr', { // เปลี่ยน URL ให้ตรงกับเส้นทางที่ต้องการเรียก
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
app.post('/scan-transaction', async (req, res) => {
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

        if (!loanDetails || loanDetails.length === 0) {
            return res.status(400).json({ message: 'ไม่พบรายการยืมใด ๆ สำหรับ transaction_id นี้.' });
        }

        // ตรวจสอบว่ามีรายการยืมที่ยังไม่ถูกคืนหรือไม่ (return_date IS NULL)
        const unreturnedItems = loanDetails.filter(item => item.return_date === null);

        if (unreturnedItems.length === 0) {
            return res.status(200).json({ message: 'รายการทั้งหมดได้ทำการคืนแล้ว.' });
        }

        res.status(200).json({ 
            message: 'พบรายการยืม กรุณาสแกน item_id ที่ต้องการคืน.',
            items: unreturnedItems // ส่งข้อมูล item_id ที่ยังไม่ได้คืนไปที่หน้าถัดไป
        });
    } catch (error) {
        console.error('เกิดข้อผิดพลาดในการดึงรายการยืม:', error);
        res.status(500).json({ message: 'เกิดข้อผิดพลาดในการดึงรายการยืม.' });
    }
});
// สแกนตาม item_id ใน transaction_id นั้นๆ
app.post('/scan-item', async (req, res) => {
    const { transaction_id, item_ids } = req.body;

    try {
        if (!transaction_id || !item_ids || !Array.isArray(item_ids) || item_ids.length === 0) {
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
            SELECT DISTINCT 
                t.user_id,
                t.transaction_id,
                u.user_firstname,
                u.user_email,
                t.loan_date,
                t.due_date,
                t.return_date,
                t.item_quantity,
                r.return_status
            FROM transaction t
            JOIN users u ON t.user_id = u.user_id
            LEFT JOIN return_detail r ON t.transaction_id = r.transaction_id
            WHERE r.return_status = 'complete'
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
                r.return_id,
                di.item_name,
                di.item_serial,
                t.user_id,
                u.user_email,
                t.loan_date,
                t.due_date,
                t.return_date,
                ls.item_availability_status,
                r.return_status,
                r.item_id
            FROM return_detail r
            JOIN transaction t ON r.transaction_id = t.transaction_id
            JOIN device_item di ON r.item_id = di.item_id
            JOIN users u ON t.user_id = u.user_id
            JOIN loan_detail ls ON t.transaction_id = ls.transaction_id
            WHERE t.user_id = $1
            AND t.transaction_id = $2
            ORDER BY t.loan_date DESC, t.return_date DESC
        `, [user_id, transaction_id]);

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

        if (requests.length === 0) {
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
            SELECT
                ROW_NUMBER() OVER (ORDER BY ld.transaction_id) AS transaction_id,
                ld.user_id,
                ld.loan_date,
                ld.return_date,
                COUNT(di.item_id) AS item_quantity,
                STRING_AGG(di.item_serial, ', ') AS device_serial,
                ld.loan_status AS transaction_status
            FROM loan_detail ld
            JOIN device_item di ON ld.item_id = di.item_id
            GROUP BY ld.transaction_id, ld.user_id, ld.loan_date, ld.return_date, ld.loan_status
            ORDER BY transaction_id
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

// ฟังก์ชันดึงข้อมูลอุปกรณ์ทั้งหมด
async function getDeviceData() {
    try {
        const result = await db.query(`
            SELECT
                item_serial,
                item_availability
            FROM device_item
        `);
        if (result && result.length > 0) {
            console.log('Device Data Query Result:', result);
            return result;
        } else {
            console.log('No device data found.');
            return [];
        }
    } catch (error) {
        console.error('Error fetching device data:', error);
        throw error;
    }
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

async function generateReport() {
    try {
        const workbook = new ExcelJS.Workbook();

        // หน้า 1: ข้อมูลรายการยืม-คืน
        const worksheet1 = workbook.addWorksheet('Loan and Return Summary');
        worksheet1.columns = [
            { header: 'Transaction ID', key: 'transaction_id', width: 20 },
            { header: 'User ID', key: 'user_id', width: 20 },
            { header: 'Loan Date', key: 'loan_date', width: 20 },
            { header: 'Return Date', key: 'return_date', width: 20 },
            { header: 'Item Quantity', key: 'item_quantity', width: 15 },
            { header: 'Transaction Status', key: 'transaction_status', width: 20 },
            { header: 'Device Serial', key: 'device_serial', width: 110 }          
        ];

        worksheet1.getRow(1).font = { bold: true };
        worksheet1.getRow(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFD3D3D3' }
        };

        const loanReturnData = await getLoanReturnData();
        console.log('Loan Return Data:', loanReturnData);

        let totalItemQuantity = 0;
        if (loanReturnData.length > 0) {
            loanReturnData.forEach(record => {
                worksheet1.addRow({
                    transaction_id: record.transaction_id,
                    user_id: record.user_id,
                    loan_date: record.loan_date ? new Date(record.loan_date).toLocaleDateString('th-TH') : 'N/A',
                    return_date: record.return_date ? new Date(record.return_date).toLocaleDateString('th-TH') : 'N/A',
                    item_quantity: record.item_quantity,
                    device_serial: record.device_serial,
                    transaction_status: record.transaction_status
                });
                totalItemQuantity += parseInt(record.item_quantity) || 0;
            });
            worksheet1.addRow({
                transaction_id: 'Total',
                item_quantity: totalItemQuantity
            }).font = { bold: true };
        } else {
            worksheet1.addRow(['No loan/return data available']);
        }

        // หน้า 2: ข้อมูลอุปกรณ์ทั้งหมด
        const worksheet2 = workbook.addWorksheet('Device Information');
        worksheet2.columns = [
            { header: 'Item Serial', key: 'item_serial', width: 30 },
            { header: 'Item Availability', key: 'item_availability', width: 20 }
        ];

        worksheet2.getRow(1).font = { bold: true };
        worksheet2.getRow(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFD3D3D3' }
        };

        const deviceData = await getDeviceData();
        console.log('Device Data:', deviceData);

        if (deviceData.length > 0) {
            deviceData.forEach(record => {
                worksheet2.addRow({
                    item_serial: record.item_serial,
                    item_availability: record.item_availability
                });
            });

            const summary = await getDeviceSummary();
            console.log('Device Summary:', summary);

            worksheet2.addRow({ item_serial: 'Total Items', item_availability: summary.total_items }).font = { bold: true };
            worksheet2.addRow({ item_serial: 'Total Ready', item_availability: summary.ready }).font = { bold: true };
            worksheet2.addRow({ item_serial: 'Total Broken', item_availability: summary.broken }).font = { bold: true };
            worksheet2.addRow({ item_serial: 'Total Lost', item_availability: summary.lost }).font = { bold: true };
        } else {
            worksheet2.addRow(['No device data available']);
        }

        const today = new Date();
        const dateStr = today.toLocaleDateString('th-TH').split('/').join('-');
        const fileName = `summary_report_${dateStr}.xlsx`;
        const filePath = path.join(__dirname, 'report', fileName);

        console.log('Saving file to:', filePath);

        await workbook.xlsx.writeFile(filePath);
        console.log('File saved successfully');

        return filePath;

    } catch (error) {
        console.error('Error generating report:', error);
        throw error;
    }
}
// Route สำหรับดาวน์โหลดรายงาน
app.get('/report/download', async (req, res) => {
    try {
        await testDatabase(); // ทดสอบการเชื่อมต่อฐานข้อมูล

        const filePath = await generateReport();
        res.download(filePath, err => {
            if (err) {
                console.error('Error downloading file:', err);
                res.status(500).send('Failed to download file.');
            }
        });
    } catch (error) {
        console.error('Failed to generate report:', error);
        res.status(500).send('Failed to generate report.');
    }
});










app.get('/dashboard', authenticateToken, async (req, res) => {
    try {
        // ดึงจำนวนผู้ใช้ทั้งหมด
        const totalUsers = await db.one('SELECT COUNT(user_id) AS total_users FROM users');
        // ดึงจำนวนอุปกรณ์ทั้งหมด
        const totalDevices = await db.one('SELECT COUNT(item_id) AS total_devices FROM device_item');
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
