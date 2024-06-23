const pgp = require('pg-promise')()
const express = require ('express')
const bodyparser = require('body-parser')
const app = express()
const bcrypt = require('bcrypt')
const bodyParser = require('body-parser')
const jwt = require('jsonwebtoken')
const cookieParser = require('cookie-parser')
const session = require('express-session')
 
app.use(bodyparser.json())

const port = 8000

const connectionOptions = {
    host: 'localhost',
    port: 5432,
    database: 'ProjectTEST',
    user: 'postgres',
    password: 'admin'
}

const db = pgp(connectionOptions)
app.use(bodyParser.json());

//JWT function
const generateToken = (user) => {
    return jwt.sign({ id: user.user_id, email: user.user_email, role: user.user_role }, secret , { expiresIn: '72h' });
}

//Check JKTtoken
const authenticateToken = (req, res, next) => {
    const token = req.headers['authorization']
    if (token == null) return res.sendStatus(401)

    jwt.verify(token, 'your_jwt_secret', (err, user) => {
        if (err) return res.sendStatus(403)
        req.user = user
        next()
    })
}

//Check role user
const authorizeRole = (role) => {
    return (req, res, next) => {
        if (req.user.role !== role) {
            return res.sendStatus(403)
        }
        next();
    }
}








app.listen(port, (req, res) => {
    console.log('http server run at' + port)
})