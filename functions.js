
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

module.exports = {
    getPipeline
}
