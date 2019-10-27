const TelegramBot = require('node-telegram-bot-api');
const config = require('./config');
const helper = require('./helper');
const KB = require('./keyboardButtons');
const keyboard = require('./keyboard');

helper.logStart();

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