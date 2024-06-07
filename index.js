require('dotenv').config();
const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { table } = require('table');

// Enable promise cancellation
process.env.NTBA_FIX_319 = 1;

// Initialize Express app
const app = express();
const port = process.env.PORT || 3000;

// Bot token
const token = process.env.TELEGRAM_BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

// Function to read data from JSON file
function readData(chatId) {
    const storageDir = path.join(__dirname, 'storage', String(chatId));
    const filePath = path.join(storageDir, 'data.json');

    if (fs.existsSync(filePath)) {
        const fileContent = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(fileContent);
    }

    return null;
}

// Function to extract IP, country, and AS information from JSON data
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

// Function to send formatted Telegram message
async function kirimrapi(chatId, text) {
    await bot.sendMessage(chatId, '\n```\n' + text + '\n```', { parse_mode: 'Markdown' });
}

// Function to save email and password to userdata folder
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

// Function to delete email and password from system
function deleteUserData(chatId) {
    const userDataDir = path.join(__dirname, 'userdata', String(chatId));
    if (fs.existsSync(userDataDir)) {
        try {
            fs.rmSync(userDataDir, { recursive: true, force: true });
            return true; // Successfully deleted
        } catch (error) {
            console.error("Failed to delete user data:", error);
            return false; // Failed to delete
        }
    }
    return false; // No user data found
}

// Function to read email from file
function readEmail(chatId) {
    const emailFilePath = path.join(__dirname, 'userdata', String(chatId), `email_${chatId}.txt`);
    if (fs.existsSync(emailFilePath)) {
        return fs.readFileSync(emailFilePath, 'utf8').trim();
    }
    return null;
}

// Function to read password from file
function readPassword(chatId) {
    const passwordFilePath = path.join(__dirname, 'userdata', String(chatId), `password_${chatId}.txt`);
    if (fs.existsSync(passwordFilePath)) {
        return fs.readFileSync(passwordFilePath, 'utf8').trim();
    }
    return null;
}

// Function to save cookie to file
function saveCookie(chatId, cookie) {
    const cookieFilePath = path.join(__dirname, 'userdata', String(chatId), `cookie_${chatId}.txt`);
    fs.writeFileSync(cookieFilePath, cookie);
}

// Function to read cookie from file
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

// Function to save data from each page to JSON file
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
                await bot.sendMessage(chatId, `Data from page ${page} successfully retrieved and saved as ip_${page}.json`);

            } else {
                await bot.sendMessage(chatId, `Failed to retrieve data from page ${page}`);
            }
        } catch (error) {
            console.error(`Error fetching URL ${getUrl}:`, error);
            await bot.sendMessage(chatId, `Failed to retrieve data from page ${page} due to an error.`);
        }
    }
}

// Bot actions when receiving messages
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const message = msg.text.toString().trim();
    const userName = msg.from.username || msg.from.first_name || "User";

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
WELCOME TO EDGE SCRAPE
 
 • Username: ${userName}
 • Email: ${email}
 • Monthly Limit: ${requestsLeft}
 
 INFO
 
 - /setakun xx@gmail.com@12345
 - /hapusakun
 - /getdata query
 - /contohquery
 - /atasilimit `;
            await kirimrapi(chatId, welcome);

        } else {
            await bot.sendMessage(chatId, 'Hello! Please send your email and password in the format:\nemail:password');
        }
    } else if (message.startsWith('/atasilimit')) {
        const atasi = `If your limit has been exhausted, because resetting the limit takes 1 month, use this method:

1. Log out from the website https://www.binaryedge.io/
2. Sign up with a new email using a temporary email service
3. Login to the bot using the new email and the limit will be refreshed`;
        await kirimrapi(chatId, atasi);

    } else if (message.startsWith('/hapusakun')) {
        const success = deleteUserData(chatId);
        if (success) {
            await bot.sendMessage(chatId, "Your data has been successfully deleted from the system.");
        } else {
            await bot.sendMessage(chatId, "Failed to delete your data. Maybe it has already been deleted.");
        }
    } else if (message.startsWith('/contohquery')) {
        const contoh = `
Here are some example queries for BinaryEdge API:
 
1. Search for web services with Cloudflare protection:
   \`product:cloudflare && port:443\`

2. Search for vulnerable servers with specific headers:
   \`headers:"CF-RAY" && headers:"Content-Length: 155"\`

3. Search for open ports and services on IP ranges:
   \`ip:192.168.0.0/16 && port:22\`

4. Search for specific response codes in HTTP responses:
   \`response:"HTTP/1.1 200 OK"\`

Customize these queries based on your needs and refer to the BinaryEdge API documentation for more details.`;
        await kirimrapi(chatId, contoh);

    } else if (message.startsWith('/setakun')) {
        const akun = message.split(' ')[1];
        if (!akun || !akun.includes('@') || !akun.includes(':')) {
            await bot.sendMessage(chatId, 'Please send your email and password in the correct format:\n/setakun email:password');
            return;
        }
        const [email, password] = akun.split(':');
        saveUserData(chatId, email, password);
        await bot.sendMessage(chatId, `Account set successfully for email: ${email}`);
    } else if (message.startsWith('/getdata')) {
        const cookie = readCookie(chatId);
        const limiturl = "https://api.app.binaryedge.io/v2/subscriptions/user/";
        const limitku = await GET(limiturl, cookie);
        const limitmu = JSON.stringify(limitku);
        const data = JSON.parse(limitmu);
        const requestsLeft = data.results[0].requests_left;
        const maxPage = Math.ceil(requestsLeft / 25);
        await getDataFromPages(chatId, maxPage, cookie);

        // Process and extract data from the saved JSON files
        const storageDir = path.join(__dirname, 'storage', String(chatId));
        const combinedData = [];

        for (let page = 1; page <= maxPage; page++) {
            const filePath = path.join(storageDir, `ip_${page}.json`);
            if (fs.existsSync(filePath)) {
                const fileContent = fs.readFileSync(filePath, 'utf8');
                const pageData = JSON.parse(fileContent);
                combinedData.push(...pageData);
            }
        }

        const extractedInfo = extractInfo(combinedData);
        const tableData = extractedInfo.map(info => [info.ip, info.country, info.as_name]);
        const tableConfig = {
            header: {
                alignment: 'center',
                content: 'Extracted Data'
            }
        };
        const output = table([['IP', 'Country', 'AS Name'], ...tableData], tableConfig);
        await kirimrapi(chatId, output);
    } else {
        await bot.sendMessage(chatId, "Sorry, I didn't understand that command.");
    }
});

// Start the Express server
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
