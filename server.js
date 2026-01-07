const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const puppeteer = require('puppeteer');

const app = express();
app.use(cors());
app.use(express.json());

// 1. MongoDB Connection
mongoose.connect('mongodb://127.0.0.1:27017/pricepulse')
  .then(() => console.log('✅ MongoDB Connected'))
  .catch(err => console.error('❌ DB Error:', err));

// 2. Schema
const productSchema = new mongoose.Schema({
  url: String,
  title: String,
  image: String,
  site: String,
  currentPrice: Number,
  priceHistory: [{ price: Number, date: { type: Date, default: Date.now } }],
  lastChecked: { type: Date, default: Date.now }
});

const Product = mongoose.model('Product', productSchema);

// Helper: Clean Price
const parsePrice = txt => parseFloat(txt?.replace(/[^0-9.]/g, '')) || 0;

// 3. PUPPETEER SCRAPER
async function scrapeProduct(url) {
  console.log(`🔍 Scraping: ${url}`);
  
  const browser = await puppeteer.launch({
    headless: "new",
    args: ['--no-sandbox']
  });

  try {
    const page = await browser.newPage();
    
    // Fake User Agent to bypass blocks
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36');

    // Wait for page to load (60s timeout)
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

    // Extract Data from Page
    const data = await page.evaluate(() => {
      const text = sel => document.querySelector(sel)?.innerText || null;
      const meta = p => document.querySelector(`meta[property="${p}"]`)?.content || null;

      let price = null;

      // Wasi.lk Selectors
      if (location.href.includes('wasi.lk')) {
        price = text('.price ins bdi') || 
                text('.price bdi') || 
                text('.woocommerce-Price-amount bdi');
      }

      // SimplyTek Selectors
      if (location.href.includes('simplytek')) {
        price = text('#ProductPrice') || 
                text('.product__price') || 
                text('.price-item--regular');
      }

      // DirectDeals / General Fallback
      if (!price) {
         price = text('.product-price') || text('.price .amount');
      }

      return {
        title: meta('og:title') || document.title,
        image: meta('og:image'),
        price
      };
    });

    const finalPrice = parsePrice(data.price);
    if (!finalPrice || finalPrice === 0) throw new Error('Price not found');

    // Determine Site Name for Badge
    let siteName = 'Store';
    if (url.includes('wasi')) siteName = 'Wasi.lk';
    else if (url.includes('simplytek')) siteName = 'SimplyTek';
    else if (url.includes('directdeal')) siteName = 'DirectDeals';
    else if (url.includes('dialcom')) siteName = 'Dialcom';

    return {
      title: data.title,
      image: data.image || 'https://via.placeholder.com/300',
      price: finalPrice,
      site: siteName
    };

  } catch (error) {
    throw error;
  } finally {
    await browser.close(); // Close browser to save RAM
  }
}

// 4. ROUTES
app.post('/api/products', async (req, res) => {
  try {
    const { url } = req.body;

    // Check Duplicates
    const exists = await Product.findOne({ url });
    if (exists) {
      console.log(`ℹ️ Exists: ${exists.title}`);
      return res.json({ status: 'exists', product: exists });
    }

    // Scrape & Save
    const scraped = await scrapeProduct(url);

    const product = await Product.create({
      url,
      ...scraped,
      currentPrice: scraped.price,
      priceHistory: [{ price: scraped.price }]
    });

    console.log(`✅ Saved: ${scraped.title}`);
    res.status(201).json({ status: 'new', product });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/products', async (_, res) => {
  const products = await Product.find().sort({ lastChecked: -1 });
  res.json(products);
});

app.delete('/api/products/:id', async (req, res) => {
  await Product.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

app.listen(5000, () =>
  console.log('🚀 Server running on http://localhost:5000')
);