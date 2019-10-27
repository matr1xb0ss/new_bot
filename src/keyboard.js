const KB = require('./keyboardButtons');


module.exports = {
    home: [
        [KB.home.films, KB.home.cinemas],
        [KB.home.favourite]
    ],
    film: [
        [KB.film.random],
        [KB.film.action, KB.film.comedy],
        [KB.back]
    ],
}