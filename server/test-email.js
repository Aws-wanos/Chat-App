const nodemailer = require('nodemailer');
require('dotenv').config();

// Create a test transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'sluty.whore124@gmail.com', // Replace with your email
    pass: 'dudy fwmi dvsr lwuv' // Replace with your app password (with or without spaces)
  }
});

// Test email
const mailOptions = {
  from: 'sluty.whore124@gmail.com',
  to: 'aws.wanos@gmail.com', // Send to yourself for testing
  subject: 'Test Email from Nodemailer',
  text: 'If you received this, the app password works!'
};

// Send test
transporter.sendMail(mailOptions, (error, info) => {
  if (error) {
    console.log('❌ Error:', error);
  } else {
    console.log('✅ Email sent:', info.response);
  }
});