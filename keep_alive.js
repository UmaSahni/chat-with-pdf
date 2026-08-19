const https = require('https');

const urls = [
  'https://chat-with-pdf-backend-t6z9.onrender.com/api/health',
  'https://chat-with-pdf-frontend-kwwf.onrender.com'
];

function ping(url) {
  https.get(url, (res) => {
    console.log(`[${new Date().toISOString()}] Pinged ${url} - Status: ${res.statusCode}`);
  }).on('error', (err) => {
    console.error(`[${new Date().toISOString()}] Error pinging ${url}:`, err.message);
  });
}

console.log("Starting Render keep-alive pinger...");
// Ping immediately
urls.forEach(ping);

// Ping every 10 minutes (600,000 ms)
setInterval(() => {
  console.log("Pinging Render services to prevent sleeping...");
  urls.forEach(ping);
}, 10 * 60 * 1000);
