const moment = require('moment')
const mongoose = require('mongoose')
const MongoClient = require('mongodb').MongoClient
const qs = require('querystring')
const got = require('got')
const FormData = require('form-data')
// mongodb will check for this module and throw a warning if not found
require('saslprep')

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
// SCHEMA FOR AN EXPORT RECORD
const Schema = mongoose.Schema
const exportSchema = new Schema({
  date: {
    type: Date,
    default: Date.now
  },
  exportSuccessful: Boolean,
  month: Number,
  week: Number,
  year: Number,
  weekDay: String
})
const Export = mongoose.model('Export', exportSchema)


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

// this function is used by the /stats endpoint to retrieve data
const getPipeline = (limit) => {
    const year = (new Date()).getFullYear()

    return [
        { $sort: { date: -1 } },
        { $limit: limit },
        {
            '$group': {
                '_id': 'null',
                // count all documents
                'total': {
                    '$sum': 1
                },
                'currentYearTotal': {
                    
                    '$sum': {
                        '$cond': { if: { $eq: [ '$year', year ] }, then: 1, else: 0 }
                    }
                },
                // count successful exports if 
                // they have the 'exportSuccessful' property set to true
                // and date from the current year (right now hard-coded)
                'success': {
                   '$sum': {
                        '$cond': [{
                            '$and': [
                                { '$eq': ['$exportSuccessful', true] },
                                { '$eq': [ '$year', year ] }   
                            ]
                            }, 1, 0]
                    }
               }
            }
        },
        // remove _id property from output
        {
           '$project': { '_id': false }
        }
    ]
}

// what happens when / is request via GET
const getIndex = async (request, response) => {
    const ua = request.get('user-agent')
    if (ua.includes('UptimeRobot/2.0')) {
        console.log(`${new Date()}: Uptimebot says hello!`)
        await response.set(200)
    } else {
        console.log(`${new Date()}: Uh oh, someone else is visiting: ${ua}`)
    }
}

const getAllInOne = async (request, response) => {
    const heatmap = await _heatmap()
    const stats = await _stats()
    const meme = await _meme()

    if (heatmap && stats && meme) {
        response.setHeader('Access-Control-Allow-Origin', '*')
        await response.json({
            heatmap,
            stats,
            meme
        }).status(200)
    } else {
        console.log(`ERROR in ALL-IN-ONE`)
    }
}
const _stats = async () => {
    return new Promise( async (resolve, reject) => {
        const client = await MongoClient.connect(dbConn, { 
            useNewUrlParser: true, 
            useUnifiedTopology: true 
        })
        try {
            console.log(`Serving _stats now ...`)
            const dbo = client.db(dbDb)
            const coll = dbo.collection(dbColl)
            const allTime = await coll.aggregate(getPipeline(2000)).toArray()
            const month =  await coll.aggregate(getPipeline(30)).toArray()
            const hundred =  await coll.aggregate(getPipeline(100)).toArray()
            return resolve({
                'month': month[0],
                'hundred': hundred[0],
                'alltime': allTime[0]
            })
        } catch(e) {
            return reject(`ERROR in _stats: ${e}`)
        } finally {
            client.close()
        }
    })
}

const getStats = async (request, response) => {
    try {
        const stats = await _stats()
        if (stats) {
            response.setHeader('Access-Control-Allow-Origin', '*')
            response.json(stats).status(200)
        } else {
            throw new Error('Could not retrieve stats!')
        }
    } catch(e) {
        res.status(500).send(e)
    }
}

const _heatmap = async () => {
    return new Promise( async (resolve, reject) => {
        try {
            mongoose.connect(dbConn, { useNewUrlParser: true, useUnifiedTopology: true })
            let docs = {}
            const db = mongoose.connection
            db.once('open', async function() {
                const cursor = Export.find({}).sort({date: 1}).cursor()
                cursor.on('data', (doc) => {
                    const year = moment(doc.date).year()
                    const obj = { 
                        date: doc.date, 
                        value: doc.exportSuccessful ? 1 : -1 
                    }
                    if (year in docs) {
                        docs[year].push(obj)
                    } else {
                        docs[year] = [obj]
                    }
                })
                cursor.on('close', () => {
                    db.close()
                    return resolve(docs)
                })        
            })

        } catch(e) {
            db.close()
            return reject(`ERROR in _heatmap: ${e}`)
        }
    })
}

const getHeatmap = async (req, res) => {
    try {
        const heatmap = await _heatmap()
        if (heatmap) {
            res.setHeader('Access-Control-Allow-Origin', '*')
            res.json(heatmap)
        } else {
            throw new Error('Could not retrieve heatmap!')
        }
    } catch(e) {
        res.status(500).send(e)
    }
}

const _meme = async () => {
    return new Promise( async (resolve, reject) => {
        // 23 pre-generated images, starting at 0
        const pregeneratedImageUrls = [
            'https://i.imgflip.com/24alma.jpg', // sad trooper
            'https://i.imgflip.com/29fva8.jpg', // happy kid: we did it once
            'https://i.imgflip.com/29fvfj.jpg', // two in a row!
            'https://i.imgflip.com/29fvi9.jpg', // drei aufeinanderfolgend!
            'https://i.imgflip.com/29fvko.jpg', // four in a row!
            'https://i.imgflip.com/29fvn1.jpg', // five in a row?!? wow!
            'https://i.imgflip.com/29fvq2.jpg', // much six!!
            'https://i.imgflip.com/29fvt3.jpg', // 7, ca porte bonheur!
            'https://i.imgflip.com/29fvxn.jpg', // 8! now we're getting somewhere!
            'https://i.imgflip.com/29fw0j.jpg', // nine neuf neun!
            'https://i.imgflip.com/29fw3m.jpg', // double-digits! wow!
            'https://i.imgflip.com/29fw69.jpg', // 11! it's a palindrome!
            'https://i.imgflip.com/29fw9g.jpg', // 12! where will it end?!
            'https://i.imgflip.com/29fwda.jpg', // 13?! quick, is it friday?!
            'https://i.imgflip.com/29fwge.jpg', // 14! we're on a roll!1!
            'https://i.imgflip.com/29fwqc.jpg', // quinze ?! ebahi !
            'https://i.imgflip.com/29fwuj.jpg', // sixteen in a row!
            'https://i.imgflip.com/29fwx2.jpg', // sweet seventeen!
            'https://i.imgflip.com/29fwzf.jpg', // 18 in a row!
            'https://i.imgflip.com/29fx2b.jpg', // 19, that's almost 20!
            'https://i.imgflip.com/29fx5d.jpg', // 20, it's a deja vu!
            'https://i.imgflip.com/29fx83.jpg',  // 21, now we're entering uncharted territory
            'https://i.imgflip.com/2ezh3l.jpg', // 22, wtf another palindrom?!
            'https://i.imgflip.com/2ezhux.jpg', // 23, inoui!
            'https://i.imgflip.com/2ezhpw.jpg', // 24, vier-und-zwanzig
            'https://i.imgflip.com/2ezi2g.jpg', // 25, un quart de cent
            'https://i.imgflip.com/2ezi9b.jpg', // 26, b-r-a-v-o-o-o
            'https://i.imgflip.com/2ezifv.jpg', // 27, atomic number of cobalt
            'https://i.imgflip.com/2ezipx.jpg', // 28, 1 + 2 + 3 + 4 + 5 + 6 + 7
            'https://i.imgflip.com/2eziyb.jpg', // 29, Finistere
            'https://i.imgflip.com/2ezj8q.jpg' // 30, les mots manquent
        ]
        try {
            mongoose.connect(dbConn, { useNewUrlParser: true, useUnifiedTopology: true })
            const db = mongoose.connection
            db.once('open', async function() {
                const fromDate = (await Export
                    .find({exportSuccessful: false})
                    .sort({date: -1})
                    .limit(1)
                    .cursor()
                    .next()).date
                const successStreak = await Export
                    .find({exportSuccessful: true, date: { $gte: fromDate }})
                    .countDocuments()
                db.close()
            
                // we have 31 pre-generated images
                if (successStreak < 31) {
                    return resolve({
                        successStreak, 
                        url: pregeneratedImageUrls[successStreak] 
                    })
                }
                // here we call the memegenerator
                // const sadTrooper = 44693428
                const happyKid = 61544

                const form = new FormData()
                form.append('template_id', happyKid)
                form.append('text0', "yes!!!!!")
                form.append('text1', `${successStreak} in a row!`)
                form.append('username', process.env.IMGFLIP_LOGIN)
                form.append('password', process.env.IMGFLIP_PASSWORD)

                const response = await got.post("https://api.imgflip.com/caption_image", { body: form })
                if (response) {
                    const url = JSON.parse(response.body).data.url.replace(/^http:/, 'https:')
                    resObj = { successStreak, url }
                    return resolve(resObj)
                }
                throw new Error('Error while generating meme image')
            })
        } catch(e) {
            console.log(`ERROR in meme image generation: ${e}`)
            reject(e)
        }
    })
}

const getMeme = async (req, res) => {
    try {
        const meme = await _meme()
        if (meme) {
            res.setHeader('Access-Control-Allow-Origin', '*')
            res.json(meme)
        } else {
            throw new Error('Could not retrieve meme image!')
        }
    } catch(e) {
        res.status(500).send(e)
    }
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
                    db.close()
                    console.log(`DB IS NOW CLOSED`)            
                    throw new Error('payload is not JSON')
                }

                // now that the request is finished, quickly reply
                // note we're using the native node http reponse object, not the Express one!
                response.statusCode = 200
                response.setHeader('Content-Type', 'application/json')
                await response.end(JSON.stringify({
                    'text': '_OK, will go ahead and talk to Heroku. Sit tight!_ :wink:',
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
    getPipeline,
    getIndex,
    getAllInOne,
    getStats,
    getHeatmap,
    getMeme,
    postExport
}
