var db = require('../lib/db.js')
var config = require('../lib/config.js')
var Joi = require('joi')
var request = require('request')

/*
"chartConfiguration": {
    "chartType": "line",
    "fields": {
        "x": "created_month",
        "y": "package_count",
        "split": "keyword",
        "xFacet": "",
        "yFacet": "keyword",
        "trendline": "true"
    }
}
*/

var schema = {
  _id: Joi.string().optional(), // generated by nedb
  name: Joi.string().required(),
  tags: Joi.array()
    .items(Joi.string().empty(''))
    .sparse()
    .optional(),
  connectionId: Joi.string()
    .optional()
    .empty(''),
  queryText: Joi.string()
    .optional()
    .empty(''),
  chartConfiguration: Joi.object({
    chartType: Joi.string()
      .optional()
      .empty(''),
    // key value pairings. key=chart property, value=field mapped to property
    fields: Joi.object()
      .unknown(true)
      .optional()
  }).optional(),
  createdDate: Joi.date().default(new Date(), 'time of creation'),
  modifiedDate: Joi.date().default(new Date(), 'time of modification'),
  createdBy: Joi.string().required(),
  modifiedBy: Joi.string().required(),
  lastAccessDate: Joi.date().default(new Date(), 'time of last access')
}

var Query = function(data) {
  this._id = data._id
  this.name = data.name
  this.tags = data.tags
  this.connectionId = data.connectionId
  this.queryText = data.queryText
  this.chartConfiguration = data.chartConfiguration
  this.createdDate = data.createdDate
  this.createdBy = data.createdBy
  this.modifiedDate = data.modifiedDate
  this.modifiedBy = data.modifiedBy
  this.lastAccessDate = data.lastAccessedDate
}

Query.prototype.save = function QuerySave(callback) {
  var self = this
  this.modifiedDate = new Date()
  this.lastAccessDate = new Date()
  // clean tags if present
  // sqlpad v1 saved a lot of bad inputs
  if (Array.isArray(self.tags)) {
    self.tags = self.tags
      .filter(tag => {
        return typeof tag === 'string' && tag.trim() !== ''
      })
      .map(tag => {
        return tag.trim()
      })
  }
  var joiResult = Joi.validate(self, schema)
  if (joiResult.error) return callback(joiResult.error)
  if (self._id) {
    db.queries.update(
      { _id: self._id },
      joiResult.value,
      { upsert: true },
      function(err) {
        if (err) return callback(err)
        Query.findOneById(self._id, callback)
      }
    )
  } else {
    db.queries.insert(joiResult.value, function(err, newDoc) {
      if (err) return callback(err)
      return callback(null, new Query(newDoc))
    })
  }
}

Query.prototype.pushQueryToSlackIfSetup = function() {
  const SLACK_WEBHOOK = config.get('slackWebhook')
  if (SLACK_WEBHOOK) {
    const PUBLIC_URL = config.get('publicUrl')
    const BASE_URL = config.get('baseUrl')
    var options = {
      method: 'post',
      body: {
        text:
          'New Query <' +
          PUBLIC_URL +
          BASE_URL +
          '/queries/' +
          this._id +
          '|' +
          this.name +
          '> saved by ' +
          this.modifiedBy +
          ' on SQLPad ```' +
          this.queryText +
          '```'
      },
      json: true,
      url: SLACK_WEBHOOK
    }
    request(options, function(err, httpResponse, body) {
      if (err) {
        console.error('Something went wrong while sending to Slack.')
        console.error(err)
      }
    })
  }
}

/*  Query methods
============================================================================== */

Query.findOneById = function QueryFindOneById(id, callback) {
  db.queries.findOne({ _id: id }).exec(function(err, doc) {
    if (err) return callback(err)
    if (!doc) return callback()
    return callback(null, new Query(doc))
  })
}

Query.findAll = function QueryFindAll(callback) {
  db.queries.find({}).exec(function(err, docs) {
    if (err) return callback(err)
    var queries = docs.map(function(doc) {
      return new Query(doc)
    })
    return callback(null, queries)
  })
}

Query.findByFilter = function QueryFindByFilter(filter, callback) {
  db.queries.find(filter).exec(function(err, docs) {
    if (err) return callback(err)
    var queries = docs.map(function(doc) {
      return new Query(doc)
    })
    return callback(null, queries)
  })
}

Query.prototype.logAccess = function QueryLogAccess(callback) {
  var self = this
  db.queries.update(
    { _id: self._id },
    { $set: { lastAccessedDate: new Date() } },
    {},
    callback
  )
}

Query.removeOneById = function QueryRemoveOneById(id, callback) {
  db.queries.remove({ _id: id }, callback)
}

Query._removeAll = function QueryRemoveAll(callback) {
  db.queries.remove({}, { multi: true }, callback)
}

module.exports = Query
