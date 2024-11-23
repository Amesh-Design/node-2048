const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const cors = require('cors');
const app = express();

app.use(cors());

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";  // Use environment variable for security

// Connect to MongoDB
mongoose.connect('mongodb+srv://amesh:<wE1ispOntaJQuySk>@cluster0.2s0e7.mongodb.net/', { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB connected'))
  .catch((err) => console.error('MongoDB connection error:', err));

// User schema with OTP fields
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  otp: { type: String },  // Added for OTP
  otpExpiresAt: { type: Date }  // Added for OTP expiry
});
const userScoreSchema = new mongoose.Schema({
  email: { type: String, required: true },
  highestScore: { type: Number, required: true },
});

// Model for users
const User = mongoose.model('User', userSchema);
const UserScore = mongoose.model('UserScore', userScoreSchema);


// Middleware
app.use(express.json());

// Configure the transporter for Nodemailer (using Gmail here)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: ' ameshbabudoppalapudi@gmail.com',  // Store your email in environment variables
    pass: 'ruor ynrw qetf czrd',  // Use an app-specific password or environment variable
  },
});

// Function to send a welcome email to the user
const sendWelcomeEmail = async (email, username) => {
  const mailOptions = {
    from: process.env.USER_EMAIL,
    to: email,
    subject: 'Welcome to Our App!',
    text: `Hi ${username},\n\nThank you for registering on our app. We are excited to have you!\n\nBest regards,\nYour App Team`,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log('Welcome email sent to', email);
  } catch (error) {
    console.error('Error sending email:', error);
  }
};

// Signup route
app.post('/register', async (req, res) => {
  const { username, email, password, confirmPassword } = req.body;

  // Basic validation
  if (!username || !email || !password || !confirmPassword) {
    return res.status(400).json({ message: 'Please fill all fields' });
  }
  if (password !== confirmPassword) {
    return res.status(400).json({ message: 'Passwords do not match' });
  }

  try {
    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ message: 'User already exists' });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create a new user
    const newUser = new User({
      username,
      email,
      password: hashedPassword,
    });

    await newUser.save();

    // Send welcome email to the new user
    await sendWelcomeEmail(email, username);

    // Generate JWT token
    const token = jwt.sign({ id: newUser._id,email:User.email }, JWT_SECRET, { expiresIn: '1h' });

    res.status(201).json({ message: 'Signup successful!', token });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Login route
app.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ msg: "Email and password are required" });
  }

  try {
    // Check if user exists
    const user = await User.findOne({ email });

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(400).json({ msg: "Invalid email or password" });
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id, email: user.email },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    return res.status(200).json({
      msg: "Login successful",
      token,
      user: { email: user.email, username: user.username },
    });
  } catch (error) {
    console.error("Error during login:", error);
    return res.status(500).json({ msg: "Internal server error" });
  }
});

// Forgot Password route
app.post('/forgotPassword', async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ msg: "Email required" });
  }

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ msg: "Email doesn't exist" });
    }

    let OTP = '';
    for (let i = 0; i < 6; i++) {
      OTP += Math.floor(Math.random() * 10);  // Generate 6-digit OTP
    }

    user.otp = OTP;
    user.otpExpiresAt = new Date(Date.now() + 10 * 60000);  // OTP expires in 10 minutes
    await user.save();

    await sendForgotPasswordMail(email, OTP);

    return res.status(201).json({ msg: "Success" });
  } catch (error) {
    console.error("Error generating reset password:", error);
    return res.status(500).json({ msg: "Internal server error" });
  }
});

// Send OTP email
const sendForgotPasswordMail = async (email, OTP) => {
  const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
          user: 'ameshbabudoppalapudi@gmail.com', 
          pass: 'ruor ynrw qetf czrd', 
      },
  });
  const mailOptions = {
      from: 'ameshbabudoppalapudi@gmail.com',
      to: email,
      subject: 'OTP generated',
      text: `OTP generated to login is: ${OTP}`,
  };

  try {
      await transporter.sendMail(mailOptions);
      console.log("OTP sent successfully");
  } catch (error) {
      console.error("Error sending mail:", error);
  }
};

// Verify OTP route
app.post('/verifyOtp', async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return res.status(400).json({ msg: "Email and OTP are required" });
  }

  try {
    const user = await User.findOne({ email });

    if (!user || user.otp !== otp || user.otpExpiresAt < new Date()) {
      return res.status(400).json({ msg: "OTP expired or Wrong OTP" });
    }

    user.otp = null;
    user.otpExpiresAt = null;
    await user.save();

    const token = jwt.sign(
      { userId: user._id, email: user.email },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    return res.status(200).json({
      msg: "Login successful",
      token,
      user: { email: user.email, username: user.username },
    });
  } catch (error) {
    console.error("Error during OTP verification:", error);
    return res.status(500).json({ msg: "Internal server error" });
  }
});

// const userHighestScore = async (req, res) => {
  app.post('/highestScore', async (req, res) => {
    const { highestScore } = req.body;
    const token = req.headers.authorization?.split(' ')[1];
  
    if (!token) {
      return res.status(401).json({ msg: "Authorization token is required" });
    }
  
    try {
      const decoded = jwt.verify(token, JWT_SECRET); // Decode token
      const email = decoded.email;
  
      if (!highestScore) {
        return res.status(400).json({ msg: "Score is required to store in the database" });
      }
  
      // Check if the user already has a score entry
      const existingRecord = await UserScore.findOne({ email });
      if (existingRecord) {
        if (highestScore > existingRecord.highestScore) {
          existingRecord.highestScore = highestScore;
          await existingRecord.save();
          return res.status(200).json({ msg: "Score updated successfully" });
        } else {
          return res.status(200).json({ msg: "New score is not higher. No update made." });
        }
      } else {
        // Create new score record
        await UserScore.create({ email, highestScore });
        return res.status(201).json({ msg: "Score created successfully" });
      }
    } catch (error) {
      console.error("Error verifying token or saving score:", error);
      return res.status(500).json({ msg: "Internal server error" });
    }
  });
  
  app.post('/getScore', async (req, res) => { 

    const token = req.headers.authorization?.split(' ')[1];
  
    if (!token) {
      return res.status(401).json({ msg: "Authorization token is required" });
    }
  
    try {
      const decoded = jwt.verify(token, JWT_SECRET); // Decode token
      const email = decoded.email;

      const userScoreRecord = await UserScore.findOne({email});

      if(!userScoreRecord){
        return res.status(404).json({msg: "No score found for given email"});
      }

      return res.status(200).json({
        msg: "Score retrieved",
        email: userScoreRecord.email,
        highestScore: userScoreRecord.highestScore,
      });}
      catch(error){
        return res.status(404).json({msg: "Invalid or expiry token"});
      }
  });
  
// app.post('/getToken', (req, res) => {
//   console.log('Request body:', req.body); // Log incoming data

//   const { email } = req.body;

//   if (!email || !user[email]) {
//     console.error('Invalid email or user not found');
//     return res.status(400).json({ error: 'Invalid email' });
//   }

//   const user = user[email];
//   const token = jwt.sign(
//     { id: user.id, email: email },
//     JWT_SECRET,
//     { expiresIn: '1h' }
//   );

//   console.log('Generated token:', token); // Log generated token
//   res.status(200).json({ token });
// });

app.post('/getToken', async (req, res) => {
  console.log('Request body:', req.body); // Log incoming data

  const { email } = req.body;

  if (!email) {
    console.error('Invalid email');
    return res.status(400).json({ error: 'Invalid email' });
  }

  try {
    const user = await User.findOne({ email });

    if (!user) {
      console.error('User not found');
      return res.status(404).json({ error: 'User not found' });
    }

    const token = jwt.sign(
      { id: user._id, email: user.email },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    console.log('Generated token:', token); // Log generated token
    res.status(200).json({ token });
  } catch (error) {
    console.error('Error fetching user or generating token:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});


// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
