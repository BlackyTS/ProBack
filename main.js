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

// ฟังก์ชัน Middleware สำหรับการตรวจสอบสิทธิ์ของผู้ใช้
const authorizeRole = (roles) => {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return res.sendStatus(403);
        }
        next();
    };
};

// Register
app.post('/register', async (req, res) => {
    const { email, password, firstname, lastname, role } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);

    try {
        const existingUser = await db.oneOrNone('SELECT * FROM users WHERE user_email = $1', [email]);
        if (existingUser) {
            return res.status(400).send('Email already in use');
        }
        await db.none('INSERT INTO users(user_email, user_password, user_firstname, user_lastname, role_user) VALUES($1, $2, $3, $4, $5)', [email, hashedPassword, firstname, lastname, role]);
        res.status(200).send('User registered successfully');
    } catch (error) {
        console.error('ERROR:', error);
        res.status(500).send('Error registering user');
    }
});

// Login
app.post('/login', (req, res) => {
    const { email, password } = req.body;

    db.oneOrNone('SELECT * FROM users WHERE user_email = $1', [email])
        .then(async user => {
            if (!user) {
                return res.status(400).send({ message: 'Invalid email or password' });
            }
            const match = await bcrypt.compare(password, user.user_password);
            if (match) {
                const token = generateToken(user);
                res.cookie('token', token, { maxAge: 72*60*60*1000, httpOnly: true, secure: true, sameSite: 'none' }); // ตั้งค่า cookie สำหรับ JWT token
                let isAdmin
                if (user.user_role === 'admin')
                    isAdmin = true
                else
                    isAdmin = false
                res.status(200).json({ 
                    type: "ok",
                    message: 'Logged in successfully',
                    isAdmin: isAdmin
                });
            } else {
                res.status(400).send({ 
                    type: "no",
                    message: 'Invalid email or password' 
                });
            }
        })
        .catch(error => {
            console.error('ERROR:', error);
            res.status(500).send({ message: 'Server error' });
        });
});

// การเพิ่มอุปกรณ์ใหม่ (สำหรับadmin)
app.post('/devices/add', authenticateToken, authorizeRole(['teacher','admin']), async (req, res) => {
    const { id, name, description, availability, approve, limit } = req.body;
    try {
        await db.none('INSERT INTO device(device_id, device_name, device_description, device_availability, device_limit, device_approve) VALUES($1, $2, $3, $4, $5, $6)', [id, name, description, availability, limit, approve]);
        res.status(200).send('Device added successfully');
    } catch (error) {
        console.error('ERROR:', error);
        res.status(500).send('Error adding device');
    }
});
// เช็คอุปกรณ์ที่เพิ่มมาทั้งหมด
app.get('/devices', authenticateToken, authorizeRole(['student', 'teacher', 'admin']), async (req, res) => {
    try {
        const devices = await db.any('SELECT * FROM device');
        res.status(200).json(devices);
    } catch (error) {
        console.error('ERROR:', error);
        res.status(500).send('Error fetching devices');
    }
});
// เช็คอุปกรณ์แต่ละชุด
app.get('/devices/:id', authenticateToken, authorizeRole(['student', 'teacher', 'admin']), async (req, res) => {
    const { id } = req.params;
    try {
        const device = await db.query('SELECT * FROM device WHERE device_id = $1', [id]);
        // ตรวจสอบว่ามีผลลัพธ์หรือไม่
        if (!device || device.length === 0) {
            return res.status(404).json({ error: 'Device not found' });
        }

        // ส่งข้อมูลอุปกรณ์กลับไปยังผู้ใช้
        res.status(200).json(device[0]); // หรือใช้ device ถ้ามันไม่ใช่อาร์เรย์
    } catch (error) {
        console.error('ERROR:', error);
        res.status(500).send('Error fetching device');
    }
});



// แก้ไขสถานะอุปกรณ์
app.put('/device/update', authenticateToken, authorizeRole(['teacher', 'admin']), async (req, res) => {
    const { id, availability, status } = req.body;
    try {
        await db.none('UPDATE device SET device_availability = $1, device_status = $2 WHERE device_id = $3',[availability, status, id]);
        res.status(200).send('Device updated successfully');
    } catch (error) {
        console.error('ERROR:', error);
        res.status(500).send('Error updating device');
    }
});

// ลบอุปกรณ์
app.delete('/device/delete', authenticateToken, authorizeRole(['teacher', 'admin']), async (req, res) => {
    const { id } = req.body; // รับค่า id จาก body ของคำขอ

    try {
        const result = await db.query('DELETE FROM device WHERE device_id = $1 RETURNING *', [id]);       
        res.status(200).send('Device deleted successfully');
    } catch (error) {
        console.error('ERROR:', error);
        res.status(500).send('Error deleting device');
    }
});



// เพิ่มรายการยืมคืน
app.post('/transaction', authenticateToken, authorizeRole(['student', 'teacher', 'admin']), async (req, res) =>{

});

// การยืมอุปกรณ์
app.post('/transaction/loan', authenticateToken, authorizeRole(['student', 'teacher', 'admin']), async (req, res) => {
    const { user_id, transaction_id, device_id, location_to_loan, quantity } = req.body;
    try {
        // ตรวจสอบว่ามี transaction_id ไหม
        let transaction = await db.oneOrNone('SELECT * FROM transaction WHERE transaction_id = $1', [transaction_id]);

        if (!transaction) {
        // ถ้าไม่มี transaction_id ให้สร้างใหม่
            await db.none('INSERT INTO transaction (transaction_id, transaction_details) VALUES ($1, $2)', [transaction_id, 'Some details']);
        }

        const device = await db.oneOrNone('SELECT * FROM device WHERE device_id = $1', [device_id]);
        const currentLoanCount = await db.one('SELECT COUNT(*) FROM loan_detail WHERE user_id = $1 AND device_id = $2 AND loan_approved = true AND return_date IS NULL', [req.user.id, device_id]);

        if (device && device.device_availability >= quantity) {
            if (currentLoanCount.count >= device.device_limit) {
                res.status(400).send('You have reached the loan limit for this device');
            } else {
                await db.tx(async t => {
                    await t.none('INSERT INTO loan_detail (user_id, transaction_id, device_id, loan_day, loan_month, loan_year, location_to_loan, loan_approved, loan_quantity) VALUES ($1, $2, $3, EXTRACT(DAY FROM CURRENT_DATE), EXTRACT(MONTH FROM CURRENT_DATE), EXTRACT(YEAR FROM CURRENT_DATE), $4, $5, $6)', [user_id, transaction_id, device_id, location_to_loan, false, quantity]);
                });
                res.status(200).send('Loan request submitted successfully. Awaiting approval.');
            }
        } else {
            res.status(400).send('Device is not available or insufficient quantity');
        }
    } catch (error) {
        console.error('ERROR:', error);
        res.status(500).send('Error submitting loan request');
    }
});

// ยืนยันการยืม
app.post('/transaction/approve-loan', authenticateToken, authorizeRole(['teacher', 'admin']), async (req, res) => {
    const { loan_id } = req.body;
    try {
        const loanDetail = await db.oneOrNone('SELECT * FROM loan_detail WHERE loan_id = $1', [loan_id]);
        if (loanDetail) {
            await db.tx(async t => {
                await t.none('UPDATE loan_detail SET loan_approved = $1 WHERE loan_id = $2', [true, loan_id]);
                await t.none('UPDATE device SET device_availability = device_availability - $1 WHERE device_id = $2', [loanDetail.loan_quantity, loanDetail.device_id]);
            });
            res.status(200).send('Loan request approved successfully');
        } else {
            res.status(400).send('Loan request not found');
        }
    } catch (error) {
        console.error('ERROR:', error);
        res.status(500).send('Error approving loan request');
    }
});

// การคืน
app.post('/transaction/return', authenticateToken, authorizeRole(['student', 'teacher', 'admin']), async (req, res) => {
    const { device_id } = req.body;
    try {
        console.log('Device ID:', device_id);
        console.log('User ID:', req.user.id);

        const loanDetail = await db.oneOrNone('SELECT * FROM loan_detail WHERE device_id = $1 AND user_id = $2 AND loan_approved = true AND return_date IS NULL', [device_id, req.user.id]);

        if (loanDetail) {
            console.log('Loan Detail:', loanDetail);
            await db.tx(async t => {
                await t.none('UPDATE loan_detail SET return_date = CURRENT_DATE WHERE loan_id = $1', [loanDetail.loan_id]);
                await t.none('UPDATE device SET device_availability = device_availability + $1 WHERE device_id = $2', [loanDetail.loan_quantity, device_id]);
                await t.none('INSERT INTO return_detail (loan_id, return_day, return_month, return_year) VALUES ($1, EXTRACT(DAY FROM CURRENT_DATE), EXTRACT(MONTH FROM CURRENT_DATE), EXTRACT(YEAR FROM CURRENT_DATE))', [loanDetail.loan_id]);
            });
            res.status(200).send('return complete!!!');
        } else {
            console.log('No loan record found for this device');
            res.status(400).send('No history to loan');
        }
    } catch (error) {
        console.error('error to return!!!:', error); // บันทึกข้อผิดพลาด
        res.status(500).send('error to return!!!');
    }
});


app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
