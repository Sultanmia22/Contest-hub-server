require('dotenv').config()
const express = require('express')
const app = express()
const cors = require('cors')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const admin = require("firebase-admin");
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)
const port = 3000


// Midleware
app.use(express.json())
app.use(cors())



//firebase sdk 
const decoded = Buffer.from(process.env.FB_SERVICE_KEY, 'base64').toString('utf8')
const serviceAccount = JSON.parse(decoded);
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
    return res.status(401).send({ message: 'Unauthorized Access!', er })
  }
}


// mongodb client and uri
const uri = process.env.DATA_BASE_URI;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: false,
    deprecationErrors: true,
  }
});


//api function 
async function run() {
  try {
    // await client.connect();

    const db = client.db('contestHub-db');
    const userCollection = db.collection('users')
    const contestCollection = db.collection('contests')
    const perticipantCollection = db.collection('perticipants')


    /* ------------ ADMIN , CREATOR AND USER ROLE HERE  */
    const verifyAdminRole = async (req, res, next) => {
      try {
        const email = req.tokenEmail;
        const user = await userCollection.findOne({ email })
        if (!user) return res.status(404).json({ message: 'User not found' });

        if (user?.role !== 'admin') {
          return res.status(403).json({ message: 'Admin only Actions!' })
        }
        next()
      }
      catch (er) {
        console.log(er)
        return res.status(500).json({ message: 'Server error', err });
      }
    }

    const verifyCreator = async (req, res, next) => {
      try {
        const email = req.tokenEmail;
        const user = await userCollection.findOne({ email })
        if (!user) return res.status(404).json({ message: 'User not found' });

        if (user?.role !== 'creator') {
          return res.status(403).json({ message: 'Admin only Actions!' })
        }
        next()
      }
      catch (er) {
        console.log(er)
        return res.status(500).json({ message: 'Server error', err });
      }
    }

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


    /* ------------------------ USER SECTION ALL API HERE --------------------------  */
    // popular secation data releted api;
    app.get('/popular-data', async (req, res) => {
      try {
        const contestType = req.query.contestType;
        let query = { status: 'confirmed' }

        if (contestType && contestType !== 'All') {
          query = { status: 'confirmed', contestType }
        }


        const result = await contestCollection.find(query).sort({ participantsCount: -1 }).limit(5).toArray()
        res.json(result)
      }
      catch (er) {
        console.log(er)
        res.status(500).json({ message: 'Server error' })
      }
    })


    // all contest
    app.get('/all/contest', async (req, res) => {
      try {
        const contestType = req.query.contestType;
        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const skip = (page - 1) * limit;

        let query = { status: 'confirmed' };

        if (contestType && contestType !== 'All') {
          query.contestType = contestType;
        }

        const contests = await contestCollection
          .find(query)
          .sort({ participantsCount: -1 })
          .skip(skip)
          .limit(limit)
          .toArray();

        const total = await contestCollection.countDocuments(query);

        res.json({
          contests,
          total,
          totalPages: Math.ceil(total / limit),
          currentPage: page
        });
      } catch (er) {
        console.log(er);
        res.status(500).json({ message: 'Server error' });
      }
    });


    /*  app.get('/all/contest', async (req, res) => {
       try {
         const contestType = req.query.contestType;
         let query = { status: 'confirmed' }
 
         if (contestType && contestType !== 'All') {
           query = { status: 'confirmed', contestType }
         }
 
 
         const result = await contestCollection.find(query).sort({ participantsCount: -1 }).toArray()
         res.json(result)
       }
       catch (er) {
         console.log(er)
         res.status(500).json({ message: 'Server error' })
       }
     }) */


    // Get Contest type 
    app.get('/all-type', async (req, res) => {
      try {
        const result = await contestCollection.distinct('contestType');
        res.json(result)
      }
      catch (er) {
        console.log(er)
        res.status(500).json({ message: 'Server Error' })
      }
    })




    // GET DATA FOR DETAILS PAGE 
    app.get('/deltails/contest/:detailsId', async (req, res) => {
      try {
        const detailsId = req.params.detailsId;
        const query = { _id: new ObjectId(detailsId) };
        const result = await contestCollection.findOne(query);
        res.json(result);
      }
      catch (er) {
        console.log(er)
        res.status(500).json({ message: 'Server error' })
      }
    })

    // PAYMENT API 
    app.post('/create-checkout-session', async (req, res) => {
      try {
        const paymentInfo = req.body;
        const session = await stripe.checkout.sessions.create({
          line_items: [
            {
              price_data: {
                currency: 'USD',
                unit_amount: Number(paymentInfo.entryPrice) * 100,
                product_data: {
                  name: paymentInfo.constestName,
                  images: paymentInfo.contestImage ? [paymentInfo.contestImage] : [],
                }
              },
              quantity: 1,
            },
          ],
          mode: 'payment',
          customer_email: paymentInfo.perticipantEmail,
          metadata: {
            contestId: paymentInfo.contestId,
            creatorEmail: paymentInfo.creatorEmail,
            perticipantEmail: paymentInfo.perticipantEmail,
            perticipantName: paymentInfo.perticipantName,
            createdAt: paymentInfo.createdAt,
          },
          success_url: `${process.env.CLIENT_DOMAIN_SITE}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${process.env.CLIENT_DOMAIN_SITE}/payment-cancel`,
        });
        res.json({ url: session.url })
      }

      catch (er) {
        console.log(er)
        res.status(500).json({ message: 'Server Error' })
      }
    });


    // POST INFORMATION FROM PAYMENT HISTORY AFTER PAYMENT
    app.post('/payment-success', async (req, res) => {
      try {
        const { sessionId } = req.body;
        const session = await stripe.checkout.sessions.retrieve(sessionId);


        // update perticipant Count 
        const contestId = session.metadata.contestId
        const queryContestId = { _id: new ObjectId(contestId) }
        const updatePerticipantCount = {
          $inc: {
            participantsCount: 1
          },

          $addToSet: {
            perticipants: {
              email: session.metadata.perticipantEmail,
              status: session.payment_status
            },
          }
        }
        const updateCount = await contestCollection.updateOne(queryContestId, updatePerticipantCount)

        const paymentData = {
          transactionId: session.payment_intent,
          createdAt: session.metadata.createdAt,
          amount: session.amount_total / 100,
          creatorEmail: session.metadata.creatorEmail,
          perticipantEmail: session.metadata.perticipantEmail,
          perticipantName: session.metadata.perticipantName,
          paymentStatus: session.payment_status,
          contestId: session.metadata.contestId,
        }

        const perticipantResult = await perticipantCollection.insertOne(paymentData)

        res.json({ transactionId: session.payment_intent, createdAt: session.metadata.createdAt, amount: session.amount_total / 100, id: session.metadata.contestId })
      }
      catch (er) {
        console.log(er);
        res.status(500).json({ message: 'Server Error' });
      }
    })


    // MY PERTICIPENT contest
    app.get('/my-perticipantContest', async (req, res) => {
      try {
        const perticipantEmail = req.query.perticipantEmail;
        const query = { "perticipants.email": perticipantEmail }
        const contests = await contestCollection.find(query).sort({ deadline: 1 }).toArray()
        const filterContest = contests.map(contest => ({
          ...contest,
          perticipants: contest.perticipants.filter(p => p.email === perticipantEmail)
        }))
        res.json(filterContest);
      }
      catch (er) {
        console.log(er);
        res.status(500).json({ message: 'Server Error' });
      }
    })


    // GET PERTICIPANT INFO CONTEST API 
    app.get('/payment-status', async (req, res) => {
      try {
        const { contestId, perticipantEmail } = req.query;

        const query = { contestId, perticipantEmail, paymentStatus: "paid" }

        const ispaid = await perticipantCollection.findOne(query);

        res.json({ paid: !!ispaid })
      }
      catch (er) {
        console.log(er)
      }
    })


    // SUBMIT TASK store database
    app.post('/submit-task', async (req, res) => {
      try {
        const { contestId, perticipantEmail } = req.query;
        const { submitedInfo, submitLink } = req.body;
        const query = { contestId, perticipantEmail };

        const updateDoc = {
          $set: {
            perticipantContent: {
              submitedInfo,
              submitLink,
            },
            submitedDate: new Date().toISOString()
          }
        }

        const result = await perticipantCollection.updateOne(query, updateDoc)
        res.json(result);
      }
      catch (er) {
        console.log(er)
        res.status(500).json({ message: 'Server Error' })
      }
    });


    // My Winning Contest 
    app.get('/winning-contests', async (req, res) => {
      try {
        const { winningEmail } = req.query;
        const query = { winner: winningEmail }
        const result = await contestCollection.find(query).toArray();

        res.json(result)
      }
      catch (er) {
        console.log(er)
        res.status(500).json({ message: 'Server Error' })
      }
    });


    // Update profile image 
    app.patch('/update-profileImg', async (req, res) => {
      try {
        const { userEmail } = req.query;
        const { imageURL } = req.body;
        const query = { email: userEmail }

        const updateDoc = {
          $set: {
            image: imageURL
          }
        }

        const result = await userCollection.updateOne(query, updateDoc)
        res.json(result)
      }
      catch (er) {
        console.log(er)
        res.status(500).json({ message: 'Server Error' })
      }
    })


    // Update information 
    app.patch('/updateinfo', verifyFbToken, async (req, res) => {
      try {
        const { email } = req.query;
        const { name, bio, address } = req.body;
        const query = { email };
        const updateDoc = {
          $set: {
            name: name,
            bio: bio,
            address: address,
          }
        }

        const result = await userCollection.updateOne(query, updateDoc);
        res.json(result)
      }
      catch (er) {
        console.log(er);
        res.status(500).json({ message: 'Server Error' })
      }
    })


    // get profile information 
    app.get('/profileInfo', verifyFbToken, async (req, res) => {
      try {
        const { email } = req.query;
        const query = { email };
        const result = await userCollection.findOne(query);
        res.json(result)
      }
      catch (er) {
        console.log(er);
        res.status(500).json({ message: 'Server Error' })
      }
    })

    // total Perticipant 
    app.get('/total-participant', async (req, res) => {
      try {
        const { email } = req.query;
        const query = { perticipantEmail: email };
        const result = await perticipantCollection.find(query).toArray()
        res.json(result)
      }
      catch (er) {
        console.log(er)
        res.status(500).json({ message: 'Server Error' });
      }
    })


    // total Perticipant 
    app.get('/total-win', async (req, res) => {
      try {
        const { email } = req.query;
        const query = { winner: email };
        const result = await contestCollection.find(query).toArray()
        res.json(result)
      }
      catch (er) {
        console.log(er)
        res.status(500).json({ message: 'Server Error' });
      }
    })

    // Leaderboad api 
    app.get('/leaderboard', async (req, res) => {
      try {
        const leaderboard = await perticipantCollection.aggregate([
          { $match: { winner: true } }, 
          {
            $group: {
              _id: "$perticipantEmail",       
              name: { $first: "$perticipantName" },
              wins: { $sum: 1 }              
            }
          },
          { $sort: { wins: -1 } } 
        ]).toArray();

        res.json(leaderboard);
      } catch (err) {
        console.log(err);
        res.status(500).json({ message: "Server Error" });
      }
    });


    // Search Contest 
    app.get('/searchContest',async(req,res) => {
      try{
        const {type} = req.query;
        const query = {contestType: {$regex:type,$options:'i'}}
        const result = await contestCollection.find(query).toArray();
        res.json(result);
      }
      catch(er){
        console.log(er)
        res.status(500).json({message:'Server Error'});
      }
    })





    /* ------------------------ CREATOR SECTION ALL API HERE --------------------------  */

    //Add contest api 
    app.post('/add-contest', verifyFbToken, verifyCreator, async (req, res) => {
      try {
        const contestData = req.body;
        contestData.status = 'pending'
        contestData.participantsCount = 0;
        contestData.winner = null;
        contestData.createdAt = new Date().toISOString()
        contestData.perticipants = []
        const result = await contestCollection.insertOne(contestData);
        res.json(result)
      }
      catch (er) {
        console.log(er)
        res.json(er)
      }
    })

    // get contest for my contest page 
    app.get('/my-contest', verifyFbToken, verifyCreator, async (req, res) => {
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
    app.get('/edit-contest/:id', verifyFbToken, verifyCreator, async (req, res) => {
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
    app.patch('/contest-update/:contestId', verifyFbToken, verifyCreator, async (req, res) => {
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
    app.delete('/delete-contest/:deleteId', verifyFbToken, verifyCreator, async (req, res) => {
      try {
        const deleteId = req.params.deleteId;
        const query = { _id: new ObjectId(deleteId) };
        const result = await contestCollection.deleteOne(query);
        res.json(result);
      }
      catch (er) {
        console.log(er);
        res.json(er)
      }
    })

    // GET ALL SUBMITED TASK AND INFO 
    app.get('/all-submit-task', verifyFbToken, verifyCreator, async (req, res) => {
      try {
        const { creatorEmail } = req.query;
        const query = { creatorEmail: creatorEmail };
        const result = await perticipantCollection.find(query).toArray()
        res.json(result)
      }
      catch (er) {
        console.log(er)
        res.status(500).json({ message: 'Server Error' })
      }
    })

    // Declare winner
    app.patch('/declare-winner', verifyFbToken, verifyCreator, async (req, res) => {
      try {
        const { contestId, creatorEmail } = req.query;
        const { perticipant } = req.body;
        const query = { contestId, creatorEmail }
        const contestQuery = { _id: new ObjectId(contestId) }

        const contest = await contestCollection.findOne(contestQuery)
        if (contest.winner !== null) {
          return res.json({ winnerDeclared: true })
        }

        const winnerUpdate = {
          $set: {

            winner: perticipant
          }
        }

        const setWinner = await contestCollection.updateOne(contestQuery, winnerUpdate)

        const updateDoc = {
          $set: {
            winner: true,
            winnerSetAt: new Date()
          }
        }

        const result = await perticipantCollection.updateOne(query, updateDoc)
        res.json(result)
      }
      catch (er) {
        console.log(er)
        res.status(500).json({ message: 'Server Error' })
      }
    })



    /* ------------------------ ADMIN SECTION ALL API HERE --------------------------  */

    // GET USER DATA FOR MANAGE USER  
    app.get('/manage-user', verifyFbToken, verifyAdminRole, async (req, res) => {
      try {
        const result = await userCollection.find().toArray();
        res.json(result)
      }
      catch (er) {
        console.log(er)
        return res.status(500).json({ message: 'Server error' });
      }
    });

    // CHANGE USER ROLE BY ADMIN 
    app.patch('/change-role/:id', verifyFbToken, verifyAdminRole, async (req, res) => {
      try {
        const id = req.params.id;
        const { role } = req.body;
        const query = { _id: new ObjectId(id) };

        const updateDoc = {
          $set: {
            role: role
          }
        }

        const result = await userCollection.updateOne(query, updateDoc);
        res.json(result);
      }
      catch (er) {
        console.log(er);
        return res.status(500).json({ message: 'Server error' });
      }
    })

    // GET ALL  CONTEST FOR  Confirm | Reject | Delete
    app.get('/pending-allcontest', verifyFbToken, verifyAdminRole, async (req, res) => {
      try {

        const result = await contestCollection.find().toArray();
        res.json(result);
      }
      catch (er) {
        console.log(er);
        return res.status(500).json({ message: 'Server error' });
      }
    })

    // UPDATE CONTEST STATUS BY ADMIN
    app.patch('/update-contest-status/:statusId', verifyFbToken, verifyAdminRole, async (req, res) => {
      try {
        const statusId = req.params.statusId;
        const { status } = req.body
        const query = { _id: new ObjectId(statusId) };
        const updateDoc = {
          $set: {
            status: status
          }
        }

        const contest = await contestCollection.findOne(query);

        if (contest.status === "approved") {
          return res.status(403).json({ message: "Cannot edit an approved contest" });
        }

        const result = await contestCollection.updateOne(query, updateDoc);
        res.json(result);
      }
      catch (er) {
        console.log(er);
        return res.status(500).json({ message: 'Server error' });
      }
    })

    // DELETE CONTEST API BY ADMIN
    app.delete('/contest/delete-by-admin/:deleteId', verifyFbToken, verifyAdminRole, async (req, res) => {
      try {
        const deleteId = req.params.deleteId;
        const query = { _id: new ObjectId(deleteId) }
        const result = await contestCollection.deleteOne(query);
        res.json(result);
      }
      catch (er) {
        console.log(er)
        return res.status(500).json({ message: 'Server error' });
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
        return res.status(500).json({ message: 'Server error' });
      }
    })



    // await client.db("admin").command({ ping: 1 });
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
