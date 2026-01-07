const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const puppeteer = require('puppeteer');
const bcrypt = require('bcryptjs'); // Aluth: Password encrypt karanna
const jwt = require('jsonwebtoken'); // Aluth: Login token sadaha

const app = express();
app.use(cors());
app.use(express.json());

// 1. MongoDB Connection
mongoose.connect('mongodb://127.0.0.1:27017/pricepulse')
  .then(() => console.log('✅ MongoDB Connected'))
  .catch(err => console.error('❌ DB Error:', err));

// ==========================================
//              USER SECTION (AUTH)
// ==========================================

// 2. User Schema
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true }, // Email eka unique wenna one
  password: { type: String, required: true },
  joinedAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

// 3. Sign Up Route
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: "This email is already registered!" });
    }

    // Encrypt Password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Save New User
    const newUser = new User({
      name,
      email,
      password: hashedPassword
    });

    await newUser.save();
    console.log(`👤 New User Registered: ${email}`);

    res.status(201).json({ message: "Registration Successful!" });

  } catch (e) {
    console.error("Signup Error:", e.message);
    res.status(500).json({ error: "Server error during signup" });
  }
});

// ==========================================
//            PRODUCT SECTION (TRACKING)
// ==========================================

// Product Schema
const productSchema = new mongoose.Schema({
  url: String,
  title: String,
  image: String,
  site: String,
  currentPrice: Number,
  priceHistory: [{ price: Number, date: { type: Date, default: Date.now } }],
  lastChecked: { type: Date, default: Date.now }
});

const Product = mongoose.models.Product || mongoose.model('Product', productSchema);

const parsePrice = txt => {
    if (!txt) return 0;
    return parseFloat(txt.toString().replace(/[^0-9.]/g, '')) || 0;
};

// Puppeteer Scraper
async function scrapeProduct(url) {
  console.log(`🔍 Scraping: ${url}`);
  const browser = await puppeteer.launch({ headless: "new", args: ['--no-sandbox'] });

  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36');
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

    const data = await page.evaluate(() => {
      const text = sel => document.querySelector(sel)?.innerText || null;
      const meta = p => document.querySelector(`meta[property="${p}"]`)?.content || null;
      const imgSrc = sel => document.querySelector(sel)?.src || null;

      let price = null;
      let image = meta('og:image');

      if (location.href.includes('wasi.lk')) {
        price = text('.price ins bdi') || text('.price bdi') || text('.woocommerce-Price-amount bdi');
      } else if (location.href.includes('simplytek')) {
        price = text('#ProductPrice') || text('.product__price') || text('.price-item--regular');
        if(!image) image = imgSrc('.product__media img');
      }
      
      if (!price) price = text('.product-price') || text('.price .amount') || meta('product:price:amount');

      return { title: meta('og:title') || document.title, image, price };
    });

    const finalPrice = parsePrice(data.price);
    
    // Determine Site Name
    let siteName = 'Store';
    if (url.includes('wasi')) siteName = 'Wasi.lk';
    else if (url.includes('simplytek')) siteName = 'SimplyTek';
    else if (url.includes('daraz')) siteName = 'Daraz';
    else if (url.includes('directdeal')) siteName = 'DirectDeals';

    return { title: data.title, image: data.image, price: finalPrice, site: siteName };

  } catch (error) { throw error; } finally { await browser.close(); }
}

// Routes
app.post('/api/products', async (req, res) => {
  try {
    const { url } = req.body;
    const exists = await Product.findOne({ url });
    if (exists) return res.json({ status: 'exists', product: exists });

    const scraped = await scrapeProduct(url);
    const product = await Product.create({ url, ...scraped, currentPrice: scraped.price, priceHistory: [{ price: scraped.price }] });
    
    console.log(`✅ Saved: ${scraped.title}`);
    res.status(201).json({ status: 'new', product });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/products', async (_, res) => {
  const products = await Product.find().sort({ lastChecked: -1 });
  res.json(products);
});

app.delete('/api/products/:id', async (req, res) => {
  await Product.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

// 3.1 Login Route (Aluthin damme)
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Email eken user hoyanawa
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: "User not found" });

    // Password eka match wenawada balanawa
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ error: "Invalid password" });

    // Hari nam, User ge Nama yawanawa
    res.json({ message: "Login success", name: user.name });

  } catch (e) {
    res.status(500).json({ error: "Server error" });
  }
});

app.listen(5000, () => console.log('🚀 Server running on http://localhost:5000'));