const TelegramBot = require('node-telegram-bot-api');
const mongoose = require('mongoose');
const config = require('./config');
const helper = require('./helper');
const KB = require('./keyboardButtons');
const keyboard = require('./keyboard');
const database = require('./database.json');

helper.logStart();

// Connecting DB
mongoose.connect(config.DB_URL, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('Database was connected successfully'))
    .catch((error) => console.warn(error));

require('./models/film.model');

const Film = mongoose.model('films');

// Populate DB
// database.films.forEach(film => new Film(film).save())


// Initiating a BOT
const bot = new TelegramBot(config.TOKEN, {
    polling: true
});

bot.on('message', (msg) => {
    const chatId = helper.getChatId(msg);

    switch(msg.text) {
        case KB.home.favourite:
            break;
        case KB.home.films:
            bot.sendMessage(chatId, 'Now choose film type:', {
                reply_markup: {
                    keyboard: keyboard.film
                }
            });
            break;
        case KB.film.comedy:
            sendFilmsByQuery(chatId, { type: 'comedy' })
            break;
        case KB.film.action:
            sendFilmsByQuery(chatId, { type: 'action' })
            break;
        case KB.film.random:
            sendFilmsByQuery(chatId, {});
            break;
        case KB.home.cinemas:
            break;
        case KB.back:
            bot.sendMessage(chatId, 'What would you like to watch?', {
                reply_markup: {
                    keyboard: keyboard.home
                }
            });
            break;
    }
});

bot.onText(/\/start/, (msg) => {
    const welcomeText = `Hello, ${msg.from.first_name}!\nTo start using this bot, please select a command from list below:`;
    const chatId = helper.getChatId(msg);
    const chatKeyboard =  {
        reply_markup: {
            keyboard: keyboard.home
        },
    }

    bot.sendMessage(chatId, welcomeText, chatKeyboard);

})

const sendFilmsByQuery = (chatId, query) => {
    Film.find(query).then(films => {
        const html = films.map(({ name, uuid }, index) => {
            return `<b>${index + 1}</b> ${name} - /f${uuid}`;
        }).join('\n');

        sendHTML(chatId, html, 'films');
    })
};

const sendHTML = (chatId, html, kbName) => {
    const options = {
        parse_mode: 'HTML'
    };

    if (kbName) {
        options['reply_markup'] = {
            keyboard: keyboard[kbName]
        }
    }

    bot.sendMessage(chatId, html, options);
}