const mongoose = require('mongoose')

// =============================================================================
// DB CONNECTION DETAILS
const dbUser = process.env.EXPORT_STATS_MONGO_USER
const dbPwd = process.env.EXPORT_STATS_MONGO_PWD
const dbHost = process.env.EXPORT_STATS_MONGO_HOST
const dbDb = process.env.EXPORT_STATS_MONGO_DB
const dbColl = process.env.EXPORT_STATS_MONGO_COLL
const dbConn = `mongodb+srv://${dbUser}:${dbPwd}@${dbHost}/${dbDb}`

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

module.exports = {
    Export
}
