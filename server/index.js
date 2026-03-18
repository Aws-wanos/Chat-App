const express = require('express');
const http = require('http');
const socketio = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { sendVerificationEmail, sendPasswordResetEmail } = require('./services/emailService');
require('dotenv').config();

// Initialize express app
const app = express();
const server = http.createServer(app);
const io = socketio(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Middleware
// CORS configuration
const corsOptions = {
  origin: [
    'https://your-netlify-app.netlify.app', // Replace with your actual Netlify URL
    'http://localhost:3000'
  ],
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};

app.use(cors(corsOptions));

// Handle preflight requests
app.options('*', cors(corsOptions));

// Additional CORS headers middleware
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (corsOptions.origin.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  }
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  
  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Create uploads directory
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Serve uploaded files statically
app.use('/uploads', express.static(uploadDir));

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = crypto.randomBytes(16).toString('hex') + path.extname(file.originalname);
    cb(null, uniqueName);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'application/pdf', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain', 'application/zip', 'application/x-rar-compressed',
    'audio/webm', 'audio/mp3', 'audio/mpeg', 'audio/wav', 'audio/ogg',
    'audio/mp4', 'audio/x-m4a', 'audio/aac'
  ];
  
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('File type not allowed'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }
});

// Basic test route
app.get('/', (req, res) => {
  res.json({ 
    message: 'Chat server is running!',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/test', (req, res) => {
  res.json({ 
    message: 'API is working!',
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    time: new Date().toISOString()
  });
});

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/chat-app';
console.log('Connecting to MongoDB...');

mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('✅ MongoDB connected successfully'))
.catch(err => {
  console.error('❌ MongoDB connection error:', err.message);
});

// ==================== SCHEMAS ====================

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  isVerified: { type: Boolean, default: false }, // ← THIS MUST BE HERE
  verificationToken: { type: String },
  verificationTokenExpires: { type: Date },
  resetPasswordToken: { type: String },
  resetPasswordExpires: { type: Date },
  friends: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  friendRequests: [{
    from: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    status: { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending' },
    createdAt: { type: Date, default: Date.now }
  }],
  online: { type: Boolean, default: false },
  lastSeen: { type: Date },
  avatar: { type: String, default: '' },
  notificationSettings: {
    sound: { type: Boolean, default: true },
    desktop: { type: Boolean, default: true },
    email: { type: Boolean, default: true }
  },
  pushSubscription: { type: Object, default: null },
  createdAt: { type: Date, default: Date.now }
});

const messageSchema = new mongoose.Schema({
  text: String,
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  receiver: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  room: String,
  read: { type: Boolean, default: false },
  delivered: { type: Boolean, default: false },
  attachments: [{
    type: { type: String, enum: ['image', 'file', 'audio', 'video'] },
    url: String,
    filename: String,
    size: Number,
    mimeType: String,
    thumbnail: String
  }],
  timestamp: { type: Date, default: Date.now }
});

const privateChatSchema = new mongoose.Schema({
  participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  lastMessage: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },
  updatedAt: { type: Date, default: Date.now }
});

const groupSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String, default: '' },
  avatar: { type: String, default: '' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  admins: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  members: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    joinedAt: { type: Date, default: Date.now },
    role: { type: String, enum: ['admin', 'member'], default: 'member' }
  }],
  lastMessage: { type: mongoose.Schema.Types.ObjectId, ref: 'GroupMessage' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const groupMessageSchema = new mongoose.Schema({
  text: { type: String, default: '' },
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },
  readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  deliveredTo: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  attachments: [{
    type: { type: String, enum: ['image', 'file', 'audio', 'video'] },
    url: String,
    filename: String,
    size: Number,
    mimeType: String,
    thumbnail: String
  }],
  mentions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  replyTo: { type: mongoose.Schema.Types.ObjectId, ref: 'GroupMessage' },
  edited: { type: Boolean, default: false },
  deleted: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Message = mongoose.model('Message', messageSchema);
const PrivateChat = mongoose.model('PrivateChat', privateChatSchema);
const Group = mongoose.model('Group', groupSchema);
const GroupMessage = mongoose.model('GroupMessage', groupMessageSchema);

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production';

// ==================== MIDDLEWARE ====================

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) return res.sendStatus(401);
  
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

// ==================== AUTH ROUTES ====================

// ==================== AUTH ROUTES ====================

// Register
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    
    // Validate input
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    
    // Check if user exists
    const existingUser = await User.findOne({ 
      $or: [{ email }, { username }] 
    });
    
    if (existingUser) {
      if (existingUser.email === email) {
        return res.status(400).json({ error: 'Email already registered' });
      }
      return res.status(400).json({ error: 'Username already taken' });
    }
    
    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    
    // Generate verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    
    // Create user
    const user = new User({
  username,
  email,
  password: hashedPassword,
  verificationToken,
  verificationTokenExpires,
  isVerified: false // ← EXPLICITLY SET TO FALSE
});
    
    await user.save();
    console.log('✅ User created successfully:', user._id);
    
    // SEND VERIFICATION EMAIL IMMEDIATELY
    console.log('📧 Attempting to send verification email to:', email);
    try {
      await sendVerificationEmail(email, verificationToken, username);
      console.log('✅ Verification email sent successfully to:', email);
    } catch (emailError) {
      console.error('❌ Failed to send verification email:');
      console.error('❌ Error:', emailError.message);
      // Log but don't fail registration - user can still request resend
    }
    
    res.status(201).json({ 
      message: 'Registration successful! Please check your email to verify your account.' 
    });
    
  } catch (error) {
    console.error('❌ Registration error:', error);
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Debug log
    console.log(`User ${user.email} isVerified:`, user.isVerified);
    
    if (!user.isVerified) {
      console.log('Blocking unverified user');
      return res.status(401).json({ error: 'Please verify your email before logging in' });
    }
    
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    user.online = true;
    await user.save();
    
    const token = jwt.sign(
      { id: user._id, username: user.username }, 
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    res.json({
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        avatar: user.avatar,
        isVerified: user.isVerified
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Verify token and return user
app.get('/api/auth/verify-token', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Check if user is still verified
    if (!user.isVerified) {
      return res.status(401).json({ error: 'Account not verified' });
    }
    
    res.json({
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        avatar: user.avatar,
        isVerified: user.isVerified
      }
    });
  } catch (error) {
    console.error('Token verification error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Email verification
app.get('/api/auth/verify/:token', async (req, res) => {
  try {
    const { token } = req.params;
    
    const user = await User.findOne({
      verificationToken: token,
      verificationTokenExpires: { $gt: Date.now() }
    });
    
    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired verification token' });
    }
    
    user.isVerified = true; // ← SET TO TRUE
    user.verificationToken = undefined;
    user.verificationTokenExpires = undefined;
    await user.save();
    
    res.redirect('http://localhost:3000/login?verified=true');
  } catch (error) {
    console.error('Verification error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Resend verification email
app.post('/api/auth/resend-verification', async (req, res) => {
  try {
    const { email } = req.body;
    
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    if (user.isVerified) {
      return res.status(400).json({ error: 'Email already verified' });
    }
    
    // Generate new verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    user.verificationToken = verificationToken;
    user.verificationTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await user.save();
    
    // Send verification email
    await sendVerificationEmail(email, verificationToken, user.username);
    
    res.json({ message: 'Verification email sent. Please check your inbox.' });
  } catch (error) {
    console.error('Resend verification error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Forgot password
app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await user.save();
    
    // Send password reset email
    await sendPasswordResetEmail(email, resetToken, user.username);
    
    res.json({ message: 'Password reset email sent. Please check your inbox.' });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Verify reset token
app.get('/api/auth/verify-reset-token/:token', async (req, res) => {
  try {
    const { token } = req.params;
    
    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() }
    });
    
    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired token' });
    }
    
    res.json({ valid: true });
  } catch (error) {
    console.error('Verify reset token error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Reset password
app.post('/api/auth/reset-password/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;
    
    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    
    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() }
    });
    
    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired token' });
    }
    
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    
    user.password = hashedPassword;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();
    
    res.json({ message: 'Password reset successful. You can now log in.' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Logout (optional - client just discards token)
app.post('/api/auth/logout', authenticateToken, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user.id, { online: false, lastSeen: Date.now() });
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get current user
app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    res.json(user);
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== FRIEND ROUTES ====================

app.get('/api/users/search', authenticateToken, async (req, res) => {
  try {
    const { query } = req.query;
    
    if (!query || query.length < 1) {
      return res.json([]);
    }
    
    const users = await User.find({
      $and: [
        { _id: { $ne: req.user.id } },
        {
          $or: [
            { username: { $regex: query, $options: 'i' } },
            { email: { $regex: query, $options: 'i' } }
          ]
        }
      ]
    }).select('username email online avatar');
    
    res.json(users);
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/friends/request', authenticateToken, async (req, res) => {
  try {
    const { friendId } = req.body;
    
    const user = await User.findById(req.user.id);
    const friend = await User.findById(friendId);
    
    if (!friend) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    if (user.friends.includes(friendId)) {
      return res.status(400).json({ error: 'Already friends' });
    }
    
    const existingRequest = friend.friendRequests.find(
      req => req.from.toString() === user._id.toString() && req.status === 'pending'
    );
    
    if (existingRequest) {
      return res.status(400).json({ error: 'Friend request already sent' });
    }
    
    friend.friendRequests.push({ 
      from: user._id,
      status: 'pending',
      createdAt: new Date()
    });
    
    await friend.save();
    
    res.json({ message: 'Friend request sent' });
  } catch (error) {
    console.error('Error sending friend request:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/friends/requests', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .populate('friendRequests.from', 'username email avatar online');
    
    const pendingRequests = user.friendRequests.filter(
      req => req.status === 'pending'
    );
    
    res.json(pendingRequests);
  } catch (error) {
    console.error('Error fetching requests:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/friends/accept', authenticateToken, async (req, res) => {
  try {
    const { requestId } = req.body;
    
    const user = await User.findById(req.user.id);
    
    const request = user.friendRequests.id(requestId);
    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }
    
    request.status = 'accepted';
    user.friends.push(request.from);
    await user.save();
    
    const otherUser = await User.findById(request.from);
    otherUser.friends.push(user._id);
    await otherUser.save();
    
    const chat = new PrivateChat({
      participants: [user._id, otherUser._id]
    });
    await chat.save();
    
    res.json({ message: 'Friend request accepted' });
  } catch (error) {
    console.error('Error accepting request:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/friends', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .populate('friends', 'username email avatar online lastSeen');
    
    res.json(user.friends);
  } catch (error) {
    console.error('Error fetching friends:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== PRIVATE CHAT ROUTES ====================

app.post('/api/chats/create', authenticateToken, async (req, res) => {
  try {
    const { participantId } = req.body;
    const userId = req.user.id;
    
    let chat = await PrivateChat.findOne({
      participants: { $all: [userId, participantId] }
    });
    
    if (!chat) {
      chat = new PrivateChat({
        participants: [userId, participantId],
        updatedAt: Date.now()
      });
      await chat.save();
    }
    
    res.json({ chatId: chat._id });
  } catch (error) {
    console.error('Error creating chat:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/chats', authenticateToken, async (req, res) => {
  try {
    const chats = await PrivateChat.find({
      participants: req.user.id
    })
      .populate('participants', 'username avatar online lastSeen')
      .populate({
        path: 'lastMessage',
        populate: { path: 'sender', select: 'username' }
      })
      .sort('-updatedAt');
    
    res.json(chats);
  } catch (error) {
    console.error('Error fetching chats:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/chats/:chatId', authenticateToken, async (req, res) => {
  try {
    const chat = await PrivateChat.findById(req.params.chatId)
      .populate('participants', 'username avatar online lastSeen')
      .populate('lastMessage');
    
    if (!chat) {
      return res.status(404).json({ error: 'Chat not found' });
    }
    
    if (!chat.participants.some(p => p._id.toString() === req.user.id)) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    
    res.json(chat);
  } catch (error) {
    console.error('Error fetching chat:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/chats/:chatId/messages', authenticateToken, async (req, res) => {
  try {
    const messages = await Message.find({ room: req.params.chatId })
      .populate('sender', 'username avatar')
      .sort('timestamp');
    
    res.json(messages);
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== GROUP CHAT ROUTES ====================

app.post('/api/groups/create', authenticateToken, async (req, res) => {
  try {
    const { name, description, memberIds } = req.body;
    const userId = req.user.id;
    
    const members = [
      { user: userId, role: 'admin' },
      ...memberIds.map(id => ({ user: id, role: 'member' }))
    ];
    
    const group = new Group({
      name,
      description,
      createdBy: userId,
      admins: [userId],
      members
    });
    
    await group.save();
    await group.populate('members.user', 'username avatar online');
    
    res.status(201).json(group);
  } catch (error) {
    console.error('Error creating group:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/groups', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    const groups = await Group.find({
      'members.user': userId
    })
      .populate('members.user', 'username avatar online')
      .populate('createdBy', 'username avatar')
      .populate('lastMessage')
      .sort('-updatedAt');
    
    res.json(groups);
  } catch (error) {
    console.error('Error fetching groups:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/groups/:groupId', authenticateToken, async (req, res) => {
  try {
    const group = await Group.findById(req.params.groupId)
      .populate('members.user', 'username avatar online lastSeen')
      .populate('createdBy', 'username avatar')
      .populate('admins', 'username avatar');
    
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }
    
    const isMember = group.members.some(m => m.user._id.toString() === req.user.id);
    if (!isMember) {
      return res.status(403).json({ error: 'Not a group member' });
    }
    
    res.json(group);
  } catch (error) {
    console.error('Error fetching group:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/groups/:groupId/messages', authenticateToken, async (req, res) => {
  try {
    const { groupId } = req.params;
    
    const messages = await GroupMessage.find({ groupId })
      .populate('sender', 'username avatar')
      .populate('replyTo')
      .sort('createdAt');
    
    res.json(messages);
  } catch (error) {
    console.error('Error fetching group messages:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== FILE UPLOAD ROUTES ====================

app.post('/api/upload/private/:chatId', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    const { chatId } = req.params;
    const file = req.file;
    
    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const PORT = process.env.PORT || 5000;
    const fileUrl = `http://localhost:${PORT}/uploads/${file.filename}`;
    const fileType = file.mimetype.startsWith('image/') ? 'image' : 'file';
    
    const message = new Message({
      text: '',
      sender: req.user.id,
      receiver: null,
      room: chatId,
      attachments: [{
        type: fileType,
        url: fileUrl,
        filename: file.originalname,
        size: file.size,
        mimeType: file.mimetype
      }]
    });
    
    await message.save();
    await message.populate('sender', 'username avatar');
    
    await PrivateChat.findByIdAndUpdate(chatId, {
      lastMessage: message._id,
      updatedAt: Date.now()
    });
    
    const chat = await PrivateChat.findById(chatId);
    const otherParticipant = chat.participants.find(p => p.toString() !== req.user.id);
    
    io.to(otherParticipant.toString()).emit('private-message', message);
    io.to(req.user.id).emit('private-message-sent', message);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/upload/group/:groupId', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    const { groupId } = req.params;
    const file = req.file;
    
    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const PORT = process.env.PORT || 5000;
    const fileUrl = `http://localhost:${PORT}/uploads/${file.filename}`;
    const fileType = file.mimetype.startsWith('image/') ? 'image' : 'file';
    
    const message = new GroupMessage({
      text: '',
      sender: req.user.id,
      groupId,
      readBy: [req.user.id],
      deliveredTo: [req.user.id],
      attachments: [{
        type: fileType,
        url: fileUrl,
        filename: file.originalname,
        size: file.size,
        mimeType: file.mimetype
      }]
    });
    
    await message.save();
    await message.populate('sender', 'username avatar');
    
    await Group.findByIdAndUpdate(groupId, {
      lastMessage: message._id,
      updatedAt: Date.now()
    });
    
    io.to(groupId).emit('group-message', message);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Group upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/upload/voice/private/:chatId', authenticateToken, upload.single('audio'), async (req, res) => {
  try {
    const { chatId } = req.params;
    const file = req.file;
    
    if (!file) {
      return res.status(400).json({ error: 'No audio file uploaded' });
    }
    
    const PORT = process.env.PORT || 5000;
    const fileUrl = `http://localhost:${PORT}/uploads/${file.filename}`;
    
    const message = new Message({
      text: '',
      sender: req.user.id,
      receiver: null,
      room: chatId,
      attachments: [{
        type: 'audio',
        url: fileUrl,
        filename: file.originalname,
        size: file.size,
        mimeType: file.mimetype,
        duration: req.body.duration || 0
      }]
    });
    
    await message.save();
    await message.populate('sender', 'username avatar');
    
    await PrivateChat.findByIdAndUpdate(chatId, {
      lastMessage: message._id,
      updatedAt: Date.now()
    });
    
    const chat = await PrivateChat.findById(chatId);
    const otherParticipant = chat.participants.find(p => p.toString() !== req.user.id);
    
    io.to(otherParticipant.toString()).emit('private-message', message);
    io.to(req.user.id).emit('private-message-sent', message);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Voice upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/upload/voice/group/:groupId', authenticateToken, upload.single('audio'), async (req, res) => {
  try {
    const { groupId } = req.params;
    const file = req.file;
    
    if (!file) {
      return res.status(400).json({ error: 'No audio file uploaded' });
    }
    
    const PORT = process.env.PORT || 5000;
    const fileUrl = `http://localhost:${PORT}/uploads/${file.filename}`;
    
    const message = new GroupMessage({
      text: '',
      sender: req.user.id,
      groupId,
      readBy: [req.user.id],
      deliveredTo: [req.user.id],
      attachments: [{
        type: 'audio',
        url: fileUrl,
        filename: file.originalname,
        size: file.size,
        mimeType: file.mimetype,
        duration: req.body.duration || 0
      }]
    });
    
    await message.save();
    await message.populate('sender', 'username avatar');
    
    await Group.findByIdAndUpdate(groupId, {
      lastMessage: message._id,
      updatedAt: Date.now()
    });
    
    io.to(groupId).emit('group-message', message);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Group voice upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== MESSAGE DELETION ROUTES ====================

app.delete('/api/messages/private/:messageId', authenticateToken, async (req, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.user.id;

    const message = await Message.findById(messageId);
    
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    if (message.sender.toString() !== userId) {
      return res.status(403).json({ error: 'Can only delete your own messages' });
    }

    const chat = await PrivateChat.findById(message.room);
    const otherParticipant = chat.participants.find(p => p.toString() !== userId);

    await Message.findByIdAndDelete(messageId);

    if (chat.lastMessage?.toString() === messageId) {
      const lastMessage = await Message.findOne({ room: message.room })
        .sort('-timestamp')
        .limit(1);
      chat.lastMessage = lastMessage?._id || null;
      await chat.save();
    }

    io.to(userId).emit('message-deleted', { messageId, room: message.room });
    io.to(otherParticipant.toString()).emit('message-deleted', { messageId, room: message.room });

    res.json({ message: 'Message deleted successfully' });
  } catch (error) {
    console.error('Error deleting message:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/messages/group/:messageId', authenticateToken, async (req, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.user.id;

    const message = await GroupMessage.findById(messageId);
    
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    const group = await Group.findById(message.groupId);
    const isAdmin = group.admins.includes(userId);
    
    if (message.sender.toString() !== userId && !isAdmin) {
      return res.status(403).json({ error: 'Not authorized to delete this message' });
    }

    await GroupMessage.findByIdAndDelete(messageId);

    if (group.lastMessage?.toString() === messageId) {
      const lastMessage = await GroupMessage.findOne({ groupId: message.groupId })
        .sort('-createdAt')
        .limit(1);
      group.lastMessage = lastMessage?._id || null;
      await group.save();
    }

    io.to(message.groupId).emit('group-message-deleted', { 
      messageId, 
      groupId: message.groupId 
    });

    res.json({ message: 'Message deleted successfully' });
  } catch (error) {
    console.error('Error deleting group message:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== SOCKET.IO ====================

io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) {
    return next(new Error('Authentication error'));
  }
  
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return next(new Error('Authentication error'));
    socket.userId = user.id;
    next();
  });
});

io.on('connection', async (socket) => {
  console.log('🔌 User connected:', socket.userId);
  
  // Get user data
  const userData = await User.findById(socket.userId);
  socket.username = userData?.username || 'Unknown';
  
  // Update user online status
  await User.findByIdAndUpdate(socket.userId, { online: true });
  
  // Join user to their personal room (important for one-to-one calls)
  socket.join(socket.userId);
  
  // Get user's friends
  const user = await User.findById(socket.userId).populate('friends', '_id');
  
  // Notify friends that user is online
  if (user && user.friends) {
    user.friends.forEach(friend => {
      io.to(friend._id.toString()).emit('friend-online', socket.userId);
    });
  }
  
  // Join chat room
  socket.on('join-chat', (chatId) => {
    socket.join(chatId);
  });
  
  // Private message events
  socket.on('private-message', async (data) => {
    try {
      const { to, text, chatId } = data;
      
      let chat = await PrivateChat.findById(chatId);
      
      if (!chat) {
        chat = new PrivateChat({
          participants: [socket.userId, to],
          updatedAt: Date.now()
        });
        await chat.save();
      }
      
      const message = new Message({
        text,
        sender: socket.userId,
        receiver: to,
        room: chat._id,
        delivered: false,
        read: false
      });
      
      await message.save();
      await message.populate('sender', 'username avatar');
      
      chat.lastMessage = message._id;
      chat.updatedAt = Date.now();
      await chat.save();
      
      io.to(to).emit('private-message', message);
      socket.emit('private-message-sent', message);
      
      message.delivered = true;
      await message.save();
      
    } catch (error) {
      console.error('Error sending message:', error);
    }
  });
  
  socket.on('mark-read', async (data) => {
    try {
      const { messageIds, chatId } = data;
      
      await Message.updateMany(
        { _id: { $in: messageIds } },
        { read: true }
      );
      
      io.to(chatId).emit('messages-read', {
        messageIds,
        userId: socket.userId
      });
      
    } catch (error) {
      console.error('Error marking messages as read:', error);
    }
  });
  
  socket.on('typing', (data) => {
    const { to, chatId } = data;
    socket.to(to).emit('user-typing', {
      userId: socket.userId,
      chatId
    });
  });
  
  // Group chat events
  socket.on('join-group', (groupId) => {
    socket.join(groupId);
    console.log(`👥 User ${socket.userId} (${socket.username}) joined group ${groupId}`);
  });
  
  socket.on('leave-group', (groupId) => {
    socket.leave(groupId);
  });
  
  // FIXED GROUP MESSAGE HANDLER WITH DEBUG LOGS
  socket.on('group-message', async (data) => {
    try {
      const { groupId, text } = data;
      
      console.log('========== GROUP MESSAGE RECEIVED ==========');
      console.log('From:', socket.userId, socket.username);
      console.log('Group:', groupId);
      console.log('Text:', text);
      
      // Check if user is in group
      const group = await Group.findOne({
        _id: groupId,
        'members.user': socket.userId
      });
      
      if (!group) {
        console.log('❌ User not in group');
        return;
      }
      
      console.log('✅ User is in group');
      
      // Create and save message
      const message = new GroupMessage({
        text,
        sender: socket.userId,
        groupId,
        readBy: [socket.userId],
        deliveredTo: [socket.userId]
      });
      
      await message.save();
      await message.populate('sender', 'username avatar');
      
      console.log('✅ Message saved with ID:', message._id);
      
      // Update group last message
      group.lastMessage = message._id;
      group.updatedAt = Date.now();
      await group.save();
      
      // Broadcast to ALL group members
      console.log('📢 Broadcasting to group:', groupId);
      io.to(groupId).emit('group-message', message);
      
      console.log('✅ Message broadcast complete');
      console.log('============================================');
      
    } catch (error) {
      console.error('❌ Error in group-message:', error);
    }
  });
  
  socket.on('group-typing', (data) => {
    const { groupId, isTyping } = data;
    socket.to(groupId).emit('group-typing', {
      userId: socket.userId,
      groupId,
      isTyping
    });
  });
  
  socket.on('mark-group-read', async (data) => {
    try {
      const { groupId, messageIds } = data;
      
      await GroupMessage.updateMany(
        { _id: { $in: messageIds } },
        { $addToSet: { readBy: socket.userId } }
      );
      
      io.to(groupId).emit('group-messages-read', {
        messageIds,
        userId: socket.userId,
        groupId
      });
    } catch (error) {
      console.error('Error marking group messages as read:', error);
    }
  });
  
  // ==================== ONE-TO-ONE CALL EVENTS ====================
  
  socket.on('call-user', ({ to, offer, callType, from, fromName }) => {
    console.log(`📞 Call from ${fromName} (${from}) to ${to}`);
    io.to(to).emit('incoming-call', { 
      from, 
      fromName, 
      offer, 
      callType 
    });
  });

  socket.on('accept-call', ({ to, answer }) => {
    console.log(`✅ Call accepted, sending answer to ${to}`);
    io.to(to).emit('call-accepted', { answer });
  });

  socket.on('reject-call', ({ to }) => {
    console.log(`❌ Call rejected, notifying ${to}`);
    io.to(to).emit('call-rejected');
  });

  socket.on('end-call', ({ to }) => {
    console.log(`🔚 Call ended, notifying ${to}`);
    io.to(to).emit('call-ended');
  });

  socket.on('ice-candidate', ({ to, candidate }) => {
    console.log(`🧊 ICE candidate to ${to}`);
    io.to(to).emit('ice-candidate', { candidate });
  });
  
  // Handle disconnect
  socket.on('disconnect', async () => {
    console.log('🔌 User disconnected:', socket.userId);
    
    // Update user status
    await User.findByIdAndUpdate(socket.userId, {
      online: false,
      lastSeen: Date.now()
    });
    
    // Notify friends
    if (user && user.friends) {
      user.friends.forEach(friend => {
        io.to(friend._id.toString()).emit('friend-offline', {
          userId: socket.userId,
          lastSeen: Date.now()
        });
      });
    }
  });
});

// ==================== ERROR HANDLING ====================

app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ==================== START SERVER ====================

const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running on port ${PORT}`);
});