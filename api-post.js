const moment = require('moment')
const mongoose = require('mongoose')
const MongoClient = require('mongodb').MongoClient
const qs = require('querystring')
const got = require('got')
const FormData = require('form-data')
// mongodb will check for this module and throw a warning if not found
require('saslprep')

const { Export } = require('./db.js')

// =============================================================================
// DB CONNECTION DETAILS
const dbUser = process.env.EXPORT_STATS_MONGO_USER
const dbPwd = process.env.EXPORT_STATS_MONGO_PWD
const dbHost = process.env.EXPORT_STATS_MONGO_HOST
const dbDb = process.env.EXPORT_STATS_MONGO_DB
const dbColl = process.env.EXPORT_STATS_MONGO_COLL
const dbConn = `mongodb+srv://${dbUser}:${dbPwd}@${dbHost}/${dbDb}`

// =============================================================================
// A BUNCH OF VARIABLES NEEDED IN SEVERAL PLACES
let db
const errMsg = `Really sorry but for some weird reason I couldn't save the export. Please see an administrator with this info:`

// =============================================================================
// CHECK FOR AN EXISTING RECORD IN THE DATABASE
const checkForExistingRecord = async (date) => {
  const _start = date.clone().utc().startOf('day')
  const _end = date.clone().utc().endOf('day')
  const exArr = await Export.find({ date: { $gte: _start, $lte: _end } })
  const existsAlready = exArr.length
  console.log(`existsAlready: ${existsAlready}, start: ${_start}, end: ${_end}, existsAlready: ${existsAlready > 0}`)
  return existsAlready > 0
}

// =============================================================================
// SAVE A NEW RECORD IN THE DATABASE
const saveNewRecord = async (exportSuccessful, date) => {

    console.log(`About to add document to database ...`)
    // prepare the data to save in the database
    const anExport = new Export({
        date: date.toDate(),
        exportSuccessful: exportSuccessful,
        month: date.month(),
        week: date.week(),
        year: date.year(),
        weekDay: date.format('ddd')
    })
    const res = await anExport.save()
    console.log(`SAVED EXPORT RES: ${JSON.stringify(res)}`)
    return res
}

// =============================================================================
// SEND FINAL RESPONSE
const sendResponse = async (url, message) => {
    console.log(`Now sending a message back to Slack. ${url} - ${JSON.stringify(message)}`)
    await got.post(url, {
        json: message
    })
}

const postExport =  (request, response) => {
    try {
        mongoose.connect(dbConn, { useNewUrlParser: true, useUnifiedTopology: true })
        db = mongoose.connection
        db.on('error', (err) => console.log(`connection error: ${err}`))
        db.once('open', async () => {
            console.log(`DB IS OPEN!`)

            // get the data from the POST body while there is data
            let body = ''
            request.on('data', (data) => {
                console.log('collecting data from request ...')
                body += data
                if (body.length > 1e6) {
                    request.connection.destroy()
                    db.close()
                    console.log(`DB IS NOW CLOSED`)
                }
            })

            // once the request has been received completely
            request.on('end', async () => {
                const content = qs.parse(body)
                let payload = {}
                try {
                    payload = JSON.parse(content.payload)
                } catch(err) {
                    throw new Error('payload is not JSON')
                }

                // now that the request is finished, quickly reply
                // note we're using the native node http reponse object, not the Express one!
                response.statusCode = 200
                response.setHeader('Content-Type', 'application/json')
                await response.end(JSON.stringify({
                    'text': '_OK, will go ahead and wake Heroku. This won\'t take long!_ :wink:',
                    'response_type': 'ephemeral',
                    'replace_original': false
                }))

                // const payload = {"user": {"id": "TESTUSER"}, "actions": [{"value": "yyyyymmdd-ok"}], 
                // "response_url": "the response url to use to post back to"}
                console.log(`PAYLOAD: ${JSON.stringify(payload)}`)
                const [dateString, exportResult] = payload.actions[0].value.split('-')
                const responseUrl = payload.response_url
                console.log(`dateString: ${dateString} - exportResult: ${exportResult} - responseUrl: ${responseUrl}`)
                const exportSuccessful = exportResult === 'ok'
                const parsedDate = moment(dateString, 'YYYYMMDD')
                const userId = payload.user.id
                const responseMsg = exportSuccessful
                    ? `Great! :+1: Thanks a lot`
                    : `Hmmm, this smells like a PDCA! :wink: Thanks anyway`
                const responseDate = (parsedDate.day() === 5) 
                    ? 'Friday' 
                    : 'yesterday'
                const resMsg = `${responseMsg} <@${userId}>, ${responseDate}'s export has been successfully recorded. <https://oecd.github.io/export-stats/|Find out more> (:chart_with_upwards_trend: and stuff).`

                // check only now whether the record exists because only now do we have the date
                // (no longer using the current one, but the one that has been sent from Slack
                // hidden in the value)
                if (await checkForExistingRecord(parsedDate)) {
                    // don't save document if there is already one with the same date
                    console.log(`Not adding document to database (already one with ${parsedDate.toDate()} in the db).`)
                    db.close()
                    console.log(`DB IS NOW CLOSED`)
                    sendResponse(responseUrl, {
                        'text': `${responseMsg} <@${userId}>. <https://oecd.github.io/export-stats/|Check here> for charts and stuff.`,
                        'replace_original': true,
                        'response_type': 'in_channel'
                    })
                } else {
                    const res = await saveNewRecord(exportSuccessful, parsedDate)
                    if (res) {
                        console.log(`Successfully saved document in database.`)
                        console.log(`res: ${res}`)
                        sendResponse(responseUrl, {
                            'text': resMsg,
                            'replace_original': true,
                            'response_type': 'in_channel'
                        })
                    } else {
                        console.log(`Error while saving: ${JSON.stringify(res)}`)
                        sendResponse(responseUrl, {
                            'text': `${errMsg} ${JSON.stringify(res)}`,
                            'replace_original': true,
                            'response_type': 'in_channel'
                        })
                    }
                    console.log('Finished interaction, database is not yet closed. Good-bye!')
                    db.close()
                    console.log(`DB IS NOW CLOSED`)
                }
            }) // request.on('end'....
        }) // db open
    } catch (err) {
        console.log(`CATCH: ${JSON.stringify(err)}`)
        db.close()
        console.log(`DB IS NOW CLOSED`)
        return (err) => response.status(500).json({
            error: err
        })
    }
}

module.exports = {
    postExport
}
