app.post('/devices/add', authenticateToken, async (req, res) => {
    const { name, description, limit } = req.body;
    try {
        // เพิ่มอุปกรณ์เข้าในตาราง device โดยไม่ต้องระบุ device_id
        const result = await db.one(
            'INSERT INTO device(device_name, device_description, device_limit, device_availability) VALUES($1, $2, $3, $4) RETURNING device_id',
            [name, description, limit, limit]
        );

        const deviceId = result.device_id;

        // เพิ่มรายการอุปกรณ์ใน device_items
        for (let i = 1; i <= limit; i++) {
            await db.none(
                'INSERT INTO device_items(item_name, item_description, device_id, item_availability) VALUES($1, $2, $3, $4)',
                [`Item ${i}`, description, deviceId, 'ready']
            );
        }
        
        res.status(200).json({ message: 'Device and items added successfully' });
    } catch (error) {
        console.error('ERROR:', error);
        res.status(500).json({ message: 'Error adding device and items' });
    }
});


app.put('/device/update', authenticateToken, async (req, res) => {
    const { id, name, limit, description, approve } = req.body;

    try {
        // ดึงข้อมูลปัจจุบันของอุปกรณ์จากฐานข้อมูล
        const device = await db.one('SELECT device_limit, device_availability FROM device WHERE device_id = $1', [id]);

        // คำนวณความแตกต่างของ limit
        const limitDifference = limit - device.device_limit;

        // อัพเดตค่า limit, availability และ approve ในตาราง device
        await db.none(
            'UPDATE device SET device_name = $1, device_limit = $2, device_availability = device_availability + $3, device_approve = $4 WHERE device_id = $5',
            [name, limit, limitDifference, approve, id]
        );

        // ถ้าจำนวน limit เพิ่มขึ้น, เพิ่มรายการใหม่ใน device_items
        if (limitDifference > 0) {
            for (let i = device.device_limit + 1; i <= limit; i++) {
                await db.none(
                    'INSERT INTO device_items (item_name, item_description, item_availability, device_id) VALUES($1, $2, $3, $4)',
                    [`${name} ${i}`, description, 'ready', id]
                );
            }
        } 
        // ถ้าจำนวน limit ลดลง, ลบรายการใน device_items
        else if (limitDifference < 0) {
            for (let i = device.device_limit; i > limit; i--) {
                await db.none('DELETE FROM device_items WHERE device_id = $1 AND item_name = $2', [id, `Item ${i}`]);
            }
        }

        res.status(200).json({ message: 'Device updated successfully' });
    } catch (error) {
        console.error('ERROR:', error);
        res.status(500).json({ message: 'Error updating device' });
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

app.post('/loan', authenticateToken, async (req, res) => {
    const { device_ids, quantities } = req.body;
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

        // กำหนดวันที่ครบกำหนดเป็น 7 วันหลังจากวันที่ยืม
        const loan_date = new Date();
        const due_date = new Date(loan_date);
        due_date.setDate(loan_date.getDate() + 7);

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
