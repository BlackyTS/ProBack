const axios = require('axios');

const sendLineNotifyClaim = async (message) => {
    const token = 'nEPKkeFONMJF9TYovAusO3oWSYeKoJCJflfTVogy0cU'; // ใช้ token จาก environment variable

    try {
        await axios.post('https://notify-api.line.me/api/notify', `message=${encodeURIComponent(message)}`, { 
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });
        console.log('Notification sent successfully.');
    } catch (error) {
        console.error('Error sending Line Notify:', error.response ? error.response.data : error.message);
    }
};

module.exports = { sendLineNotifyClaim };
