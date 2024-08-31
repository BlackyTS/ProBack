const pgp = require('pg-promise')();
const connectionOptions = {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    connectionTimeoutMillis: 5000, // 5 วินาที
};

const db = pgp(connectionOptions);

module.exports = { db };
