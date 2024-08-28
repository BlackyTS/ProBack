const { db } = require('./Config/db'); // ใช้ข้อมูลการเชื่อมต่อที่ถูกต้อง
const { sendLineNotifyReturn } = require('./Function/nontify_return');

// ฟังก์ชันเพื่อจัดรูปแบบวันที่เป็น MM/DD/YY
const formatDate = (date) => {
    const month = (`0${date.getMonth() + 1}`).slice(-2); // เดือน
    const day = (`0${date.getDate()}`).slice(-2); // วัน
    const year = date.getFullYear().toString().slice(-4); // ปี 2 หลัก
    return `${day}/${month}/${year}`;
};

const getLoanDetails = async () => {
    try {
        // ดึงข้อมูลการยืมที่ยังไม่ได้คืน
        return await db.any(`
            SELECT user_id, due_date 
            FROM transaction
            WHERE return_date IS NULL AND due_date >= CURRENT_DATE
            AND loan_status NOT IN ('deny', 'cancel')
        `);
    } catch (error) {
        console.error('Error fetching loan details:', error);
        throw error;
    }
};

const checkDueDates = async () => {
    try {
        const loans = await getLoanDetails();
        const today = new Date();
        const threeDaysLater = new Date();
        threeDaysLater.setDate(today.getDate() + 3);

        for (const loan of loans) {
            const dueDate = new Date(loan.due_date);

            if (dueDate <= threeDaysLater && dueDate > today) {
                const formattedDate = formatDate(dueDate);
                const message = `User ID: ${loan.user_id} จะต้องคืนอุปกรณ์ก่อนวันที่ ${formattedDate} ก่อนเวลา 16.00 น.`;
                await sendLineNotifyReturn(message);
            }
        }
    } catch (error) {
        console.error('Error checking due dates or sending notifications:', error);
    }
};

module.exports = { checkDueDates };
