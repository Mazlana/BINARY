const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { table } = require('table');
const bodyParser = require('body-parser');
const keep_alive = require('./alive.js') 

// Initialize Express app
const app = express();
app.use(bodyParser.json());

// Bot token
const token = '7356587031:AAGvGesBkSwXTE1NkA5YmjB9ZcozNjtp3Xc';


// Initialize bot
const bot = new TelegramBot(token, { polling: true });

// Helper functions
function readData(chatId) {
    const storageDir = path.join(__dirname, 'storage', String(chatId));
    const filePath = path.join(storageDir, 'data.json');

    if (fs.existsSync(filePath)) {
        const fileContent = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(fileContent);
    }

    return null;
}

function extractInfo(data) {
    const extractedData = [];
    const seenIPs = new Set();

    data.forEach(event => {
        const ip = event.ip;
        const country = event.geoip.country_name;
        const as_name = event.as_name;

        if (ip && !seenIPs.has(ip)) {
            seenIPs.add(ip);
            extractedData.push({ ip, country, as_name });
        }
    });

    return extractedData;
}

async function kirimrapi(chatId, text) {
    await bot.sendMessage(chatId, '\n```\n' + text + '\n```', { parse_mode: 'Markdown' });
}

function saveUserData(chatId, email, password) {
    const userDataDir = path.join(__dirname, 'userdata', String(chatId));
    if (!fs.existsSync(userDataDir)) {
        fs.mkdirSync(userDataDir, { recursive: true });
    }

    const emailFilePath = path.join(userDataDir, `email_${chatId}.txt`);
    fs.writeFileSync(emailFilePath, email);

    const passwordFilePath = path.join(userDataDir, `password_${chatId}.txt`);
    fs.writeFileSync(passwordFilePath, password);
}

function deleteUserData(chatId) {
    const userDataDir = path.join(__dirname, 'userdata', String(chatId));
    if (fs.existsSync(userDataDir)) {
        try {
            fs.rmSync(userDataDir, { recursive: true, force: true });
            return true;
        } catch (error) {
            console.error("Gagal menghapus user data:", error);
            return false;
        }
    }
    return false;
}

function readEmail(chatId) {
    const emailFilePath = path.join(__dirname, 'userdata', String(chatId), `email_${chatId}.txt`);
    if (fs.existsSync(emailFilePath)) {
        return fs.readFileSync(emailFilePath, 'utf8').trim();
    }
    return null;
}

function readPassword(chatId) {
    const passwordFilePath = path.join(__dirname, 'userdata', String(chatId), `password_${chatId}.txt`);
    if (fs.existsSync(passwordFilePath)) {
        return fs.readFileSync(passwordFilePath, 'utf8').trim();
    }
    return null;
}

function saveCookie(chatId, cookie) {
    const cookieFilePath = path.join(__dirname, 'userdata', String(chatId), `cookie_${chatId}.txt`);
    fs.writeFileSync(cookieFilePath, cookie);
}

function readCookie(chatId) {
    const cookieFilePath = path.join(__dirname, 'userdata', String(chatId), `cookie_${chatId}.txt`);
    if (fs.existsSync(cookieFilePath)) {
        return fs.readFileSync(cookieFilePath, 'utf8').trim();
    }
    return null;
}

async function POST(url, data) {
    try {
        const response = await axios.post(url, data, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
                'Content-Type': 'application/json'
            }
        });
        return response.data;
    } catch (error) {
        console.error(`Error posting to URL ${url}:`, error);
        return null;
    }
}

async function GET(url, cookie) {
    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
                'authorization': cookie
            }
        });
        return response.data;
    } catch (error) {
        console.error(`Error fetching URL ${url}:`, error);
        return null;
    }
}

async function getDataFromPages(chatId, maxPage, cookie) {
    const storageDir = path.join(__dirname, 'storage', String(chatId));
    if (!fs.existsSync(storageDir)) {
        fs.mkdirSync(storageDir, { recursive: true });
    }

    for (let page = 1; page <= maxPage; page++) {
        const getUrl = `https://api.app.binaryedge.io/v2/query/web/search?page=${page}&query=product:cloudflare && port:443 && headers:"CF-RAY" && headers:"Content-Length: 155" && response:"HTTP/1.1 400 Bad Request"`;
        try {
            const response = await axios.get(getUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
                    'authorization': cookie
                }
            });

            if (response && response.data) {
                const filePath = path.join(storageDir, `ip_${page}.json`);
                fs.writeFileSync(filePath, JSON.stringify(response.data.events, null, 2));
                await bot.sendMessage(chatId, `Data dari Halaman ${page} berhasil diambil dan disimpan sebagai ip_${page}.json`);
            } else {
                await bot.sendMessage(chatId, `Gagal mengambil data dari Halaman ${page}`);
            }
        } catch (error) {
            console.error(`Error fetching URL ${getUrl}:`, error);
            await bot.sendMessage(chatId, `Gagal mengambil data dari Halaman ${page} karena kesalahan.`);
        }
    }
}

// Bot message handler
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const message = msg.text.toString().trim();
    const userName = msg.from.username || msg.from.first_name || "Pengguna";

    if (message.startsWith('/start')) {
        const email = readEmail(chatId);
        const password = readPassword(chatId);
        const postUrl = 'https://api.app.binaryedge.io/v2/user/login/';
        const postData = { email, password };
        const postResponse = await POST(postUrl, postData);
        const jwt = `JWT ${postResponse.token}`;
        saveCookie(chatId, jwt);
        if (email) {
            const cookie = readCookie(chatId);
            const limiturl = "https://api.app.binaryedge.io/v2/subscriptions/user/";
            const limitku = await GET(limiturl, jwt);
            const limitmu = JSON.stringify(limitku);
            const data = JSON.parse(limitmu);
            const requestsLeft = data.results[0].requests_left;

            const welcome = `
SELAMAT DATANG DI EDGE SCRAPE
 
 • Username : ${userName}
 • Email    : ${email}
 • Limit Bulanan : ${requestsLeft}
 
 INGPO
 
 - /setakun xx@gmail.com@12345
 - /hapusakun
 - /getdata query
 - /contohquery
 - /atasilimit `;
            await kirimrapi(chatId, welcome);

        } else {
            await bot.sendMessage(chatId, 'Halo! Silakan kirimkan email dan password Anda dalam format:\nemail:password');
        }
    } else if (message.startsWith('/atasilimit')) {
        const atasi = `Apabila limit kamu sudah habis, karena untuk mereset limit perlu 1 bulan. Gunakan cara ini :

1. Silakan logout dari web https://www.binaryedge.io/ 
2. Silakan buat kembali Account dengan email lain
3. Jika tidak punya maka tambahkan titik pada email (e.xample@gmail.com) 
4. Silakan Verifikasi akun pada web
5. Setelah succes verifikasi gunakan /hapusakun
6. Kemudian /setakun e.xample@gmail.com@password
7. Gunakan /start apakah succes login
`
        bot.sendMessage(chatId, atasi);
    } else if (message.startsWith('/contohquery')) {
        const kata = `
CONTOH QUERY 
  
product:cloudflare && port:443 && headers:"CF-RAY" && headers:"Content-Length: 155" && response:"HTTP/1.1 400 Bad Request" && country:"SG"`
        await kirimrapi(chatId, kata);
    } else if (message.startsWith('/deleteData')) {
        const success = deleteUserData(chatId);
        if (success) {
            await bot.sendMessage(chatId, 'Data email dan password Anda berhasil dihapus!');
        } else {
            await bot.sendMessage(chatId, 'Tidak ada data email dan password yang ditemukan.');
        }
    } else if (message.includes(':')) {
        const [email, password] = message.split(':');
        saveUserData(chatId, email, password);
        const postUrl = 'https://api.app.binaryedge.io/v2/user/login/';
        const postData = { email, password };
        const postResponse = await POST(postUrl, postData);
        console.log(postResponse);
        if (postResponse && postResponse.token) {
            const cookie = `JWT ${postResponse.token}`;
            saveCookie(chatId, cookie);
            await bot.sendMessage(chatId, 'Login berhasil!');
        } else {
            await bot.sendMessage(chatId, 'Login gagal. Silakan coba lagi.');
        }
    } else if (message.startsWith('/getdata')) {
        const query = message.split(' ').slice(1).join(' ');
        const email = readEmail(chatId);
        const cookie = readCookie(chatId);

        if (query.length === 0) {
            await bot.sendMessage(chatId, "Query tidak boleh kosong. Silakan masukkan query setelah perintah '/getdata'.");
        } else if (query.length < 3) {
            await bot.sendMessage(chatId, "Query harus terdiri dari minimal 3 huruf. Silakan masukkan query yang valid.");
        } else if (query.length >= 3 && query.length < 5) {
            await bot.sendMessage(chatId, "Query harus terdiri dari minimal 5 huruf jika lebih dari satu kata. Silakan masukkan query yang valid.");
        } else if (!email && !cookie) {
            await bot.sendMessage(chatId, 'Silakan login terlebih dahulu dengan mengirim email dan password.');
        } else {
            const maxPage = 4;
            await getDataFromPages(chatId, maxPage, cookie);
        }
    }
});

// Start the Express server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
