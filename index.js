require('dotenv').config()
const express = require('express')
const app = express()
const cors = require('cors')
const { MongoClient, ServerApiVersion } = require('mongodb');
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
      catch(er) {
        console.log(er)
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
