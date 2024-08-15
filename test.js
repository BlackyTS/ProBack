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
