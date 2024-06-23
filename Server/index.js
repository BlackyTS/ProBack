const express = require ('express')
const bodyparser = require('body-parser')
const app = express()
const pgp = require('pg-promise')();
 
app.use(bodyparser.json())

const port = 8000

let users = []//เก็บ users
let counter = 1

const connectionOptions = {
  host: 'localhost',
  port: 5432,
  database: 'ProjectTEST',
  user: 'postgres',
  password: 'admin'
};

const db = pgp(connectionOptions);

app.get('/testdb', (req, res) => {
  db.any('SELECT * FROM users')
  .then((results) => {
      res.json(results);
  })
  .catch(error => {
      console.error('ERROR:', error);
      res.status(500).send('Error fetching users');
  });

})

app.get('/users', (req, res) => {
  /*let user = {
    firstname: 'test',
    lastname: 'lastname',
    email: 'email',
    password: 'password',
    overdue: 'date',
    role: 'role'
  }*/
  const filterUsers = users.map(user => {
    return{
      id: user.id,
      firstname: user.firstname,
      lastname: user.lastname,
      fullname: user.firstname + ' ' + user.lastname,
      email: user.email,
      role: user.role
    }
  })
  res.json(filterUsers)
  //res.json(users)
})

//path = POST /user
app.post('/users', (req, res) => {
  let user = req.body
  user.id = counter
  counter += 1
  users.push(user)
  res.json({
    message: 'add ok',
    user: user
  })
})

app.get('/users/:id', (req, res) => {
  let id = req.params.id
  let selectedIndex = users.findIndex(user => user.id == id)
  res.json(users[selectedIndex])
})

//path = PUT /user/:id
app.put('/users/:id', (req, res) =>{
  let id = req.params.id
  let updateUser = req.body
  //หา user จาก id
  let selectedIndex = users.findIndex(user => user.id == id)
  //update user
  users[selectedIndex].firstname = updateUser.firstname || users[selectedIndex].firstname
  users[selectedIndex].lastname = updateUser.lastname || users[selectedIndex].lastname
  users[selectedIndex].email = updateUser.email || users[selectedIndex].email
  users[selectedIndex].password = updateUser.password || users[selectedIndex].password
  users[selectedIndex].overdue = updateUser.overdue || users[selectedIndex].overdue
  users[selectedIndex].role = updateUser.role || users[selectedIndex].role
  //users ที่ update ใหม่ update กลับไปที่ users ตัวเดิม
  res.json({
    message: 'update user complete',
    data: {
      user: updateUser,
      indexUpdate: selectedIndex
    }
  })
})

//path = patch /user/:id
app.patch('/users/:id', (req, res) =>{
  let id = req.params.id
  let updateUser = req.body
  //หา user จาก id
  let selectedIndex = users.findIndex(user => user.id == id)
  //update user
  if(updateUser.firstname){
    users[selectedIndex].firstname = updateUser.firstname
  }
  if(updateUser.lastname){
    users[selectedIndex].lastname = updateUser.lastname
  }
  if(updateUser.email){
    users[selectedIndex].email = updateUser.email
  }
  if(updateUser.password){
    users[selectedIndex].password = updateUser.password
  }
  if(updateUser.overdue){
    users[selectedIndex].overdue = updateUser.overdue
  }
  if(updateUser.role){
    users[selectedIndex].role = updateUser.role
  }
  //users ที่ update ใหม่ update กลับไปที่ users ตัวเดิม
  res.json({
    message: 'update user complete',
    data: {
      user: updateUser,
      indexUpdate: selectedIndex
    }
  })
})

//path = delete /users/:id
app.delete('/users/:id', (req, res) => {
  let id = req.params.id
  let selectedIndex = users.findIndex(user => user.id == id)

  users.splice(selectedIndex, 1)

  res.json({
    message: 'delete complete!',
    indexDeleted: selectedIndex
  })
})

app.listen(port, (req, res) => {
  console.log('http server run at' + port)
})