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

// การเพิ่มชุดอุปกรณ์ใหม่ (สำหรับadmin)
app.post('/devices/add', authenticateToken, async (req, res) => {
    const { id, name, description, limit } = req.body;
    try {
        await db.none('INSERT INTO device(device_id, device_name, device_description, device_limit, device_availability) VALUES($1, $2, $3, $4, $5)', [id, name, description, limit, limit]);
        res.status(200).json({ message : 'Device added successfully' });
    } catch (error) {
        console.error('ERROR:', error);
        res.status(500).json({ message : 'Error adding device' });
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
    const { id, name, approve, limit} = req.body;
    try {
        // ดึงค่า limit และ availability ปัจจุบันจากฐานข้อมูล
        const device = await db.one('SELECT device_limit, device_availability FROM device WHERE device_id = $1', [id]);

        // คำนวณความแตกต่างของค่า limit
        const limitDifference = limit - device.device_limit;

        await db.none('UPDATE device SET device_name = $1, device_approve = $2, device_limit = $3, device_availability = device_availability + $4 WHERE device_id = $5',
        [name, approve, limit, limitDifference, id]);

        res.status(200).json({ massge: 'Device updated successfully'});
    } catch (error) {
        console.error('ERROR:', error);
        res.status(500).json({ message: 'Error updating device'});
    }
});

// ลบชุดอุปกรณ์
app.delete('/device/delete', authenticateToken, async (req, res) => {
    const { id } = req.body; // รับค่า id จาก body ของคำขอ
    try {
        const result = await db.query('DELETE FROM device WHERE device_id = $1 RETURNING *', [id]);       
        res.status(200).json({ message: 'Device deleted successfully' });
    } catch (error) {
        console.error('ERROR:', error);
        res.status(500).json({ message: 'Error deleting device' });
    }
});
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// เพิ่มอุปกรณ์แต่ละตัว
app.post('/device/each-item/add', authenticateToken, async (req, res) => {
    const { id, name, type, description, device_id } = req.body;

    try {
        // Get the device limit
        const deviceLimitResult = await db.one('SELECT device_limit FROM device WHERE device_id = $1', [device_id]);
        const deviceLimit = deviceLimitResult.device_limit;

        // Get the count of items with the specified type
        const itemCountResult = await db.one('SELECT COUNT(*) AS item_count FROM each_device WHERE device_id = $1 AND item_type = $2', [device_id, type]);
        const itemCount = itemCountResult.item_count;

        if (itemCount >= deviceLimit) {
            return res.status(400).json({ message: `Cannot add more items. The limit for type ${type} has been reached.` });
        }

        // Insert the new item
        await db.none('INSERT INTO each_device(item_id, item_name, item_type, item_description, device_id) VALUES($1, $2, $3, $4, $5)', [id, name, type, description, device_id]);

        res.status(200).json({ message: `Item for type ${type} added successfully.` });
    } catch (error) {
        console.error('ERROR:', error);
        res.status(500).json({ message: 'Error adding item.' });
    }
});

// เช็คอุปกรณ์ที่เพิ่มมาทั้งหมด
app.get('/device/each-item', authenticateToken, async (req, res) => {
    try {
        const items = await db.any('SELECT * FROM each_device');
        res.status(200).json(items);
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
    const { id, name, type, description } = req.body;  
    try {
        await db.none('UPDATE each_device SET item_name = $1, item_type = $2, item_description = $3 WHERE item_id = $4',[name, type, description, id]);
        res.status(200).json({ message: `Items updated successfully.` });
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













// Dashborad
app.get('/dashboard', authenticateToken, async (req, res) => {
    try {
        const data = [];
        const datau = await db.one('SELECT COUNT(user_id) AS total_users FROM users');
        const datal = await db.one('SELECT COUNT(device_id) AS total_devices FROM device');
        const loanDetails = await db.any('SELECT device_name, COUNT(loan_detail.device_id) AS borrow_count FROM loan_detail JOIN device ON loan_detail.device_id = device.device_id GROUP BY device_name ORDER BY borrow_count DESC LIMIT 10');
        
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
