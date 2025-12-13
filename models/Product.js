const mongoose = require('mongoose');

const ProductSchema = new mongoose.Schema({
    url: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    currentPrice: { type: Number, required: true },
    image: { type: String },
    site: { type: String }, // 'wasi' or 'daraz'
    priceHistory: [
        {
            price: Number,
            date: { type: Date, default: Date.now }
        }
    ],
    lastChecked: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Product', ProductSchema);