// app.post('/devices/add', authenticateToken, async (req, res) => {
//     const { name, description, limit } = req.body;
//     try {
//         // เพิ่มอุปกรณ์เข้าในตาราง device โดยไม่ต้องระบุ device_id
//         const result = await db.one(
//             'INSERT INTO device(device_name, device_description, device_limit, device_availability) VALUES($1, $2, $3, $4) RETURNING device_id',
//             [name, description, limit, limit]
//         );

//         const deviceId = result.device_id;

//         // เพิ่มรายการอุปกรณ์ใน device_items
//         for (let i = 1; i <= limit; i++) {
//             await db.none(
//                 'INSERT INTO device_items(item_name, item_description, device_id, item_availability) VALUES($1, $2, $3, $4)',
//                 [`Item ${i}`, description, deviceId, 'ready']
//             );
//         }
        
//         res.status(200).json({ message: 'Device and items added successfully' });
//     } catch (error) {
//         console.error('ERROR:', error);
//         res.status(500).json({ message: 'Error adding device and items' });
//     }
// });


// app.put('/device/update', authenticateToken, async (req, res) => {
//     const { id, name, limit, description, approve } = req.body;

//     try {
//         // ดึงข้อมูลปัจจุบันของอุปกรณ์จากฐานข้อมูล
//         const device = await db.one('SELECT device_limit, device_availability FROM device WHERE device_id = $1', [id]);

//         // คำนวณความแตกต่างของ limit
//         const limitDifference = limit - device.device_limit;

//         // อัพเดตค่า limit, availability และ approve ในตาราง device
//         await db.none(
//             'UPDATE device SET device_name = $1, device_limit = $2, device_availability = device_availability + $3, device_approve = $4 WHERE device_id = $5',
//             [name, limit, limitDifference, approve, id]
//         );

//         // ถ้าจำนวน limit เพิ่มขึ้น, เพิ่มรายการใหม่ใน device_items
//         if (limitDifference > 0) {
//             for (let i = device.device_limit + 1; i <= limit; i++) {
//                 await db.none(
//                     'INSERT INTO device_items (item_name, item_description, item_availability, device_id) VALUES($1, $2, $3, $4)',
//                     [`${name} ${i}`, description, 'ready', id]
//                 );
//             }
//         } 
//         // ถ้าจำนวน limit ลดลง, ลบรายการใน device_items
//         else if (limitDifference < 0) {
//             for (let i = device.device_limit; i > limit; i--) {
//                 await db.none('DELETE FROM device_items WHERE device_id = $1 AND item_name = $2', [id, `Item ${i}`]);
//             }
//         }

//         res.status(200).json({ message: 'Device updated successfully' });
//     } catch (error) {
//         console.error('ERROR:', error);
//         res.status(500).json({ message: 'Error updating device' });
//     }
// });

// ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// // เช็คอุปกรณ์ทุกตัว
// // app.get('/device/each-item', authenticateToken, async (req, res) => {
// //     try {
// //         // ดึงข้อมูลอุปกรณ์ทั้งหมด
// //         const items = await db.any('SELECT * FROM each_device');

// //         // ตรวจสอบว่ามีอุปกรณ์ในฐานข้อมูลหรือไม่
// //         if (items.length == 0) {
// //             return res.status(404).json({ message: 'No device to view' });
// //         }

// //         // นับจำนวน item_availability ที่เป็นแต่ละสถานะ
// //         const availabilityCounts = await db.one(`
// //             SELECT 
// //                 COUNT(*) FILTER (WHERE item_availability = 'ready') AS ready_count,
// //                 COUNT(*) FILTER (WHERE item_availability = 'waiting for approve') AS waiting_for_approve_count,
// //                 COUNT(*) FILTER (WHERE item_availability = 'borrowed') AS borrowed_count,
// //                 COUNT(*) FILTER (WHERE item_availability = 'broken') AS broken_count
// //             FROM each_device
// //         `);

// //         // ส่งค่าตอบกลับ
// //         res.status(200).json({
// //             items,
// //             ready_count: availabilityCounts.ready_count,
// //             waiting_for_approve_count: availabilityCounts.waiting_for_approve_count,
// //             borrowed_count: availabilityCounts.borrowed_count,
// //             broken_count: availabilityCounts.broken_count
// //         });
// //     } catch (error) {
// //         console.error('ERROR:', error);
// //         res.status(500).json({ message: 'Error fetching each devices' });
// //     }
// // });


// // // เช็คอุปกรณ์แต่ละตัว
// // app.get('/device/each-item/:id', authenticateToken, async (req, res) => {
// //     const { id } = req.params;
// //     try {
// //         const item = await db.query('SELECT * FROM each_device WHERE item_id = $1', [id]);
// //         // ตรวจสอบว่ามีผลลัพธ์หรือไม่
// //         if (!item || item == 0) {
// //             return res.status(404).json({ massge: 'Device not found' });
// //         }

// //         // ส่งข้อมูลอุปกรณ์กลับไปยังผู้ใช้
// //         res.status(200).json(item[0]); // หรือใช้ device ถ้ามันไม่ใช่อาร์เรย์
// //     } catch (error) {
// //         console.error('ERROR:', error);
// //         res.status(500).json({ message: 'Error fetching device' });
// //     }
// // });

// // เช็คอุปกรณ์แต่ละตัว
// // app.get('/device/each-item/:id', authenticateToken, async (req, res) => {
// //     const { id } = req.params;
// //     try {
// //         const item = await db.query('SELECT * FROM device_item WHERE item_id = $1', [id]);
// //         // ตรวจสอบว่ามีผลลัพธ์หรือไม่
// //         if (!item || item == 0) {
// //             return res.status(404).json({ massge: 'Device not found' });
// //         }
// //         res.status(200).json(item[0]); 
// //     } catch (error) {
// //         console.error('ERROR:', error);
// //         res.status(500).json({ message: 'Error fetching device' });
// //     }
// // });

// // // อัพเดทอุปกรณ์
// // app.put('/device/each-item/update', authenticateToken, async (req, res) => {
// //     const { id, name, type, description, availability } = req.body;  
// //     try {
// //         const result = await db.result('UPDATE device_item SET item_name = $1, item_type = $2, item_description = $3 , item_availability = $4 WHERE item_id = $5',[name, type, description, availability, id]);
// //         if (!result) {
// //             return res.status(404).json({ message: 'No device to update' });
// //         }
// //         res.status(200).json({ message: 'Items updated successfully.' });
// //     } catch (error) {
// //         console.error('ERROR:', error);
// //         res.status(500).json({ message: 'Error updating items.' });
// //     }
// // });

// // // ลบอุปกรณ์
// // app.delete('/device/each-item/delete', authenticateToken, async (req, res) => {
// //     const { id } = req.body; // รับค่า id จาก body ของคำขอ
// //     try {
// //         const result = await db.query('DELETE FROM device_item WHERE item_id = $1 RETURNING *', [id]);       
// //         res.status(200).json({ message: 'Device deleted successfully' });
// //     } catch (error) {
// //         console.error('ERROR:', error);
// //         res.status(500).json({ message: 'Error deleting device' });
// //     }
// // });

// app.post('/loan', authenticateToken, async (req, res) => {
//     const { device_ids, quantities } = req.body;
//     let itemAvailabilityStatus = 'ready'; // ready = 1
//     const loan_status = 'pending';
//     if (loan_status == 'pending') {
//         itemAvailabilityStatus = 'pending'; // pending = 2
//     }
//     try {
//         // ตรวจสอบว่า device_ids และ quantities ถูกต้อง
//         if (!Array.isArray(device_ids) || !Array.isArray(quantities) || device_ids.length !== quantities.length) {
//             return res.status(400).json({ message: 'Invalid input. device_ids and quantities must be arrays of the same length.' });
//         }
        
//         // ดึง user_id จาก req.user หลังจากการตรวจสอบ token
//         const user_id = req.user.id;
//         console.log('User ID:', user_id);

//         // กำหนดวันที่ครบกำหนดเป็น 7 วันหลังจากวันที่ยืม
//         const loan_date = new Date();
//         const due_date = new Date(loan_date);
//         due_date.setDate(loan_date.getDate() + 7);

//         // เริ่มต้น transaction
//         await db.tx(async t => {
//             let totalItemQuantity = 0;
//             let transaction_loan_id;

//             for (let i = 0; i < device_ids.length; i++) {
//                 const device_id = device_ids[i];
//                 const quantity = quantities[i];
//                 totalItemQuantity += quantity;

//                 // ตรวจสอบว่า quantity ถูกต้อง
//                 if (quantity <= 0) {
//                     return res.status(400).json({ message: `Invalid quantity for device_id ${device_id}.` });
//                 }

//                 // ค้นหา item_id ที่พร้อมใช้งาน (ready) สำหรับ device_id ที่ระบุ
//                 const availableItems = await t.any(
//                     'SELECT item_id FROM device_item WHERE device_id = $1 AND item_availability = $2 ORDER BY item_id ASC',
//                     [device_id, 'ready']
//                 );

//                 // ตรวจสอบว่ามีจำนวน item_id เพียงพอหรือไม่
//                 if (availableItems.length < quantity) {
//                     return res.status(400).json({
//                         message: `Not enough items available for device_id ${device_id}. Only ${availableItems.length} items are ready for borrowing.`
//                     });
//                 }

//                 // เลือก item_id ตามจำนวนที่ต้องการยืม
//                 const selectedItems = availableItems.slice(0, quantity);

//                 // อัปเดตสถานะของ item_ids ที่ต้องการยืม
//                 for (const item of selectedItems) {
//                     const item_id = item.item_id;
//                     const result = await t.one('SELECT COALESCE(MAX(loan_id), 0) + 1 AS next_id FROM loan_detail');
//                     const loan_id = result.next_id;

//                     if (!transaction_loan_id) {
//                         transaction_loan_id = loan_id;
//                     }

//                     await t.none(
//                         'INSERT INTO loan_detail(loan_id, user_id, device_id, item_id, loan_status, due_date, item_availability_status) VALUES($1, $2, $3, $4, $5, $6, $7)',
//                         [loan_id, user_id, device_id, item_id, loan_status, due_date, itemAvailabilityStatus]
//                     );

//                     // อัปเดตสถานะ item_availability ใน device_item ถ้า loan_status เป็น pending
//                     if (loan_status == 'pending') {
//                         await t.none(
//                             'UPDATE device_item SET item_availability = $1 WHERE item_id = $2',
//                             [itemAvailabilityStatus, item_id]
//                         );
//                     }
//                 }

//                 // อัปเดตค่า device_availability ในตาราง device โดยนับจำนวน item_availability ที่มีสถานะ ready
//                 const updatedAvailability = await t.one(
//                     'SELECT COUNT(*) AS ready_count FROM device_item WHERE device_id = $1 AND item_availability = $2',
//                     [device_id, 'ready']
//                 );
//                 await t.none(
//                     'UPDATE device SET device_availability = $1 WHERE device_id = $2',
//                     [updatedAvailability.ready_count, device_id]
//                 );
//             }

//             // บันทึกข้อมูลลงในตาราง transaction
//             await t.none(
//                 'INSERT INTO transaction(user_id, loan_id, loan_date, due_date, item_quantity) VALUES($1, $2, CURRENT_TIMESTAMP, $3, $4)',
//                 [user_id, transaction_loan_id, due_date, totalItemQuantity]
//             );

//             res.status(200).json({ message: 'Loan request processed successfully' });
//         });
//     } catch (error) {
//         console.error('ERROR:', error);
//         if (!res.headersSent) {
//             res.status(500).json({ message: 'Error processing loan request' });
//         }
//     }
// });

// // // อัปเดตจำนวนของ device ที่พร้อมใช้งานในตาราง device
//             // await t.none(
//             //     `UPDATE device 
//             //      SET device_availability = (
//             //         SELECT COUNT(*) 
//             //         FROM device_item 
//             //         WHERE device_id = device.device_id 
//             //         AND item_availability = 'ready'
//             //      ) 
//             //      WHERE device_id IN (
//             //         SELECT DISTINCT device_id 
//             //         FROM device_item 
//             //         WHERE item_id IN (${items.map(item => item.item_id).join(',')})
//             //      )`
//             // );




            // app.post('/return', authenticateToken, upload.single('device_photo'), async (req, res) => {
            //     let items;
            
            //     try {
            //         const user_id = req.user.id;
            //         console.log(`User ID return: `, user_id);
            //         items = JSON.parse(req.body.items);
            //         if (!items || !Array.isArray(items) || items.length === 0) {
            //             if (req.file) {
            //                 fs.unlinkSync(req.file.path);
            //             }
            //             return res.status(400).json({ message: 'Please provide a list of items to return.' });
            //         }
            
            //         const borrowedTransactions = await db.any(
            //             `SELECT item_id
            //              FROM loan_detail
            //              WHERE user_id = $1
            //              AND return_date IS NULL`,
            //             [user_id]
            //         );
            //         const borrowedItemIds = borrowedTransactions.map(tx => tx.item_id);
            
            //         for (const item of items) {
            //             if (!borrowedItemIds.includes(item.item_id)) {
            //                 if (req.file) {
            //                     fs.unlinkSync(req.file.path);
            //                 }
            //                 return res.status(400).json({ message: `Item ${item.item_id} was not borrowed by this user or has already been returned.` });
            //             }
            //         }
            
            //         const returnDate = new Date(); // กำหนด return_date เป็นวันที่และเวลาปัจจุบัน
            
            //         await db.tx(async t => {
            //             for (const { item_id, return_status } of items) {
            //                 // สร้าง return_id ใหม่สำหรับแต่ละ item_id
            //                 const result = await t.one('SELECT COALESCE(MAX(return_id), 0) AS max_id FROM return_detail');
            //                 const nextId = result.max_id + 1;
            //                 // อัปเดตข้อมูลใน return_detail
            //                 await t.none(
            //                     'INSERT INTO return_detail(return_id, user_id, item_id, return_status, device_photo, return_date) VALUES($1, $2, $3, $4, $5, $6)',
            //                     [nextId, user_id, item_id, return_status, req.file ? req.file.path : null, returnDate]
            //                 );
            //                 // อัปเดตวันที่คืนใน loan_detail
            //                 await t.none(
            //                     'UPDATE loan_detail SET return_date = $1, loan_status = $2, item_availability_status = $3 WHERE user_id = $4 AND item_id = $5 AND return_date IS NULL',
            //                     [returnDate, 'complete', 'complete', user_id, item_id]
            //                 );
            //                 // อัปเดตสถานะใน device_item
            //                 await t.none(
            //                     'UPDATE device_item SET item_availability = $1, item_loaning = false WHERE item_id = $2',
            //                     ['ready', item_id]
            //                 );
            //                 // อัปเดตข้อมูลใน transaction
            //                 await t.none(
            //                     `UPDATE transaction 
            //                     SET return_date = $1, device_photo = $2, loan_status = 'complete' 
            //                     WHERE transaction_id = (SELECT transaction_id FROM loan_detail WHERE item_id = $3 AND user_id = $4 LIMIT 1)`,
            //                     [returnDate, req.file ? req.file.path : null, item_id, user_id]
            //                 );
            //             }
            //             // อัปเดตจำนวนของ device ที่พร้อมใช้งานในตาราง device
            //             await t.none(
            //                 `UPDATE device 
            //                  SET device_availability = (
            //                     SELECT COUNT(*) 
            //                     FROM device_item 
            //                     WHERE device_id = device.device_id 
            //                     AND item_availability = 'ready'
            //                  ) 
            //                  WHERE device_id IN (
            //                     SELECT DISTINCT device_id 
            //                     FROM device_item 
            //                     WHERE item_id IN (${items.map(item => item.item_id).join(',')})
            //                  )`
            //             );
            
            //             res.status(200).json({ message: 'Return processed successfully' });
            //         });
            //     } catch (error) {
            //         console.error('ERROR:', error);
            //         if (req.file) {
            //             fs.unlinkSync(req.file.path);
            //         }
            //         if (!res.headersSent) {
            //             res.status(500).json({ message: 'Error processing return' });
            //         }
            //     }
            // });
            
            
            
            
            
            
            
            
            
            
            
            
            
            
            
            
            
            
            
            
            
            
            
            
            
            
            
            
            
            
            
            
            
            
//             app.get('/dashboard', authenticateToken, async (req, res) => {
//                 try {
//                     // ดึงจำนวนผู้ใช้ทั้งหมด
//                     const totalUsers = await db.one('SELECT COUNT(user_id) AS total_users FROM users');
//                     // ดึงจำนวนอุปกรณ์ทั้งหมด
//                     const totalDevices = await db.one('SELECT COUNT(item_id) AS total_devices FROM device_item');
//                     // ดึงข้อมูลการยืมอุปกรณ์
//                     // const loanDetails = await db.any(`
//                     //     SELECT device_name, COUNT(loan_detail.device_id) AS borrow_count
//                     //     FROM loan_detail
//                     //     JOIN device_items ON loan_detail.device_id = device_items.item_id
//                     //     GROUP BY device_name
//                     //     ORDER BY borrow_count DESC
//                     //     LIMIT 10
//                     // `);
            
//                     // ส่งข้อมูลกลับ
//                     res.status(200).json({
//                         total_users: totalUsers.total_users,
//                         total_devices: totalDevices.total_devices,
//                         // loan_details: loanDetails
//                     });
//                 } catch (error) {
//                     console.error('Error fetching dashboard data:', error);
//                     res.status(500).send({ message: 'Error fetching dashboard data' });
//                 }
//             });
            
//             app.listen(port, () => {
//                 console.log(`Server is running on http://localhost:${port}`);
//             });
            
// admin ยืนยันการคืน
// app.put('/admin/confirm-return', authenticateToken, async (req, res) => {
//     const items = req.body; // ใช้ req.body โดยตรง

//     try {
//         if (!items || !Array.isArray(items) || items.length == 0) {
//             return res.status(400).json({ message: 'Please provide a list of items to confirm return.' });
//         }

//         let notReturnedItems = [];
//         let allItemsReturned = true;

//         await db.tx(async t => {
//             for (const { item_id, return_status } of items) {
//                 // ตรวจสอบสถานะการคืนจาก return_detail
//                 const returnDetail = await t.oneOrNone(
//                     `SELECT return_status FROM return_detail WHERE item_id = $1 AND return_status = 'pending'`,
//                     [item_id]
//                 );

//                 if (!returnDetail) {
//                     notReturnedItems.push(item_id);
//                     allItemsReturned = false; // มีบางรายการที่ไม่ได้คืน
//                     continue; // ถ้าไม่เจอข้อมูลที่เป็น pending ข้ามรายการนี้ไป
//                 }

//                 if (return_status == 'complete') {
//                     // เปลี่ยน return_status เป็น complete
//                     await t.none(
//                         `UPDATE return_detail 
//                          SET return_status = $1 
//                          WHERE item_id = $2`,
//                         ['complete', item_id]
//                     );

//                     // อัปเดตข้อมูลใน loan_detail ว่า complete และสถานะ item_availability_status
//                     await t.none(
//                         `UPDATE loan_detail 
//                          SET loan_status = $1, item_availability_status = $2 
//                          WHERE item_id = $3 AND return_date IS NOT NULL`,
//                         ['complete', 'complete', item_id]
//                     );

//                     // อัปเดต device_item ให้เป็นพร้อมใช้งาน
//                     await t.none(
//                         `UPDATE device_item 
//                          SET item_availability = 'ready', item_loaning = false 
//                          WHERE item_id = $1`,
//                         [item_id]
//                     );

//                     // อัปเดตจำนวน device_availability ให้เพิ่มขึ้นในตาราง device
//                     await t.none(
//                         `UPDATE device 
//                          SET device_availability = device_availability + 1 
//                          WHERE device_id = (
//                             SELECT device_id FROM device_item WHERE item_id = $1
//                          )`,
//                         [item_id]
//                     );
//                 }
//             }

//             // ตรวจสอบว่ามีรายการที่ยังไม่ได้คืนหรือไม่
//             if (notReturnedItems.length > 0) {
//                 res.status(200).json({
//                     message: 'Partial return confirmed. Some items are still missing.',
//                     notReturnedItems
//                 });
//             } else if (!allItemsReturned) {
//                 res.status(200).json({ message: 'No items to return.' });
//             } else {
//                 res.status(200).json({ message: 'All items returned successfully and confirmed.' });
//             }
//         });
//     } catch (error) {
//         console.error('ERROR:', error);
//         res.status(500).json({ message: 'Error processing return confirmation.' });
//     }
// });
// // ดูการคืนที่เป็น pending
// app.get('/admin/return_detail/pending', authenticateToken, async (req, res) => {
//     try {
//         // ดึงข้อมูลจาก return_detail แทน loan_detail
//         const requests = await db.any(`
//             SELECT t.user_id, t.transaction_id, u.user_firstname, u.user_email, t.return_date, t.due_date, t.item_quantity, rd.return_status
//             FROM transaction t
//             JOIN users u ON t.user_id = u.user_id
//             LEFT JOIN return_detail rd ON t.transaction_id = rd.transaction_id
//             WHERE rd.return_status = 'pending'
//             ORDER BY t.loan_date DESC;
//         `);

//         if (requests.length == 0) {
//             return res.status(404).json({ message: 'No pending return transactions found' });
//         }

//         // Group the results by user_id and transaction_id
//         const groupedRequests = requests.reduce((acc, curr) => {
//             const existingRequest = acc.find(req => req.user_id == curr.user_id && req.transaction_id == curr.transaction_id);
//             if (existingRequest) {
//                 existingRequest.return_status = curr.return_status; // Update return_status
//             } else {
//                 acc.push({
//                     user_id: curr.user_id,
//                     transaction_id: curr.transaction_id,
//                     user_firstname: curr.user_firstname,
//                     user_email: curr.user_email,
//                     return_date: curr.return_date,
//                     due_date: curr.due_date,
//                     item_quantity: curr.item_quantity,
//                     return_status: curr.return_status
//                 });
//             }
//             return acc;
//         }, []);

//         res.status(200).json(groupedRequests);
//     } catch (error) {
//         console.error('ERROR:', error);
//         res.status(500).json({ message: 'Error fetching return transactions' });
//     }
// });

// app.post('/register', async (req, res) => {
//     const { email, password, firstname, lastname } = req.body;
//     const hashedPassword = await bcrypt.hash(password, 10);
//     console.log(req.body)
//     try {
//         //const existingUser = await db.oneOrNone('SELECT * FROM users WHERE user_email = $1', [email]);
//         const maxIdResult = await prisma.users.aggregate({
//             _max: {
//                 user_id: true
//             }
//         });
//         const maxId = maxIdResult._max.id || 0;
//         const nextId = maxId + 1;
//         const existingUser = await prisma.users.findMany({
//             where: { user_email: email }
//         });

//         if (existingUser.length != 0) {
//             return res.status(400).json({ message: 'Email already in use' });
//         }
//         // await db.none(
//         //     'INSERT INTO users(user_id, user_email, user_password, user_firstname, user_lastname) VALUES($1, $2, $3, $4, $5)',
//         //     [nextId, email, hashedPassword, firstname, lastname]
//         // );
//         const newUser = await prisma.users.create({
//             data: {
//                 user_id: nextId,
//                 user_email: email,
//                 user_password: hashedPassword,
//                 user_firstname: firstname,
//                 user_lastname: lastname
//             }
//         });
//         res.status(200).json({ 
//             message: 'User registered successfully',
//             type: "ok",
//             data: (newUser)
//          });
//     } catch (error) {
//         console.error('ERROR:', error);
//         res.status(500).json({ massge : 'Error registering user'});
//     }
// });

// // Login
// app.post('/login', async (req, res) => {
//     const { email, password } = req.body;
//     console.log(req.body);

//     try {
//         // ค้นหาผู้ใช้จากอีเมล
//         const user = await prisma.users.findFirst({
//             where: { user_email: email }
//         });

//         if (!user) {
//             return res.status(400).json({ message: 'Invalid email or password' });
//         }

//         // ตรวจสอบรหัสผ่าน
//         const match = await bcrypt.compare(password, user.user_password);
//         if (match) {
//             // สร้าง JWT token
//             const token = generateToken(user);

//             // ตั้งค่า cookie สำหรับ JWT token
//             res.cookie('token', token, { 
//                 maxAge: 72 * 60 * 60 * 1000, // 72 ชั่วโมง
//                 httpOnly: true, 
//                 secure: true, 
//                 sameSite: 'none' 
//             });

//             res.status(200).json({ 
//                 type: "ok",
//                 message: 'Logged in successfully',
//                 role: user.user_role
//             });
//         } else {
//             res.status(400).json({ 
//                 type: "no",
//                 message: 'Invalid email or password' 
//             });
//         }
//     } catch (error) {
//         console.error('ERROR:', error);
//         res.status(500).json({ message: 'Server error' });
//     }
// });


//ยืมโดยไม่มี qrcode
// app.post('/loan', authenticateToken, async (req, res) => {
//     const { devices, due_date } = req.body;
//     let itemAvailabilityStatus = 'ready';
//     const loan_status = 'pending';
//     if (loan_status == 'pending') {
//         itemAvailabilityStatus = 'pending';
//     }
//     try {
//         if (!Array.isArray(devices) || devices.length == 0) {
//             return res.status(400).json({ message: 'Invalid selection. Please provide at least one device.' });
//         }
//         const user_id = req.user.id;
//         console.log('User ID:', user_id);
//         const loan_date = new Date();
//         const cancelable_until = new Date(loan_date.getTime() + 12 * 60 * 60 * 1000); // 12 ชั่วโมงถัดไป
        
//         await db.tx(async t => {
//             let totalItemQuantity = 0;

//             // รับค่า transaction_id สูงสุดจากฐานข้อมูล
//             const maxTransaction = await t.one('SELECT COALESCE(MAX(transaction_id), 0) AS max_id FROM transaction');
//             const nextTransactionId = maxTransaction.max_id + 1;

//             // สร้าง serial number สำหรับ transaction
//             const serialNumber = `TRANS-${nextTransactionId}-${Date.now()}`;

//             // สร้าง QR code สำหรับ transaction
//             const qrCodeData = JSON.stringify({
//                 transaction_id: nextTransactionId,
//                 serial: serialNumber,
//                 user_id: user_id,
//                 loan_date: loan_date,
//                 due_date: due_date
//             });

//             const qrCodeFileName = `transaction_${nextTransactionId}.png`;
//             const qrCodePath = path.join(__dirname, 'transaction_qrcodes', qrCodeFileName);

//             await QRCode.toFile(qrCodePath, qrCodeData);

//             // บันทึกข้อมูลลงในตาราง transaction
//             await t.none(
//                 'INSERT INTO transaction(transaction_id, user_id, loan_date, due_date, item_quantity, loan_status, transaction_qrcode) VALUES($1, $2, $3, $4, $5, $6, $7)',
//                 [nextTransactionId, user_id, loan_date, due_date, totalItemQuantity, loan_status, serialNumber]
//             );

//             // รับค่า loan_id สูงสุดจากฐานข้อมูล
//             const maxLoan = await t.one('SELECT COALESCE(MAX(loan_id), 0) AS max_id FROM loan_detail');
//             let nextLoanId = maxLoan.max_id + 1;

//             for (const { device_id, quantity } of devices) {
//                 if (!device_id || !quantity || quantity <= 0) {
//                     throw new Error('Invalid device_id or quantity.');
//                 }

//                 const availableItems = await t.any(
//                     'SELECT item_id FROM device_item WHERE device_id = $1 AND item_availability = $2 ORDER BY item_id ASC',
//                     [device_id, 'ready']
//                 );

//                 if (availableItems.length < quantity) {
//                     throw new Error(`Not enough items available for device_id ${device_id}.`);
//                 }

//                 const selectedItems = availableItems.slice(0, quantity);
//                 totalItemQuantity += quantity;

//                 for (const item of selectedItems) {
//                     const item_id = item.item_id;

//                     await t.none(
//                         'INSERT INTO loan_detail(loan_id, user_id, item_id, loan_status, due_date, item_availability_status, device_id, loan_date, transaction_id, cancelable_until) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)',
//                         [nextLoanId, user_id, item_id, loan_status, due_date, itemAvailabilityStatus, device_id, loan_date, nextTransactionId, cancelable_until]
//                     );

//                     nextLoanId++;

//                     if (loan_status == 'pending') {
//                         await t.none(
//                             'UPDATE device_item SET item_availability = $1 WHERE item_id = $2',
//                             [itemAvailabilityStatus, item_id]
//                         );
//                     }
//                 }

//                 const updatedAvailability = await t.one(
//                     'SELECT COUNT(*) AS ready_count FROM device_item WHERE device_id = $1 AND item_availability = $2',
//                     [device_id, 'ready']
//                 );

//                 await t.none(
//                     'UPDATE device SET device_availability = $1 WHERE device_id = $2',
//                     [updatedAvailability.ready_count, device_id]
//                 );
//             }

//             // อัปเดต item_quantity ในตาราง transaction
//             await t.none(
//                 'UPDATE transaction SET item_quantity = $1 WHERE transaction_id = $2',
//                 [totalItemQuantity, nextTransactionId]
//             );

//             res.status(200).json({ message: 'Loan request processed successfully', transactionId: nextTransactionId, serialNumber: serialNumber });

//             // ส่งการแจ้งเตือนผ่าน Line Notify
//             const notifyMessage = `มีการขอยืมอุปกรณ์ใหม่แล้ว. User ID: ${user_id}, จำนวนรวม: ${totalItemQuantity}`;
//             await sendLineNotify(notifyMessage);
//         });
//     } catch (error) {
//         console.error('ERROR:', error);
//         if (!res.headersSent) {
//             res.status(500).json({ message: 'Error processing loan request' });
//         }
//     }
// });

// scan qrcode confirm loan
// app.post('/loan', authenticateToken, async (req, res) => {
//     const { devices, due_date } = req.body;
//     let itemAvailabilityStatus = 'ready';
//     const loan_status = 'pending';
//     if (loan_status === 'pending') {
//         itemAvailabilityStatus = 'pending';
//     }

//     try {
//         if (!Array.isArray(devices) || devices.length === 0) {
//             return res.status(400).json({ message: 'Invalid selection. Please provide at least one device.' });
//         }

//         const user_id = req.user.id;
//         const loan_date = new Date();
//         const cancelable_until = new Date(loan_date.getTime() + 12 * 60 * 60 * 1000); // 12 ชั่วโมงถัดไป

//         await db.tx(async t => {
//             let totalItemQuantity = 0;

//             // รับค่า loan_id สูงสุดจากฐานข้อมูล
//             const maxLoan = await t.one('SELECT COALESCE(MAX(loan_id), 0) AS max_id FROM loan_detail');
//             let nextLoanId = maxLoan.max_id + 1;

//             // สร้าง transaction_id สำหรับการยืม
//             const maxTransaction = await t.one('SELECT COALESCE(MAX(transaction_id), 0) AS max_id FROM transaction');
//             const nextTransactionId = maxTransaction.max_id + 1;

//             // บันทึกข้อมูล transaction ก่อนการบันทึก loan_detail
//             await t.none(
//                 'INSERT INTO transaction(transaction_id, user_id, loan_date, due_date, item_quantity, loan_status) VALUES($1, $2, $3, $4, $5, $6)',
//                 [nextTransactionId, user_id, loan_date, due_date, 0, loan_status] // item_quantity จะอัปเดตทีหลัง
//             );

//             for (const { device_id, quantity } of devices) {
//                 if (!device_id || !quantity || quantity <= 0) {
//                     throw new Error('Invalid device_id or quantity.');
//                 }

//                 const availableItems = await t.any(
//                     'SELECT item_id FROM device_item WHERE device_id = $1 AND item_availability = $2 ORDER BY item_id ASC',
//                     [device_id, 'ready']
//                 );

//                 if (availableItems.length < quantity) {
//                     throw new Error(`Not enough items available for device_id ${device_id}.`);
//                 }

//                 const selectedItems = availableItems.slice(0, quantity);
//                 totalItemQuantity += quantity;

//                 for (const item of selectedItems) {
//                     const item_id = item.item_id;

//                     await t.none(
//                         'INSERT INTO loan_detail(loan_id, user_id, item_id, loan_status, due_date, item_availability_status, device_id, loan_date, cancelable_until, transaction_id) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)',
//                         [nextLoanId, user_id, item_id, loan_status, due_date, itemAvailabilityStatus, device_id, loan_date, cancelable_until, nextTransactionId]
//                     );

//                     nextLoanId++;

//                     if (loan_status === 'pending') {
//                         await t.none(
//                             'UPDATE device_item SET item_availability = $1 WHERE item_id = $2',
//                             [itemAvailabilityStatus, item_id]
//                         );
//                     }
//                 }

//                 const updatedAvailability = await t.one(
//                     'SELECT COUNT(*) AS ready_count FROM device_item WHERE device_id = $1 AND item_availability = $2',
//                     [device_id, 'ready']
//                 );

//                 await t.none(
//                     'UPDATE device SET device_availability = $1 WHERE device_id = $2',
//                     [updatedAvailability.ready_count, device_id]
//                 );
//             }

//             // อัปเดตจำนวนรวมของ item_quantity ในตาราง transaction
//             await t.none(
//                 'UPDATE transaction SET item_quantity = $1 WHERE transaction_id = $2',
//                 [totalItemQuantity, nextTransactionId]
//             );

//             // ส่งการแจ้งเตือนผ่าน Line Notify
//             const notifyMessage = `มีการขอยืมอุปกรณ์ใหม่แล้ว. User ID: ${user_id}, จำนวนรวม: ${totalItemQuantity}`;
//             await sendLineNotify(notifyMessage);

//             res.status(200).json({ 
//                 message: 'Loan request processed successfully', 
//                 totalItems: totalItemQuantity,
//                 transactionId: nextTransactionId
//             });
//         });
//     } catch (error) {
//         console.error('ERROR:', error);
//         if (!res.headersSent) {
//             res.status(500).json({ message: 'Error processing loan request' });
//         }
//     }
// });
// // confirm qrcode
// app.post('/confirm-loan', authenticateToken, async (req, res) => {
//     const { transaction_id } = req.body;
//     const user_id = req.user.id;
//     console.log('Transaction ID received for confirmation:', transaction_id);
//     console.log('User ID:', user_id);

//     try {
//         // ตรวจสอบว่ามี transaction_id นี้อยู่ในฐานข้อมูลหรือไม่
//         const transaction = await db.oneOrNone(
//             'SELECT transaction_id FROM transaction WHERE transaction_id = $1',
//             [transaction_id]
//         );

//         if (!transaction) {
//             return res.status(400).json({ message: 'Invalid transaction ID' });
//         }

//         // ตรวจสอบข้อมูลใน loan_detail โดยใช้ transaction_id และ user_id
//         const loanDetails = await db.any(
//             'SELECT * FROM loan_detail WHERE transaction_id = $1 AND user_id = $2',
//             [transaction_id, user_id]
//         );

//         if (loanDetails.length === 0) {
//             return res.status(400).json({ message: `No matching loan details found for Transaction ID: ${transaction_id} and User ID: ${user_id}` });
//         }

//         // อัปเดต loan_status และ transaction status
//         await db.tx(async t => {
//             const updateResult = await t.result(
//                 'UPDATE loan_detail SET loan_status = $1, item_availability_status = $2 WHERE transaction_id = $3 AND user_id = $4',
//                 ['approved', 'borrowed', transaction_id, user_id]
//             );

//             if (updateResult.rowCount === 0) {
//                 throw new Error('Failed to update loan status or no rows affected.');
//             }

//             for (const { item_id } of loanDetails) {
//                 await t.none(
//                     'UPDATE device_item SET item_availability = $1 WHERE item_id = $2',
//                     ['borrowed', item_id]
//                 );
//             }

//             await t.none(
//                 'UPDATE transaction SET loan_status = $1 WHERE transaction_id = $2',
//                 ['approve', transaction_id]
//             );
//         });

//         res.status(200).json({ message: 'Loan confirmed and status updated successfully' });
//     } catch (error) {
//         console.error('ERROR:', error);
//         if (!res.headersSent) {
//             res.status(500).json({ message: 'Error confirming loan' });
//         }
//     }
// });
