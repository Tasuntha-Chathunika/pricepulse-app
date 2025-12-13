require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const Product = require('./models/Product');
const scrapeProduct = require('./utils/scraper');

const app = express();

// Middleware (Server settings)
app.use(cors());
app.use(express.json());
app.use(express.static('public')); // Obe HTML files 'public' folder eken gannawa

// Database Connection
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('✅ MongoDB Connected Successfully!'))
    .catch(err => console.error('❌ MongoDB Connection Error:', err));

// --- API ROUTES ---

// 1. Aluth Product ekak track karanna (API Endpoint)
app.post('/api/track', async (req, res) => {
    const { url } = req.body;
    
    if (!url) return res.status(400).json({ error: 'URL is required' });

    try {
        console.log("🔍 Analyzing URL:", url);

        // Kalin save karalada balanawa
        let existingProduct = await Product.findOne({ url });
        if (existingProduct) {
            return res.status(200).json({ message: 'Already tracking this item', product: existingProduct });
        }

        // Scrape karanawa (Wasi/Daraz)
        const data = await scrapeProduct(url);
        
        if (!data) {
            return res.status(500).json({ error: 'Failed to find price. Please check the link.' });
        }

        // Database ekata save karanawa
        const newProduct = new Product({
            url,
            title: data.title,
            currentPrice: data.price,
            image: data.image,
            site: data.site,
            priceHistory: [{ price: data.price }]
        });

        await newProduct.save();
        console.log("💾 Saved to DB:", data.title);
        
        res.status(201).json({ message: 'Tracking Started!', product: newProduct });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server Error' });
    }
});

// 2. Track karana badu list eka ganna
app.get('/api/products', async (req, res) => {
    try {
        const products = await Product.find().sort({ lastChecked: -1 });
        res.json(products);
    } catch (error) {
        res.status(500).json({ error: 'Server Error' });
    }
});

// ... kalin routes uda thiyenawa ...

// 3. Delete Product (Remove item)
app.delete('/api/products/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await Product.findByIdAndDelete(id);
        res.json({ message: 'Product deleted successfully' });
    } catch (error) {
        console.error("Delete Error:", error);
        res.status(500).json({ error: 'Server Error' });
    }
});

// ... Server Start code eka pahalin thiyenawa ...

// Server Start
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));