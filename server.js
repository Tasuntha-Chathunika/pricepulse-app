const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const puppeteer = require('puppeteer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken'); // Kept if needed later, though not strictly used in current logic
const nodemailer = require('nodemailer');
const cron = require('node-cron');
const crypto = require('crypto');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// --- CRITICAL FIX: Static Files ---
// Use 'public' folder. This makes http://localhost:5000/reset-password.html work.
app.use(express.static(path.join(__dirname, 'public')));

// 1. MongoDB Connection
mongoose.connect('mongodb://127.0.0.1:27017/pricepulse')
  .then(() => console.log('✅ MongoDB Connected'))
  .catch(err => console.error('❌ DB Error:', err));

// ==========================================
//              EMAIL CONFIGURATION
// ==========================================
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

transporter.verify((error, success) => {
  if (error) {
    console.log("❌ Email Config Error:", error);
  } else {
    console.log("✅ Email Service is Ready!");
  }
});

// ==========================================
//              USER SECTION (AUTH)
// ==========================================

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  joinedAt: { type: Date, default: Date.now },
  resetPasswordToken: String,
  resetPasswordExpires: Date
});

const User = mongoose.model('User', userSchema);

// 3. Sign Up Route
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: "This email is already registered!" });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = new User({ name, email, password: hashedPassword });
    await newUser.save();
    console.log(`👤 New User Registered: ${email}`);

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Welcome to PricePulse! 🚀",
      html: `
        <!DOCTYPE html>
        <html>
        <body style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f1f5f9; margin: 0; padding: 0;">
          <div style="max-width: 500px; margin: 40px auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.1); border: 1px solid #e2e8f0;">
            <div style="height: 6px; background: linear-gradient(to right, #f97316, #3b82f6);"></div>
            <div style="padding: 40px 30px; text-align: center;">
              <h1 style="color: #1e293b; font-size: 24px; font-weight: 800; margin-bottom: 10px;">Welcome Aboard! 🎉</h1>
              <p style="color: #64748b; font-size: 15px; line-height: 1.6;">
                Hi <strong>${name}</strong>,<br>
                Thanks for joining PricePulse! You can now track prices from <b>Wasi.lk</b> and <b>SimplyTek</b>.
              </p>
              <p style="color: #64748b; font-size: 15px; margin-top: 10px;">
                We will notify you instantly when a price drops.
              </p>
              <p style="font-size: 13px; color: #94a3b8; margin-top: 30px;">
                Happy Shopping,<br>PricePulse Team
              </p>
            </div>
          </div>
        </body>
        </html>
      `
    };

    transporter.sendMail(mailOptions).catch(err => console.error("Email Error:", err));

    res.status(201).json({ message: "Registration Successful!" });
  } catch (e) {
    console.error("Signup Error:", e.message);
    res.status(500).json({ error: "Server error during signup" });
  }
});

// 3.1 Login Route
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: "User not found" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ error: "Invalid password" });

    res.json({ message: "Login success", name: user.name });
  } catch (e) {
    res.status(500).json({ error: "Server error" });
  }
});

// 4. Forgot Password Route
app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Generate Token
    const token = crypto.randomBytes(20).toString('hex');
    user.resetPasswordToken = token;
    user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
    await user.save();

    // Link construction
    const resetUrl = `http://localhost:5000/reset-password.html?token=${token}`;

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: user.email,
      subject: "Reset Password - PricePulse 🔐",
      html: `
        <!DOCTYPE html>
        <html>
        <body style="font-family: Arial, sans-serif; background-color: #f1f5f9; margin: 0; padding: 0;">
          <div style="max-width: 500px; margin: 40px auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.1); border: 1px solid #e2e8f0;">
            <div style="height: 6px; background: linear-gradient(to right, #f97316, #3b82f6);"></div>
            <div style="padding: 40px 30px; text-align: center;">
              <h1 style="color: #1e293b; font-size: 24px; font-weight: 800; margin-bottom: 10px;">Password Reset</h1>
              <p style="color: #64748b; font-size: 15px;">
                Hi <strong>${user.name}</strong>,<br>
                Click the button below to reset your password.
              </p>
              <div style="margin: 30px 0;">
                <a href="${resetUrl}" style="background: linear-gradient(to right, #f97316, #ea580c); color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 50px; font-weight: bold; font-size: 16px; display: inline-block;">
                  Reset Password
                </a>
              </div>
              <p style="font-size: 13px; color: #94a3b8;">
                Link expires in 1 hour.
              </p>
            </div>
          </div>
        </body>
        </html>
      `
    };

    await transporter.sendMail(mailOptions);
    res.json({ message: "Reset link sent to your email!" });

  } catch (error) {
    console.error("Forgot Password Error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// 5. Reset Password Route
app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ error: "Invalid or expired token." });
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;

    await user.save();
    res.json({ message: "Password updated successfully!" });
  } catch (error) {
    console.error("Reset Error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// ==========================================
//            PRODUCT SECTION
// ==========================================

const productSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  url: String,
  title: String,
  image: String,
  site: String,
  currentPrice: Number,
  priceHistory: [{ price: Number, date: { type: Date, default: Date.now } }],
  lastChecked: { type: Date, default: Date.now }
});

const Product = mongoose.models.Product || mongoose.model('Product', productSchema);

// --- 2. Scraping Logic (Puppeteer) ---
async function scrapeProduct(url) {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: "new",
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--ignore-certificate-errors']
    });
    const page = await browser.newPage();

    // Set User-Agent to avoid detection
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // --- OPTIMIZATION: Block Images, Fonts, Stylesheets ---
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      if (['image', 'stylesheet', 'font'].includes(req.resourceType())) {
        req.abort();
      } else {
        req.continue();
      }
    });

    // Retry Logic for Navigation
    let attempts = 0;
    const maxAttempts = 3;
    while (attempts < maxAttempts) {
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        break; // Success
      } catch (navError) {
        attempts++;
        console.warn(`⚠️ Navigation attempt ${attempts} failed: ${navError.message}`);
        if (attempts >= maxAttempts) throw navError; // Throw if all retries fail
        await new Promise(r => setTimeout(r, 2000)); // Wait 2s before retry
      }
    }

    const data = await page.evaluate(() => {
      const getMeta = (name) => document.querySelector(`meta[property="${name}"]`)?.content ||
        document.querySelector(`meta[name="${name}"]`)?.content || null;

      // Default / Generic (OpenGraph)
      let title = getMeta('og:title') || document.title;
      let image = getMeta('og:image');
      let priceText = getMeta('product:price:amount') || getMeta('og:price:amount');
      let site = window.location.hostname.replace('www.', '').split('.')[0];

      // Site-Specific Selectors (Override if found)
      if (document.location.hostname.includes('wasi.lk')) {
        const titleEl = document.querySelector('.product_title');
        const priceEl = document.querySelector('.price .amount');
        const imgEl = document.querySelector('.woocommerce-product-gallery__image img');

        if (titleEl) title = titleEl.innerText;
        if (priceEl) priceText = priceEl.innerText;
        if (imgEl) image = imgEl.src;
        site = "Wasi.lk";
      }
      else if (document.location.hostname.includes('simplytek')) {
        const titleEl = document.querySelector('.product_title');
        const priceEl = document.querySelector('.price .amount'); // check selector
        // Sometimes SimplyTek uses different classes, falling back to meta is safer usually
        if (titleEl) title = titleEl.innerText;
        if (priceEl) priceText = priceEl.innerText;
        site = "SimplyTek";
      }

      // Cleanup Price (Remove 'Rs.', ',', spaces)
      let price = 0;
      if (priceText) {
        price = parseFloat(priceText.replace(/[^0-9.]/g, ''));
      }

      return { title, price, image, site };
    });

    return data;

  } catch (error) {
    console.error("Scraping Error:", error.message);
    // Don't throw, return null to avoid crashing usage loops if handled poorly
    // checkPrices handles throws, but express route might want a clean error
    throw error;
  } finally {
    if (browser) await browser.close();
  }
}

// 4. PRICE TRACKING
async function checkPrices() {
  console.log('⏰ Running Scheduled Price Check...');
  try {
    const products = await Product.find({});
    for (const product of products) {
      // Re-scrape to check for updates
      try {
        const newData = await scrapeProduct(product.url);
        if (newData && newData.price !== product.currentPrice) {
          product.currentPrice = newData.price;
          product.priceHistory.push({ price: newData.price, date: new Date() });
          product.lastChecked = new Date();
          await product.save();
          console.log(`Updated price for ${product.title}`);
        }
      } catch (err) {
        console.error(`Failed to update ${product.title}:`, err.message);
      }
    }
  } catch (err) {
    console.error("Cron Job Error:", err);
  }
}

// Check prices every hour
cron.schedule('0 * * * *', checkPrices);

// Routes for Products
app.post('/api/products', async (req, res) => {
  console.log("📥 Received Product Track Request:", req.body); // Debug Log

  try {
    const { url, userEmail } = req.body;

    if (!url || !userEmail) {
      return res.status(400).json({ error: "URL and User Email are required!" });
    }

    // 1. Find User
    const user = await User.findOne({ email: userEmail });
    if (!user) {
      console.log("❌ User not found for email:", userEmail);
      return res.status(404).json({ error: "User not found. Please log in." });
    }

    // 2. Check if already exists for this user
    const existingProduct = await Product.findOne({ user: user._id, url: url });
    if (existingProduct) {
      return res.status(200).json({ message: "Product already tracked", status: 'exists', product: existingProduct });
    }

    // 3. Scrape Data
    console.log(`🕵️ Scraping URL: ${url}`);
    const scrapedData = await scrapeProduct(url);

    if (!scrapedData || !scrapedData.title) {
      return res.status(400).json({ error: "Could not fetch product details. Check URL." });
    }

    // 4. Save to DB
    const newProduct = new Product({
      user: user._id,
      url,
      title: scrapedData.title,
      image: scrapedData.image,
      site: scrapedData.site,
      currentPrice: scrapedData.price,
      priceHistory: [{ price: scrapedData.price }],
    });

    await newProduct.save();
    console.log(`✅ Product Saved: ${newProduct.title}`);

    // Return the FULL product object so frontend can display it
    res.status(201).json({ message: "Product added successfully", product: newProduct });

  } catch (error) {
    console.error("❌ Add Product Error:", error);
    res.status(500).json({ error: "Server Error: " + error.message });
  }
});

app.get('/api/products', async (req, res) => {
  try {
    const { userEmail } = req.query;
    if (!userEmail) return res.json([]);

    const user = await User.findOne({ email: userEmail });
    if (!user) return res.json([]);

    const products = await Product.find({ user: user._id }).sort({ lastChecked: -1 });
    res.json(products);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server Error" });
  }
});

app.delete('/api/products/:id', async (req, res) => {
  try {
    await Product.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: "Delete failed" });
  }
});

// Server Start
app.listen(5000, () => {
  console.log('🚀 Server running on http://localhost:5000');
});