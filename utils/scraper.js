const axios = require('axios');
const cheerio = require('cheerio');

async function scrapeProduct(url) {
    try {
        const { data } = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });

        const $ = cheerio.load(data);
        let title = "Unknown Product";
        let price = 0;
        let site = "";
        let image = ""; // 1. Image variable eka haduwa

        // --- COMMON IMAGE FINDER (Lesima krame) ---
        // Godak sites wala "og:image" kiyana meta tag eke thama photo eka thiyenne
        image = $('meta[property="og:image"]').attr('content');

        // --- WASI.LK SPECIFIC ---
        if (url.includes('wasi.lk')) {
            site = "Wasi.lk";
            title = $('.product_title').first().text().trim();
            let priceText = $('.price .amount bdi').first().text();
            if (!priceText) priceText = $('.woocommerce-Price-amount').first().text();
            price = parseFloat(priceText.replace(/[^0-9.]/g, ''));
        }
        
        // --- DARAZ SPECIFIC ---
        else if (url.includes('daraz.lk')) {
            site = "Daraz";
            title = $('title').text().replace('| Daraz.lk', '').trim();
            let priceText = $('meta[property="og:price:amount"]').attr('content');
            price = parseFloat(priceText);
        }

        // Image eka hambune nathnam default ekak danna
        if (!image) image = "https://via.placeholder.com/150";

        console.log(`✅ Scraped: ${title} \n📷 Image: ${image}`); // Log karala balamu

        if (!price || isNaN(price)) return null;

        // 2. Return karaddi image ekath yawanna
        return { title, price, site, image };

    } catch (error) {
        console.error("❌ Scraping Error:", error.message);
        return null;
    }
}

module.exports = scrapeProduct;