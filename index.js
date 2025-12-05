require('dotenv').config()
const express = require('express')
const app = express()
const { MongoClient, ServerApiVersion } = require('mongodb');
const port = 3000

// Midleware
app.use(express.json())
app.use(cors())


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
