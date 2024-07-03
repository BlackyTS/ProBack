const pgp = require('pg-promise')();
const express = require('express');
const bcrypt = require('bcrypt');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const jwt = require('jsonwebtoken');
const cors = require('cors');
require('dotenv').config();

const app = express();
const port = 8000;
const secret = process.env.JWT_SECRET;

const corsOptions = {
    origin: 'http://localhost:3000',
    optionsSuccessStatus: 200
};
app.use(cors(corsOptions));
app.use(express.json());

const connectionOptions = {
    host: 'localhost',
    port: 5432,
    database: 'ProjectBack',
    user: 'postgres',
    password: 'nook2209'
};

const db = pgp(connectionOptions);

// JWT function
const generateToken = (user) => {
    return jwt.sign({ id: user.user_id, email: user.user_email, role: user.user_role }, secret, { expiresIn: '72h' });
};

// Middleware for JWT token authentication
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (token == null) {
        console.log('No token provided');
        return res.sendStatus(401); // No token provided
    }

    jwt.verify(token, secret, (err, user) => {
        if (err) {
            console.log('Token verification failed:', err);
            return res.sendStatus(403); // Invalid token
        }
        req.user = user; // Store the authenticated user in req.user
        next();
    });
};

// Middleware for role authorization
const authorizeRole = (role) => {
    return (req, res, next) => {
        if (req.user.role !== role) {
            console.log('User role does not match:', req.user.role);
            return res.sendStatus(403); // Role does not match
        }
        next();
    };
};

// Register route
app.post('/register', async (req, res) => {
    const { firstname, lastname, email, password, role } = req.body;
    try {
        // Hash the password before storing it
        const hashedPassword = await bcrypt.hash(password, 10);

        // Insert the user into the database
        await db.none('INSERT INTO users(user_firstname, user_lastname, user_email, user_password, user_role) VALUES($1, $2, $3, $4, $5)', [firstname, lastname, email, hashedPassword, role]);

        res.status(200).json({ message: 'User registered successfully' });
    } catch (error) {
        console.error('ERROR:', error);
        res.status(500).json({ message: 'Error registering user' });
    }
});

// Login route
app.post('/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        const user = await db.one('SELECT * FROM users WHERE user_email = $1', [email]);
        const match = await bcrypt.compare(password, user.user_password);
        if (match) {
            const token = generateToken(user);
            res.status(200).json({ token, message: 'Login successful' });
        } else {
            res.status(400).json({ message: 'Invalid email or password' });
        }
    } catch (error) {
        console.error('ERROR:', error);
        res.status(400).json({ message: 'Invalid email or password' });
    }
});

// Other routes...

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
