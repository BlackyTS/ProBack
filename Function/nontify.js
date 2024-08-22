const axios = require('axios');

const sendLineNotify = async (message) => {
    const token = 'ioEwXsnx8kBUME2XXuZMXybRUrfOTsZi8X3H4AlioI6'; // แทนที่ด้วย token ของคุณ

    try {
        await axios.post('https://notify-api.line.me/api/notify', `message=${encodeURIComponent(message)}`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });
    } catch (error) {
        console.error('Error sending Line Notify:', error);
    }
};

module.exports = { sendLineNotify };
