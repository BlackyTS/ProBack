const pgp = require('pg-promise')()
const express = require('express')
const app = express()
const bcrypt = require('bcrypt')
const bodyParser = require('body-parser')
const cookieParser = require('cookie-parser')
const jwt = require('jsonwebtoken')
const cors = require('cors')
const multer = require('multer')
const path = require('path')

require('dotenv').config()

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
app.use(cookieParser());

// ตั้งค่า multer สำหรับการอัปโหลดรูปภาพ
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads'); // ที่เก็บไฟล์รูปถ่าย
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + path.extname(file.originalname);
        cb(null, uniqueSuffix); // ตั้งชื่อไฟล์โดยใช้เวลาปัจจุบัน
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

// Register
app.post('/register', async (req, res) => {
    const { email, password, firstname, lastname } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);

    try {
        const result = await db.one('SELECT COALESCE(MAX(user_id), 0) AS max_id FROM users');
        const nextId = result.max_id + 1;

        const existingUser = await db.oneOrNone('SELECT * FROM users WHERE user_email = $1', [email]);
        if (existingUser) {
            return res.status(400).json({ message: 'Email already in use' });
        }
        await db.none(
            'INSERT INTO users(user_id, user_email, user_password, user_firstname, user_lastname) VALUES($1, $2, $3, $4, $5)',
            [nextId, email, hashedPassword, firstname, lastname]
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
        // เพิ่มอุปกรณ์เข้าในตาราง device โดยไม่ต้องระบุ device_id
        const result = await db.one(
            'INSERT INTO device(device_name, device_description, device_limit, device_serial ,device_availability) VALUES($1, $2, $3, $4, $5) RETURNING device_id',
            [name, description, limit, serial, limit]
        );        

        const deviceId = result.device_id;

        // เพิ่มรายการอุปกรณ์ใน device_items
        for (let i = 1; i <= limit; i++) {
            await db.none(
                'INSERT INTO device_item(item_name, item_description, device_id, item_availability, item_serial) VALUES($1, $2, $3, $4, $5)',
                [name, description, deviceId, 'ready' ,`${serial}/${i}`]
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
        res.status(200).json({device,items}); // หรือใช้ device ถ้ามันไม่ใช่อาร์เรย์
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
    const { id } = req.body;  // ดึงค่า id จาก req.body
    if (!id) {
        // ตรวจสอบว่ามี id หรือไม่
        return res.status(400).json({ message: 'ID is required' });
    }
    try {
        const deviceExists = await db.oneOrNone('SELECT 1 FROM device WHERE device_id = $1', [id]);
        if (!deviceExists) {
            // ตรวจสอบว่ามี device ที่ต้องการลบอยู่ในฐานข้อมูลหรือไม่
            return res.status(404).json({ message: 'Device not found' });
        }
        await db.tx(async t => {
            // ลบข้อมูลที่เกี่ยวข้องใน device_item
            await t.none('DELETE FROM device_item WHERE device_id = $1', [id]);
            
            // ลบอุปกรณ์จากตาราง device
            await t.none('DELETE FROM device WHERE device_id = $1', [id]);
        });

        res.status(200).json({ message: 'Device and related items deleted successfully' });
    } catch (error) {
        console.error('ERROR:', error);
        res.status(500).json({ message: 'Error deleting device and related items' });
    }
});

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// ดูคำร้องขอ
app.get('/admin/loan_detail', authenticateToken, async (req,res) => {
    try {
        const requests = await db.any(`
            SELECT r.loan_id, u.user_email, e.item_name, r.loan_status, r.loan_date, r.item_availability_status, r.admin_comment
            FROM loan_detail r
            JOIN users u ON r.user_id = u.user_id
            JOIN device_item e ON r.item_id = e.item_id
            ORDER BY r.loan_date DESC;
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
app.put('/admin/loan_detail/update', authenticateToken, async (req, res) => {
    const { ids, loan_status, admin_comment, location } = req.body;
    let item_availability_status;
    if (loan_status == 'pending') {
        item_availability_status = 'pending';
    } else if (loan_status == 'approve') {
        item_availability_status = 'borrowed';
    } else if (loan_status == 'deny') {
        item_availability_status = 'deny';
    } else {
        item_availability_status = null;  
    }
    try {
        await db.tx(async t => {
            for (const id of ids) {
                const result = await t.result(
                    'UPDATE loan_detail SET loan_status = $1, item_availability_status = $2, admin_comment = $3, location_to_loan = $4 WHERE loan_id = $5',
                    [loan_status, item_availability_status, admin_comment, location, id]
                );

                if (result.rowCount == 0) {
                    return res.status(404).json({ message: `Request with id ${id} not found` });
                }

                if (loan_status == 'approve') {
                    await t.none(
                        'UPDATE device_item SET item_loaning = true, item_availability = $1 WHERE item_id = (SELECT item_id FROM loan_detail WHERE loan_id = $2)',
                        ["borrowed", id]
                    );
                } else if (loan_status == 'pending' || loan_status == 'deny') {
                    await t.none(
                        'UPDATE device_item SET item_loaning = false, item_availability = $1 WHERE item_id = (SELECT item_id FROM loan_detail WHERE loan_id = $2)',
                        ["pending", id]
                    )
                }
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
app.post('/loan', authenticateToken, async (req, res) => {
    const { device_ids, quantities, due_date } = req.body;
    let itemAvailabilityStatus = 'ready'; // ready = 1
    const loan_status = 'pending';
    if (loan_status == 'pending') {
        itemAvailabilityStatus = 'pending'; // pending = 2
    }
    try {
        // ตรวจสอบว่า device_ids และ quantities ถูกต้อง
        if (!Array.isArray(device_ids) || !Array.isArray(quantities) || device_ids.length !== quantities.length) {
            return res.status(400).json({ message: 'Invalid input. device_ids and quantities must be arrays of the same length.' });
        }
        
        // ดึง user_id จาก req.user หลังจากการตรวจสอบ token
        const user_id = req.user.id;
        console.log('User ID:', user_id);

        // เริ่มต้น transaction
        await db.tx(async t => {
            let totalItemQuantity = 0;
            let transaction_loan_id;

            for (let i = 0; i < device_ids.length; i++) {
                const device_id = device_ids[i];
                const quantity = quantities[i];
                totalItemQuantity += quantity;

                // ตรวจสอบว่า quantity ถูกต้อง
                if (quantity <= 0) {
                    return res.status(400).json({ message: `Invalid quantity for device_id ${device_id}.` });
                }

                // ค้นหา item_id ที่พร้อมใช้งาน (ready) สำหรับ device_id ที่ระบุ
                const availableItems = await t.any(
                    'SELECT item_id FROM device_item WHERE device_id = $1 AND item_availability = $2 ORDER BY item_id ASC',
                    [device_id, 'ready']
                );

                // ตรวจสอบว่ามีจำนวน item_id เพียงพอหรือไม่
                if (availableItems.length < quantity) {
                    return res.status(400).json({
                        message: `Not enough items available for device_id ${device_id}. Only ${availableItems.length} items are ready for borrowing.`
                    });
                }

                // เลือก item_id ตามจำนวนที่ต้องการยืม
                const selectedItems = availableItems.slice(0, quantity);

                // อัปเดตสถานะของ item_ids ที่ต้องการยืม
                for (const item of selectedItems) {
                    const item_id = item.item_id;
                    const result = await t.one('SELECT COALESCE(MAX(loan_id), 0) + 1 AS next_id FROM loan_detail');
                    const loan_id = result.next_id;

                    if (!transaction_loan_id) {
                        transaction_loan_id = loan_id;
                    }

                    await t.none(
                        'INSERT INTO loan_detail(loan_id, user_id, device_id, item_id, loan_status, due_date, item_availability_status) VALUES($1, $2, $3, $4, $5, $6, $7)',
                        [loan_id, user_id, device_id, item_id, loan_status, due_date, itemAvailabilityStatus]
                    );

                    // อัปเดตสถานะ item_availability ใน device_item ถ้า loan_status เป็น pending
                    if (loan_status == 'pending') {
                        await t.none(
                            'UPDATE device_item SET item_availability = $1 WHERE item_id = $2',
                            [itemAvailabilityStatus, item_id]
                        );
                    }
                }

                // อัปเดตค่า device_availability ในตาราง device โดยนับจำนวน item_availability ที่มีสถานะ ready
                const updatedAvailability = await t.one(
                    'SELECT COUNT(*) AS ready_count FROM device_item WHERE device_id = $1 AND item_availability = $2',
                    [device_id, 'ready']
                );
                await t.none(
                    'UPDATE device SET device_availability = $1 WHERE device_id = $2',
                    [updatedAvailability.ready_count, device_id]
                );
            }

            // บันทึกข้อมูลลงในตาราง transaction
            await t.none(
                'INSERT INTO transaction(user_id, loan_id, loan_date, due_date, item_quantity) VALUES($1, $2, CURRENT_TIMESTAMP, $3, $4)',
                [user_id, transaction_loan_id, due_date, totalItemQuantity]
            );

            res.status(200).json({ message: 'Loan request processed successfully' });
        });
    } catch (error) {
        console.error('ERROR:', error);
        if (!res.headersSent) {
            res.status(500).json({ message: 'Error processing loan request' });
        }
    }
});

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// ***ฟังก์ชันการคืน***
// user ยืนยันคืน
app.post('/return', authenticateToken, upload.single('device_photo'), async (req, res) => {
    const { return_status, location, comment } = req.body;

    try {
        const user_id = req.user.id;

        if (!req.file) {
            return res.status(400).json({ message: 'Device photo is required' });
        }

        const devicePhotoPath = req.file.path;

        const borrowedItems = await db.any(
            'SELECT item_id FROM loan_detail WHERE user_id = $1 AND return_date IS NULL',
            [user_id]
        );

        if (borrowedItems.length === 0) {
            return res.status(400).json({ message: 'No borrowed items found for this user' });
        }

        await db.tx(async t => {
            for (const item of borrowedItems) {
                const item_id = item.item_id;

                const loanDetail = await t.oneOrNone(
                    'SELECT loan_id FROM loan_detail WHERE item_id = $1 AND return_date IS NULL',
                    [item_id]
                );

                if (!loanDetail) {
                    return res.status(400).json({ message: `No active loan found for item with id ${item_id}` });
                }

                const result = await t.one('SELECT COALESCE(MAX(return_id), 0) AS max_id FROM return_detail');
                const nextId = result.max_id + 1;

                await t.none(
                    'INSERT INTO return_detail(return_id, user_id, item_id, return_status, location_to_return, return_comment, device_photo) VALUES($1, $2, $3, $4, $5, $6, $7)',
                    [nextId, user_id, item_id, return_status, location, comment, devicePhotoPath]
                );

                await t.none(
                    'UPDATE loan_detail SET return_date = CURRENT_DATE WHERE loan_id = $1',
                    [loanDetail.loan_id]
                );

                await t.none(
                    'UPDATE device_item SET item_availability = $1, item_loaning = false WHERE item_id = $2',
                    ['ready', item_id]
                );

                await t.none(
                    'UPDATE loan_detail SET loan_status = $1, item_availability_status = $2 WHERE item_id = $3',
                    ['complete', 'complete', item_id]
                );

                // อัปเดตข้อมูลในตาราง transaction
                await t.none(
                    `UPDATE transaction 
                     SET return_id = $1, return_date = CURRENT_DATE, comment = $2, device_photo = $3 
                     WHERE loan_id = $4 AND user_id = $5`,
                    [nextId, comment, devicePhotoPath, loanDetail.loan_id, user_id]
                );
            }

            await t.none(
                `UPDATE device 
                 SET device_availability = (
                    SELECT COUNT(*) 
                    FROM device_item 
                    WHERE device_id = device.device_id 
                    AND item_availability = 'ready'
                 ) 
                 WHERE device_id IN (
                    SELECT DISTINCT device_id 
                    FROM device_item 
                    WHERE item_id IN (${borrowedItems.map(item => item.item_id).join(',')})
                 )`
            );

            res.status(200).json({ message: 'Return processed successfully' });
        });
    } catch (error) {
        console.error('ERROR:', error);
        if (!res.headersSent) {
            res.status(500).json({ message: 'Error to return devices' });
        }
    }
});
























app.get('/dashboard', authenticateToken, async (req, res) => {
    try {
        // ดึงจำนวนผู้ใช้ทั้งหมด
        const totalUsers = await db.one('SELECT COUNT(user_id) AS total_users FROM users');
        // ดึงจำนวนอุปกรณ์ทั้งหมด
        const totalDevices = await db.one('SELECT COUNT(item_id) AS total_devices FROM device_item');
        // ดึงข้อมูลการยืมอุปกรณ์
        // const loanDetails = await db.any(`
        //     SELECT device_name, COUNT(loan_detail.device_id) AS borrow_count
        //     FROM loan_detail
        //     JOIN device_items ON loan_detail.device_id = device_items.item_id
        //     GROUP BY device_name
        //     ORDER BY borrow_count DESC
        //     LIMIT 10
        // `);

        // ส่งข้อมูลกลับ
        res.status(200).json({
            total_users: totalUsers.total_users,
            total_devices: totalDevices.total_devices,
            // loan_details: loanDetails
        });
    } catch (error) {
        console.error('Error fetching dashboard data:', error);
        res.status(500).send({ message: 'Error fetching dashboard data' });
    }
});

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
