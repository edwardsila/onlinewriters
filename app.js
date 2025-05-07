// Add this at the very top of the file, before other requires
// This ensures environment variables are loaded early
/**if (process.env.NODE_ENV !== 'production') {
  try {
    require('dotenv').config();
  } catch (e) {
    console.log('Using built-in env-file functionality instead of dotenv');
    // Node.js will use --env-file flag if provided
  }
}
**/
require('dotenv').config();





const express = require('express');
const http = require("http");
const axios = require("axios");
const stkRoutes = require("./routes/stk.routes");
const fs = require("fs");
const cors = require('cors');
const MongoStore = require('connect-mongo');
const session = require('express-session');
const mongoose = require('mongoose');

const router = require('./router.js');
const updateUser = require('./middleware/login.js');


const app = express();

let port = process.env.PORT;
const uri = process.env.uri;
const date = new Date();
const timestamp =
  date.getFullYear() +
  ("0" + (date.getMonth() + 1)).slice(-2) +
  ("0" + date.getDate()).slice(-2) +
  ("0" + date.getHours()).slice(-2) +
  ("0" + date.getMinutes()).slice(-2) +
  ("0" + date.getSeconds()).slice(-2);


const shortcode = process.env.MPESA_PAYBILL;
const passkey = process.env.MPESA_PASSKEY;
const password = Buffer.from(shortcode + passkey + timestamp).toString("base64");

// Add this after app initialization to debug environment variables
console.log('Environment variables loaded:');
console.log('- mpesa_callback_url:', process.env.mpesa_callback_url);
console.log('- mpesa_shortcode:', process.env.MPESA_PAYBILL);
console.log('-mpesa passkey:', process.env.MPESA_PASSKEY);
console.log('-password:', process.env.MPESA_PASSKEY);


app.set('trust proxy', true);


if (!process.env.session_secret) {
  throw new Error('Missing session_secret in environment variables');
}

app.use(express.urlencoded({ extended: true }));

// Configure session middleware with MongoDB store
app.use(session({
    secret: process.env.session_secret,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: process.env.uri, // Your MongoDB connection string
        collectionName: 'sessions', // Optional: specify a collection name for sessions
        ttl: 14 * 24 * 60 * 60 // = 14 days. Default
    })
}));

app.use(cors({ origin: '*' }));

app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));



app.set('view engine', 'ejs');

//app.get("/tooken", (req, res) => {
  //generateToken();
//});

const generateToken = async (req, res, next) => {

  const secret = process.env.MPESA_SECRET;
  const consumer = process.env.MPESA_CONSUMER_KEY;

  const auth = Buffer.from(`${consumer}:${secret}`).toString("base64");
  await axios
    .get("https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials", {
      headers: {
        Authorization: `Basic ${auth}`,
      },
    }
  ).then((response)=>{
    //console.log(response.data.access_token);
    token = response.data.access_token;
    next();
  }).catch((err) => {
    console.log(err);
    //res.status(400).json(err.message);
  });
};


app.use(updateUser);
//middleware function to generate token
app.post("/stk", generateToken, async (req, res) => {
  const phone = req.body.phone.substring(1);
  const amount = req.body.amount;

  await axios.post(
    "https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest",
    {    
      "BusinessShortCode": shortcode,   
      "Password": password,    
      "Timestamp": timestamp,    
      "TransactionType": "CustomerPayBillOnline",   // "CustomerBuyGoodsOnline",
      "Amount": amount,    
      "PartyA":`254${phone}`,    
      "PartyB":shortcode,
      "PhoneNumber":`254${phone}`,    
      "CallBackURL": "https://c04f-102-212-11-46.ngrok-free.app/callback",     
      "AccountReference":`254${phone}`,    
      "TransactionDesc":"Test"
   },
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  ).then((data) => {
    console.log(data.data);
    res.status(200).json(data.data);
  }).catch((err) => {
    console.log(err.message);
    res.status(400).json(err.message)})
});


app.post("/callback", (req, res) => {
  const paymentData = req.body;
  const { ResultCode, ResultDesc, CheckoutRequestID } = paymentData.Body.stkCallback;

  if (ResultCode === 0) {
      // Payment was successful
      console.log(`Payment successful for CheckoutRequestID: ${CheckoutRequestID}`);
      // Update your database with payment status and reference
  } else {
      // Payment failed or was cancelled
      console.log(`Payment failed: ${ResultDesc}`);
  }

  res.status(200).send('Received');
});

app.get('/payment-status', async (req, res) => {
  const reference = req.query.reference;

  // Here you need to implement logic to check payment status with Mpesa
  try {
    // Call Mpesa API to check payment status using reference
    const paymentStatus = await checkPaymentStatus(reference);

    if (paymentStatus === 'success') {
      res.json({ status: 'success' });
    } else {
      res.json({ status: 'failed' });
    }
  } catch (err) {
    console.error('Error fetching payment status:', err);
    res.status(500).json({ status: 'error', message: 'Failed to check payment status' });
  }
});


// Define the checkPaymentStatus function (mock or actual API call)
async function checkPaymentStatus(reference) {
  const accessToken = await generateToken();

  const payload = {
      Shortcode: shortcode,
      CheckoutRequestID: reference // The reference is usually passed in the callback
  };

  const response = await axios.post(`${mpesaUrl}/mpesa/stkpushquery/v1/query`, payload, {
      headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
      }
  });

  if (response.data.ResponseCode === '0') {
      console.log('Payment Successful!');
      return 'success';
  } else {
      console.log('Payment Failed!');
      return 'failed';
  }
}

router(app);



mongoose.connect(uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(result => {
    app.listen(port, () => {
        console.log('app listening on http://127.0.0.1:' + port);
    });
}).catch(err => {
    console.log(err);
});
