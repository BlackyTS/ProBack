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
    const { type, description, limit } = req.body;
    try {
        // หา device_id สูงสุดที่มีอยู่ในฐานข้อมูล
        const result = await db.one('SELECT COALESCE(MAX(device_id), 0) AS max_id FROM device');
        const nextId = result.max_id + 1;
        // เพิ่มอุปกรณ์ใหม่ด้วย device_id ที่คำนวณได้
        await db.none(
            'INSERT INTO device(device_id, device_name, device_description, device_limit, device_availability) VALUES($1, $2, $3, $4, $5)',
            [nextId, type, description, limit, limit]
        );
        // ตรวจสอบ item_id ที่มีอยู่แล้ว
        const existingItemIds = await db.any('SELECT item_id FROM device_item');
        const existingItemIdsSet = new Set(existingItemIds.map(row => row.item_id));
        // เพิ่มรายการอุปกรณ์ใน each_device
        for (let i = 1; i <= limit; i++) {
            // ตรวจสอบว่า item_id ซ้ำกันหรือไม่
            let itemId = i;
            while (existingItemIdsSet.has(itemId)) {
                itemId++;
            }
            existingItemIdsSet.add(itemId);

            await db.none(
                'INSERT INTO device_item(item_id, item_name, item_type, item_description, device_id, item_availability) VALUES($1, $2, $3, $4, $5, $6)',
                [itemId, `Item ${i}`, type, description, nextId, 'ready']
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
    const { id, type, approve, limit, description } = req.body;
    try {
        // ดึงค่า limit และ availability ปัจจุบันจากฐานข้อมูล
        const device = await db.one('SELECT device_limit, device_availability FROM device WHERE device_id = $1', [id]);
        const limitDifference = limit - device.device_limit;
        // อัพเดทข้อมูลอุปกรณ์ในฐานข้อมูล
        await db.none(
            'UPDATE device SET device_name = $1, device_approve = $2, device_limit = $3, device_availability = device_availability + $4 WHERE device_id = $5',
            [type, approve, limit, limitDifference, id]
        );

        if (limitDifference > 0) {
            // เพิ่มรายการใหม่ใน each_device
            for (let i = device.device_limit + 1; i <= limit; i++) {
                const itemId = i;  // กำหนด item_id เป็นตัวเลข
                await db.none(
                    'INSERT INTO device_item (item_id, item_name, item_type, item_description, device_id, item_availability) VALUES($1, $2, $3, $4, $5, $6)',
                    [itemId, `Item ${i}`, type, description, id, 'ready']
                );
            }
        } else if (limitDifference < 0) {
            // ลบรายการใน each_device ถ้าจำนวน limit ลดลง
            await db.none(
                'DELETE FROM device_item WHERE device_id = $1 AND item_id > $2',
                [id, limit]
            );
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
// เช็คอุปกรณ์ทุกตัว
// app.get('/device/each-item', authenticateToken, async (req, res) => {
//     try {
//         // ดึงข้อมูลอุปกรณ์ทั้งหมด
//         const items = await db.any('SELECT * FROM each_device');

//         // ตรวจสอบว่ามีอุปกรณ์ในฐานข้อมูลหรือไม่
//         if (items.length == 0) {
//             return res.status(404).json({ message: 'No device to view' });
//         }

//         // นับจำนวน item_availability ที่เป็นแต่ละสถานะ
//         const availabilityCounts = await db.one(`
//             SELECT 
//                 COUNT(*) FILTER (WHERE item_availability = 'ready') AS ready_count,
//                 COUNT(*) FILTER (WHERE item_availability = 'waiting for approve') AS waiting_for_approve_count,
//                 COUNT(*) FILTER (WHERE item_availability = 'borrowed') AS borrowed_count,
//                 COUNT(*) FILTER (WHERE item_availability = 'broken') AS broken_count
//             FROM each_device
//         `);

//         // ส่งค่าตอบกลับ
//         res.status(200).json({
//             items,
//             ready_count: availabilityCounts.ready_count,
//             waiting_for_approve_count: availabilityCounts.waiting_for_approve_count,
//             borrowed_count: availabilityCounts.borrowed_count,
//             broken_count: availabilityCounts.broken_count
//         });
//     } catch (error) {
//         console.error('ERROR:', error);
//         res.status(500).json({ message: 'Error fetching each devices' });
//     }
// });


// // เช็คอุปกรณ์แต่ละตัว
// app.get('/device/each-item/:id', authenticateToken, async (req, res) => {
//     const { id } = req.params;
//     try {
//         const item = await db.query('SELECT * FROM each_device WHERE item_id = $1', [id]);
//         // ตรวจสอบว่ามีผลลัพธ์หรือไม่
//         if (!item || item == 0) {
//             return res.status(404).json({ massge: 'Device not found' });
//         }

//         // ส่งข้อมูลอุปกรณ์กลับไปยังผู้ใช้
//         res.status(200).json(item[0]); // หรือใช้ device ถ้ามันไม่ใช่อาร์เรย์
//     } catch (error) {
//         console.error('ERROR:', error);
//         res.status(500).json({ message: 'Error fetching device' });
//     }
// });

// เช็คอุปกรณ์แต่ละตัว
// app.get('/device/each-item/:id', authenticateToken, async (req, res) => {
//     const { id } = req.params;
//     try {
//         const item = await db.query('SELECT * FROM device_item WHERE item_id = $1', [id]);
//         // ตรวจสอบว่ามีผลลัพธ์หรือไม่
//         if (!item || item == 0) {
//             return res.status(404).json({ massge: 'Device not found' });
//         }
//         res.status(200).json(item[0]); 
//     } catch (error) {
//         console.error('ERROR:', error);
//         res.status(500).json({ message: 'Error fetching device' });
//     }
// });

// // อัพเดทอุปกรณ์
// app.put('/device/each-item/update', authenticateToken, async (req, res) => {
//     const { id, name, type, description, availability } = req.body;  
//     try {
//         const result = await db.result('UPDATE device_item SET item_name = $1, item_type = $2, item_description = $3 , item_availability = $4 WHERE item_id = $5',[name, type, description, availability, id]);
//         if (!result) {
//             return res.status(404).json({ message: 'No device to update' });
//         }
//         res.status(200).json({ message: 'Items updated successfully.' });
//     } catch (error) {
//         console.error('ERROR:', error);
//         res.status(500).json({ message: 'Error updating items.' });
//     }
// });

// // ลบอุปกรณ์
// app.delete('/device/each-item/delete', authenticateToken, async (req, res) => {
//     const { id } = req.body; // รับค่า id จาก body ของคำขอ
//     try {
//         const result = await db.query('DELETE FROM device_item WHERE item_id = $1 RETURNING *', [id]);       
//         res.status(200).json({ message: 'Device deleted successfully' });
//     } catch (error) {
//         console.error('ERROR:', error);
//         res.status(500).json({ message: 'Error deleting device' });
//     }
// });
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
// ***ฟังก์ชัน USER***
// user ขอคำร้องขอยืม
app.post('/loan', authenticateToken, async (req, res) => {
    const { user_id, item_ids, loan_status, due_date } = req.body;
    let itemAvailabilityStatus = 'ready';
    // เปลี่ยน itemAvailabilityStatus เป็น 'pending' ถ้า loan_status เป็น 'pending'
    if (loan_status == 'pending') {
        itemAvailabilityStatus = 'pending';
    }
    try {
        // เริ่มต้น transaction
        await db.tx(async t => {
            // ตรวจสอบ item_ids และสร้าง loan_detail
            for (const item_id of item_ids) {
                // ตรวจสอบสถานะของ item_id ก่อนดำเนินการ
                const itemStatusResult = await t.oneOrNone(
                    'SELECT item_availability FROM device_item WHERE item_id = $1',
                    [item_id]
                );           
                if (itemStatusResult && (itemStatusResult.item_availability == 'pending' || itemStatusResult.item_availability == 'borrowed')) {
                    // ส่งการตอบกลับเมื่อพบ item ที่ไม่สามารถยืมได้
                    return t.none('ROLLBACK')
                        .then(() => res.status(400).json({ message: `Item with id ${item_id} cannot be borrowed` }));
                }
                // ดึง loan_id สูงสุดและเพิ่มค่า
                const result = await t.one('SELECT COALESCE(MAX(loan_id), 0) AS max_id FROM loan_detail');
                const nextId = result.max_id + 1;
           // อัปเดต loan_detail table
                await t.none(
                    'INSERT INTO loan_detail(loan_id, user_id, item_id, loan_status, due_date, item_availability_status) VALUES($1, $2, $3, $4, $5, $6)',
                    [nextId, user_id, item_id, loan_status, due_date, itemAvailabilityStatus]
                );
                // อัปเดต item_availability_status ใน device_item ถ้า loan_status เป็น 'pending'
                if (loan_status == 'pending') {
                    await t.none(
                        'UPDATE device_item SET item_availability = $1 WHERE item_id = $2',
                        [itemAvailabilityStatus, item_id]
                    );
                }
            }
            res.status(200).json({ message: 'Add request successfully' });
        });
    } catch (error) {
        console.error('ERROR:', error);
        if (!res.headersSent) {
            res.status(500).json({ message: 'Error to request' });
        }
    }
});

// user ยืนยันคืน
app.post('/return', authenticateToken, async (req, res) => {
    const { user_id, item_ids, return_status, location } = req.body;

    // ตรวจสอบให้แน่ใจว่า item_ids เป็นอาร์เรย์
    if (!Array.isArray(item_ids)) {
        return res.status(400).json({ message: 'item_ids should be an array' });
    }

    try {
        // เริ่มต้น transaction
        await db.tx(async t => {
            // ตรวจสอบและคืนอุปกรณ์
            for (const item_id of item_ids) {
                // ดึง loan_id ล่าสุดที่ยังไม่ได้คืนจาก loan_detail
                const loanDetail = await t.oneOrNone(
                    'SELECT loan_id FROM loan_detail WHERE item_id = $1 AND return_date IS NULL',
                    [item_id]
                );

                if (!loanDetail) {
                    // ส่งการตอบกลับเมื่อไม่พบ loan_id ที่เกี่ยวข้อง
                    return res.status(400).json({ message: `No active loan found for item with id ${item_id}` });
                }

                // อัปเดต return_detail table
                const result = await t.one('SELECT COALESCE(MAX(return_id), 0) AS max_id FROM return_detail');
                const nextId = result.max_id + 1;

                await t.none(
                    'INSERT INTO return_detail(return_id, user_id, item_id, return_status, location_to_return) VALUES($1, $2, $3, $4, $5)',
                    [nextId, user_id, item_id, return_status, location]
                );
                // อัปเดต loan_detail table ให้ return_date เป็นวันที่ปัจจุบัน
                await t.none(
                    'UPDATE loan_detail SET return_date = CURRENT_DATE WHERE loan_id = $1',
                    [loanDetail.loan_id]
                );
                // อัปเดต item_availability_status ใน device_item ให้กลับไปเป็น 'ready'
                await t.none(
                    'UPDATE device_item SET item_availability = $1, item_loaning = false WHERE item_id = $2',
                    ['ready', item_id]
                );
                // อัปเดต loan_status, item_availability_status ใน loan_detail ให้เป็น complete เพื่อยืนยันว่ารายการนี้สำเร็จแล้ว
                await t.none(
                    'UPDATE loan_detail SET loan_status = $1, item_availability_status = $2 WHERE item_id = $3',
                    ['complete', 'complete', item_id]
                );
            }

            // ส่งการตอบกลับเมื่อดำเนินการสำเร็จ
            res.status(200).json({ message: 'Return processed successfully' });
        });

    } catch (error) {
        console.error('ERROR:', error);
        if (!res.headersSent) {
            // ส่งการตอบกลับเมื่อเกิดข้อผิดพลาด
            res.status(500).json({ message: 'Error to return devices' });
        }
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
