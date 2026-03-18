const nodemailer = require('nodemailer');
require('dotenv').config();

// Create transporter with your working configuration
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Verify transporter connection on startup
transporter.verify((error, success) => {
  if (error) {
    console.log('❌ Email transporter error:', error);
  } else {
    console.log('✅ Email server is ready to send messages');
  }
});

// Send verification email
const sendVerificationEmail = async (email, token, username) => {
  const verificationUrl = `http://localhost:5000/api/auth/verify/${token}`;
  
  const mailOptions = {
    from: `"Chat App" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: 'Verify Your Email - Chat App',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: Arial, sans-serif; margin: 0; padding: 0; background-color: #f4f4f4;">
        <div style="max-width: 600px; margin: 20px auto; background: white; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); overflow: hidden;">
          
          <!-- Header -->
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 28px;">Welcome to Chat App!</h1>
          </div>
          
          <!-- Content -->
          <div style="padding: 40px 30px; text-align: center;">
            <p style="color: #666; font-size: 16px; margin-bottom: 20px;">Hi <strong>${username}</strong>,</p>
            <p style="color: #666; font-size: 16px; margin-bottom: 30px;">Thanks for signing up! Please verify your email address to start using Chat App.</p>
            
            <!-- Button -->
            <a href="${verificationUrl}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; padding: 15px 40px; border-radius: 30px; font-size: 16px; font-weight: bold; margin-bottom: 30px;">Verify Email Address</a>
            
            <p style="color: #999; font-size: 14px; margin-bottom: 10px;">Or copy this link:</p>
            <p style="color: #667eea; font-size: 12px; word-break: break-all; background: #f8f9fa; padding: 10px; border-radius: 5px;">${verificationUrl}</p>
          </div>
          
          <!-- Footer -->
          <div style="background: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid #e0e0e0;">
            <p style="color: #999; font-size: 12px; margin: 0;">This link will expire in 24 hours.</p>
            <p style="color: #999; font-size: 12px; margin: 5px 0 0;">If you didn't create an account, please ignore this email.</p>
          </div>
        </div>
      </body>
      </html>
    `
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Verification email sent to:', email);
    console.log('📧 Message ID:', info.messageId);
    return info;
  } catch (error) {
    console.error('❌ Error sending verification email:', error);
    throw error;
  }
};

// Send password reset email
const sendPasswordResetEmail = async (email, token, username) => {
  const resetUrl = `http://localhost:3000/reset-password/${token}`;
  
  const mailOptions = {
    from: `"Chat App" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: 'Reset Your Password - Chat App',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: Arial, sans-serif; margin: 0; padding: 0; background-color: #f4f4f4;">
        <div style="max-width: 600px; margin: 20px auto; background: white; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); overflow: hidden;">
          
          <!-- Header -->
          <div style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); padding: 30px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 28px;">Password Reset Request</h1>
          </div>
          
          <!-- Content -->
          <div style="padding: 40px 30px; text-align: center;">
            <p style="color: #666; font-size: 16px; margin-bottom: 20px;">Hi <strong>${username}</strong>,</p>
            <p style="color: #666; font-size: 16px; margin-bottom: 30px;">We received a request to reset your password. Click the button below to create a new password.</p>
            
            <!-- Button -->
            <a href="${resetUrl}" style="display: inline-block; background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); color: white; text-decoration: none; padding: 15px 40px; border-radius: 30px; font-size: 16px; font-weight: bold; margin-bottom: 30px;">Reset Password</a>
            
            <p style="color: #999; font-size: 14px; margin-bottom: 10px;">Or copy this link:</p>
            <p style="color: #f5576c; font-size: 12px; word-break: break-all; background: #f8f9fa; padding: 10px; border-radius: 5px;">${resetUrl}</p>
          </div>
          
          <!-- Footer -->
          <div style="background: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid #e0e0e0;">
            <p style="color: #999; font-size: 12px; margin: 0;">This link will expire in 1 hour.</p>
            <p style="color: #999; font-size: 12px; margin: 5px 0 0;">If you didn't request this, please ignore this email.</p>
          </div>
        </div>
      </body>
      </html>
    `
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Password reset email sent to:', email);
    console.log('📧 Message ID:', info.messageId);
    return info;
  } catch (error) {
    console.error('❌ Error sending password reset email:', error);
    throw error;
  }
};

module.exports = { sendVerificationEmail, sendPasswordResetEmail };