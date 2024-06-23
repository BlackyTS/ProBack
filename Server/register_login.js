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
let counter = 1

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

//Check users
app.get('/users', (req, res) => {
  db.any('SELECT * FROM users')
  .then((results) => {
      res.json(results);
  })
  .catch(error => {
      console.error('ERROR:', error)
      res.status(500).send('Error fetching users')
  })
})

//Register
app.post('/register', async (req, res) => {
    const { firstname, lastname, email, password, role } = req.body
    try {
        // Hash the password before storing it
        const hashedPassword = await bcrypt.hash(password, 10);

        // Insert the user into the database
        await db.none('INSERT INTO users(user_firstname, user_lastname,user_email, user_password, user_role) VALUES($1, $2, $3, $4, $5)', [firstname, lastname, email, hashedPassword, role])

        res.status(200).send('User registered successfully')
    } catch (error) {
        console.error('ERROR:', error)
        res.status(500).send('Error registering user')
    }
});

//Login
app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await db.one('SELECT * FROM users WHERE user_email = $1', [email])
        const match = await bcrypt.compare(password, user.user_password)
        if (match) {
            res.status(200).send('Login successful')
        } else {
            res.status(400).send('Invalid email or password')
        }
    } catch (error) {
        console.error('ERROR:', error);
        res.status(400).send('Invalid email or password')
    }
});








app.listen(port, (req, res) => {
    console.log('http server run at' + port)
})






