require('dotenv').config()
const express = require('express')
const app = express()
const cors = require('cors')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const admin = require("firebase-admin");
const port = 3000

// Midleware
app.use(express.json())
app.use(cors())



//firebase sdk 
const serviceAccount = require('./contesthub-firebase-adminsdk.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

// Verify firebase toekn 
const verifyFbToken = async (req, res, next) => {
  const accessToken = req.headers.authorization;
  const token = accessToken.split(' ')[1];
  if (!token) return res.status(401).send({ message: 'Unauthorized Access!' });

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.tokenEmail = decoded.email;
    next()
  }
  catch (er) {
    console.log(er)
    return res.status(401).send({ message: 'Unauthorized Access!', err })
  }
}


// mongodb client and uri
const uri = process.env.DATA_BASE_URI;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});


//api function 
async function run() {
  try {
    await client.connect();

    const db = client.db('contestHub-db');
    const userCollection = db.collection('users')
    const contestCollection = db.collection('contests')



    // insert user data in database
    app.post('/user', async (req, res) => {
      try {
        const userData = req.body;
        userData.role = 'user',
          userData.createdAt = new Date();
        const result = await userCollection.insertOne(userData);
        res.json(result)
      }
      catch (er) {
        console.log(er)
        res.json(er)
      }
    })


    /* ------------------------ CREATOR SECTION ALL API HERE --------------------------  */

    //Add contest api 
    app.post('/add-contest', async (req, res) => {
      try {
        const contestData = req.body;
        contestData.status = 'pending'
        contestData.participantsCount = 0;
        contestData.winner = null;
        contestData.createdAt = new Date()
        const result = await contestCollection.insertOne(contestData);
        res.json(result)
      }
      catch (er) {
        console.log(er)
        res.json(er)
      }
    })

    // get contest for my contest page 
    app.get('/my-contest', async (req, res) => {
      try {
        const email = req.query.email;
        const query = { creatorEmail: email };
        const result = await contestCollection.find(query).toArray();
        res.json(result)
      }
      catch (er) {
        console.log(er)
        res.json(er)
      }
    })

    // get contest for edit and update 
    app.get('/edit-contest/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await contestCollection.findOne(query);
        res.json(result);
      }
      catch (er) {
        console.log(er);
        res.json(er);
      }
    })

    // update and edit contest information 
    app.patch('/contest-update/:contestId', async (req, res) => {
      const contestId = req.params.contestId;
      const updateData = req.body;
      const query = { _id: new ObjectId(contestId) }
      const updateDoc = {
        $set: updateData
      }

      const result = await contestCollection.updateOne(query, updateDoc);
      res.json(result);
    })

    //DELETE CONTEST API 
    app.delete('/delete-contest/:deleteId', async (req, res) => {
      try {
        const deleteId = req.params.deleteId;
        const query = { _id: new ObjectId(deleteId) };
        const result = await contestCollection.deleteOne(query);
        res.json(result);
      }
      catch(er){
        console.log(er);
        res.json(er)
      }
    })




    /* ------------------------ ADMIN SECTION ALL API HERE --------------------------  */

    // GET USER DATA FOR MANAGE USER  
    app.get('/manage-user',async(req,res) => {
      try{

        const result = await userCollection.find().toArray();
        res.json(result)
      }
      catch(er){
        console.log(er)
        res.json(er)
      }
    });

    // CHANGE USER ROLE BY ADMIN 
    app.patch('/change-role/:id',async(req,res) => {
      try{
        const id = req.params.id;
        const {role} = req.body;
        const query = {_id: new ObjectId(id)};

        const updateDoc = {
          $set: {
            role: role
          }
        }

        const result = await userCollection.updateOne(query,updateDoc);
        res.json(result);
      }
      catch(er){
        console.log(er);
        res.json(er)
      }
    })

    // GET ALL  CONTEST FOR  Confirm | Reject | Delete
    app.get('/pending-allcontest',async(req,res) => {
      try{
        
        const result = await contestCollection.find().toArray();
        res.json(result);
      }
      catch(er){
        console.log(er);
        res.json(er)
      }
    }) 

    // UPDATE CONTEST STATUS BY ADMIN
    app.patch('/update-contest-status/:statusId',async(req,res) => {
      try{
        const statusId = req.params.statusId;
        const {status} = req.body
        const query = {_id: new ObjectId(statusId)};
        const updateDoc = {
          $set:{
            status:status
          }
        }

        const result = await contestCollection.updateOne(query,updateDoc);
        res.json(result);
      }
      catch(er){
        console.log(er);
        res.json(er)
      }
    })


    // Role Releted api here 
    app.get('/role-check', async (req, res) => {
      try {
        const email = req.query.email;
        const query = { email };
        const result = await userCollection.findOne(query);
        res.json({ role: result?.role })
      }
      catch (er) {
        console.log(er);
        res.json(er)
      }
    })

    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {

  }
}
run().catch(console.dir);


app.get('/', (req, res) => {
  res.send('Hello World!')
})

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})
