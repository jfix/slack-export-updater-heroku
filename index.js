const express = require('express')

const { postExport } = require('./api-post.js')
const { getAllInOne, getIndex } = require('./api-get.js')

const app = express()

// =============================================================================
// IGNORE ALL GET REQUESTS EXCEPT UPTIMEBOT
app.get('/', getIndex)

// =============================================================================
// RETURN STATS, HEATMAP AND MEME DATA AS ONE JSON OBJECT
app.get('/aio', getAllInOne)

// =============================================================================
// ENDPOINT FOR API TO POST AN EXPORT
app.post('/', postExport);

app.listen(process.env.PORT || 3000, () => {
  console.log('Heroku ExpressJS HTTP Express server started');
});
