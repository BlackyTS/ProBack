const pgp = require('pg-promise')();
const connectionOptions = {
    host: 'localhost',
    port: 5432,
    database: 'ProjectTEST',
    user: 'postgres',
    password: 'admin'
};

const db = pgp(connectionOptions);

module.exports = db;