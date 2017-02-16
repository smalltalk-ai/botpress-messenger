const path = require('path')
const fs = require('fs')
const _ = require('lodash')
const uuid = require('uuid')
const Promise = require('bluebird')

const Messenger = require('./messenger')
const actions = require('./actions')
const outgoing = require('./outgoing')
const incoming = require('./incoming')
const ngrok = require('./ngrok')

let messenger = null
const outgoingPending = outgoing.pending

const outgoingMiddleware = (event, next) => {
  if (event.platform !== 'facebook') {
    return next()
  }

  if (!outgoing[event.type]) {
    return next('Unsupported event type: ' + event.type)
  }

  const setValue = method => (...args) => {
    if (event.__id && outgoingPending[event.__id]) {

      if (args && args[0] && args[0].message_id) {
        let ts = args[0].message_id.split(':')[0]
        ts = ts && ts.substr(4)
        outgoingPending[event.__id].timestamp = parseInt(ts)
        outgoingPending[event.__id].mid = args[0].message_id
      }

      if (method === 'resolve' && (event.raw.waitDelivery || event.raw.waitRead)) {
        // We skip setting this value because we wait
      } else {
        outgoingPending[event.__id][method].apply(null, args)
        delete outgoingPending[event.__id]
      }
    }
  }
  
  outgoing[event.type](event, next, messenger)
  .then(setValue('resolve'), setValue('reject'))
}

const initializeMessenger = (bp, configurator) => {
  return configurator.loadAll()
  .then(config => {
    messenger = new Messenger(bp, config)

    // regenerate a new ngrok url and update it to facebook
    if (!config.ngrok || !config.connected) {
      return Promise.resolve(true)
    }

    bp.logger.debug('[messenger] updating ngrok to facebook')

    return ngrok.getUrl(bp.botfile.port)
    .then(url => {
      url = url.replace(/https:\/\//i, '')
      messenger.setConfig({ hostname: url })
    })
    .then(() => configurator.saveAll(messenger.getConfig()))
    .then(() => messenger.updateSettings())
    .then(() => messenger.connect())
    .then(() => bp.notifications.send({
      level: 'info',
      message: 'Upgraded messenger app webhook with new ngrok url'
    }))
    .catch(err => {
      bp.logger.error('[messenger] error updating ngrok', err)
      bp.notifications.send({
        level: 'error',
        message: 'Error updating app webhook with new ngrok url. Please see logs for details.'
      })
    })
  })
}

module.exports = {

  config: {
    applicationID: { type: 'string', required: true, default: '', env: 'MESSENGER_APP_ID' },
    accessToken: { type: 'string', required: true, default: '', env: 'MESSENGER_ACCESS_TOKEN' },
    appSecret: { type: 'string', required: true, default: '', env: 'MESSENGER_APP_SECRET' },
    verifyToken: { type: 'string', required: false, default: uuid.v4() },
    validated: { type: 'bool', required: false, default: false },
    connected: { type: 'bool', required: false, default: false },
    hostname: { type: 'string', required: false, default: '' },
    homepage: { type: 'string' },
    ngrok: { type: 'bool', required: false, default: false },
    displayGetStarted: { type: 'bool', required: false, default: false },
    greetingMessage: { type: 'string', required: false, default: 'Default greeting message' },
    persistentMenu: { type: 'bool', required: false, default: false },
    persistentMenuItems: { type: 'any', required: false, default: [], validation: v => _.isArray(v) },
    automaticallyMarkAsRead: { type: 'bool', required: false, default: true },
    trustedDomains: { type: 'any', required: false, default: [], validation: v => _.isArray(v) },
    autoRespondGetStarted: { type: 'bool', required: false, default: true },
    autoResponse: { type: 'string', required: false, default: 'Hello!' }
  },

  init: function(bp) {

    bp.middlewares.register({
      name: 'messenger.sendMessages',
      type: 'outgoing',
      order: 100,
      handler: outgoingMiddleware,
      module: 'botpress-messenger',
      description: 'Sends out messages that targets platform = messenger.' +
      ' This middleware should be placed at the end as it swallows events once sent.'
    })

    bp.messenger = {}
    _.forIn(actions, (action, name) => {
      bp.messenger[name] = action
      var sendName = name.replace(/^create/, 'send')
      bp.messenger[sendName] = Promise.method(function() {
        var msg = action.apply(this, arguments)
        msg.__id = new Date().toISOString() + Math.random()
        const resolver = { event: msg }
        
        const promise = new Promise(function(resolve, reject) {
          resolver.resolve = resolve
          resolver.reject = reject
        })
        
        outgoingPending[msg.__id] = resolver
        
        bp.middlewares.sendOutgoing(msg)
        return promise
      })
    })
  },

  ready: function(bp, config) {

    initializeMessenger(bp, config)
    .then(() => {
      incoming(bp, messenger)

      const router = bp.getRouter('botpress-messenger')

      router.get('/config', (req, res) => {
        res.send(messenger.getConfig())
      })

      router.post('/config', (req, res) => {
        messenger.setConfig(req.body)
        config.saveAll(messenger.getConfig())
        .then(() => messenger.updateSettings())
        .then(() => res.sendStatus(200))
        .catch((err) => {
          res.status(500).send({ message: err.message })
        })
      })

      router.get('/ngrok', (req, res) => {
        ngrok.getUrl()
        .then(url => res.send(url))
      })

      router.post('/connection', (req, res) => {
        if (messenger.getConfig().connected) {
          messenger.disconnect()
          .then(() => res.sendStatus(200))
          .catch((err) => res.status(500).send({ message: err.message }))
        } else {
          messenger.connect()
          .then(() => res.sendStatus(200))
          .catch((err) => res.status(500).send({ message: err.message }))
        }
      })

      router.post('/validation', (req, res) => {
        messenger.sendValidationRequest()
        .then((json) => {
          res.send(json)
        })
        .catch((err) => {
          res.status(500).send({ message: err.message })
        })
      })

      router.get('/homepage', (req, res) => {
        const packageJSON = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json')))
        res.send({ homepage: packageJSON.homepage })
      })

    })

  }
}
