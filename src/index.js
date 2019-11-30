const TelegramBot = require('node-telegram-bot-api');
const mongoose = require('mongoose');
const geolib = require('geolib');
const _ = require('lodash');

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
require('./models/cinemas.model');
require('./models/user.model');

const Film = mongoose.model('films');
const Cinemas = mongoose.model('cinemas');
const User = mongoose.model('users');

// Populate DB
// database.films.forEach(film => new Film(film).save())
// database.cinemas.forEach(cinema => new Cinemas(cinema).save().catch(e => console.log(e)))

const ACTION_TYPES = {
    TOGGLE_FAV_FILM: 'tff',
    SHOW_CINEMAS: 'sc',
    SHOW_CINEMAS_LOCATION: 'scl',
    SHOW_FILMS: 'sf'
}

// Initiating a BOT
const bot = new TelegramBot(config.TOKEN, {
    polling: true
});

bot.on('message', (msg) => {
    const chatId = helper.getChatId(msg);

    switch(msg.text) {
        case KB.home.favourite:
            showFavouriteFilms(chatId, msg.from.id)
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
            bot.sendMessage(chatId, `Відправте місцезнаходження`, {
                reply_markup: {
                    keyboard: keyboard.cinemas
                }
            })
            break;
        case KB.back:
            bot.sendMessage(chatId, 'What would you like to watch?', {
                reply_markup: {
                    keyboard: keyboard.home
                }
            });
            break;
    }

    if (msg.location) {
        getCinemasByCoordinates(chatId, msg.location)
    }
});

// response on start command
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

bot.onText(/\/f(.+)/, (msg, [source, match]) => {
    const filmUuid = helper.getItemUuid(source);
    const chatId = helper.getChatId(msg);

    Promise.all([
        Film.findOne({ uuid: filmUuid }),
        User.findOne({ telegramId: msg.from.id }),
    ]).then(([
        {
            uuid,
            name,
            type,
            year,
            rate,
            picture,
            length,
            country,
            language = 'English',
            link,
            cinemas
        }, user]) => {

            let isFav = false;
            if (user) {
                isFav = user.films.indexOf(uuid) !== -1
            }

            const favText = isFav ? 'Видалити з вибраного' : 'Добавити у вибране'

            const caption = `🎬Фільм: ${name}\n\n📀Жанр: ${type}\n\n📅Рік випуску: ${year}\n\n🗺️Країна: ${country}\n\n⭐Рейтинг: ${rate}\n\n⏩Тривалість: ${length} год\n\n🌐Мова: ${language}`
            bot.sendPhoto(chatId, picture, {
                caption,
                reply_markup: {
                    inline_keyboard: [
                        [
                            {
                                text: favText,
                                callback_data: JSON.stringify({
                                    type: ACTION_TYPES.TOGGLE_FAV_FILM,
                                    filmUuid: uuid,
                                    isFav
                                })
                            },
                            {
                                text: 'Показати кінотеатри',
                                callback_data: JSON.stringify({
                                    type: ACTION_TYPES.SHOW_CINEMAS,
                                    cinemaUuids: cinemas
                                })
                            },
                        ],
                        [
                            {
                                text: `Дивитись онлайн ${name}`,
                                url: link
                            }
                        ]
                    ]
                }
            })
    })
});

bot.onText(/\/c(.+)/, (msg, [source, match]) => {
    const cinemaUuid = helper.getItemUuid(source);
    const chatId = helper.getChatId(msg);

    Cinemas.findOne({ uuid: cinemaUuid }).then(({ name, url, films, location }) => {
        bot.sendMessage(chatId, `Кінотеатр ${name}`, {
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: name,
                            url
                        }
                    ],
                    [

                        {
                            text: 'Показати кінотеатр на карті',
                            callback_data: JSON.stringify({
                                type: ACTION_TYPES.SHOW_CINEMAS_LOCATION,
                                lat: location.latitude,
                                lon: location.longitude
                            })
                        }
                    ],
                    [
                        {
                            text: 'Показати фільми',
                            callback_data: JSON.stringify({
                                type: ACTION_TYPES.SHOW_FILMS,
                                filmUuids: films
                            })
                        }
                    ]
                ]
            }
        })
    })  
})

bot.on('callback_query', query => {
    const userId = query.from.id;
    let data;

    try {
        data = JSON.parse(query.data)
    } catch (e) {
        throw new Error('Data is not an object')
    }

    const { type } = data;

    if (type === ACTION_TYPES.SHOW_CINEMAS) {
        sendCinemasByQuery(userId, { uuid: {'$in': data.cinemaUuids } })
    } else if (type === ACTION_TYPES.SHOW_CINEMAS_LOCATION) {
        const { lat, lon } = data;
        bot.sendLocation(query.message.chat.id, lat, lon)
    } else if (type === ACTION_TYPES.TOGGLE_FAV_FILM) {
        toggleFavouriteFilm(userId, query.id, data)
    } else if (type === ACTION_TYPES.SHOW_FILMS) {
        sendFilmsByQuery(userId, { uuid: {'$in': data.filmUuids }})
    }
})

bot.on('inline_query', query => {
    Film.find({}).then(films => {
        const results = films.map(({
            uuid,
            name,
            type,
            year,
            rate,
            picture,
            length,
            country,
            language = 'English',
            link,
        }) => {
            const caption = `🎬Фільм: ${name}\n\n📀Жанр: ${type}\n\n📅Рік випуску: ${year}\n\n🗺️Країна: ${country}\n\n⭐Рейтинг: ${rate}\n\n⏩Тривалість: ${length} год\n\n🌐Мова: ${language}`
            return {
                id: uuid,
                type: 'photo',
                photo_url: picture,
                thumb_url: picture,
                caption,
                reply_markup : {
                    inline_keyboard: [
                        [
                            {
                                text: `Дивитись онлайн: ${name}`,
                                url: link
                            }
                        ]
                    ]
                }
            }
        })

        bot.answerInlineQuery(query.id, results, {
            cache_time: 0
        })
        
    })
})

const sendFilmsByQuery = (chatId, query) => {
    Film.find(query).then(films => {
        if (films.length === 0) {
            const noFilmsMessage = 'Unfortunately, I wasn\'t able to find films according to your request\nPlease choose another genre below.'
            bot.sendMessage(chatId, noFilmsMessage, {
                reply_markup: {
                    keyboard: keyboard.films
                }
            })
            return ;
        }
        const html = films.map(({ name, uuid }, index) => {
            return `<b>${index + 1}.</b> ${name} - /f${uuid}`;
        }).join('\n');

        sendHTML(chatId, html, 'films');
    })
};

const sendHTML = (chatId, html, keyboardName) => {
    const options = {
        parse_mode: 'HTML'
    };

    if (keyboardName) {
        options['reply_markup'] = {
            keyboard: keyboard[keyboardName]
        }
    }

    bot.sendMessage(chatId, html, options);
}

const getCinemasByCoordinates = (chatId, location) => {
    Cinemas.find({}).then(cinemas => {
        cinemas.forEach(cinema => {
            cinema.distance = geolib.getDistance(location, cinema.location) / 1000;
        });

        cinemas = _.sortBy(cinemas, 'distance')

        const html = cinemas.map(({ uuid, name, distance }, index) => {
            return `<b>${index + 1}</b> ${name}. <em>Відстань:</em> <strong>${distance}</strong> км. /c${uuid}`
        }).join('\n')

        sendHTML(chatId, html, 'home')
    })
}

const toggleFavouriteFilm = (userId, queryId, { filmUuid, isFav }) => {
    let userPromise;
    User.findOne({ telegramId: userId })
        .then(user => {
            if (user) {
                if (isFav) {
                    user.films = user.films.filter(fUuid => fUuid !== filmUuid)
                } else {
                    user.films.push(filmUuid)
                }
                userPromise = user
            } else {
                userPromise = new User({
                    telegramId: userId,
                    films: [filmUuid]
                })
            }

            const answerText = isFav ? 'Фільм успішно видалено' : 'Фільм успішно добавлено'

            userPromise.save().then(() => {
                bot.answerCallbackQuery({
                    callback_query_id: queryId,
                    text: answerText
                }).catch(err => console.log(err))
            })
        })
}

const showFavouriteFilms = (chatId, telegramId) => {
    User.findOne({ telegramId })
        .then(user => {
            if (user) {
                Film.find({ uuid: {'$in': user.films }}).then(films => {
                    let html;

                    if (films.length) {
                        html = films.map(({ uuid, name, rate }, index) => {
                            return `<b>${index + 1}</b> ${name} - <b>${rate}</b> (/f${uuid})`
                        }).join('\n');
                    } else {
                        html = 'Ви ще не обрали жодного улюбленого фільму'
                    }

                    sendHTML(chatId, html, 'home')
                })
            } else {
                sendHTML(chatId, 'Ви ще не обрали жодного улюбленого фільму', home)
            }
        })
}

const sendCinemasByQuery = (userId, query) => {
    Cinemas.find(query).then(cinemas => {
        const html = cinemas.map(({ uuid, name }, index) => {
            return `<b>${index + 1}</b> ${name} - /c${uuid}`
        }).join('\n');

        sendHTML(userId, html, 'home');
    })
}