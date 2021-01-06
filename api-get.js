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
            const allTime = await coll.aggregate(getPipeline(1000)).toArray()
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
                        count: doc.exportSuccessful ? 1 : -1 
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


module.exports = {
    getIndex,
    getAllInOne
}
