/* global __dirname */

import checkVersion from 'botpress-version-manager'

import path from 'path'
import fs from 'fs'
import _ from 'lodash'

import uuid from 'uuid'
import Promise from 'bluebird'

import Messenger from './messenger'
import actions from './actions'
import outgoing from './outgoing'
import incoming from './incoming'
import ngrok from './ngrok' // TODO Switch to localtunnel
import Users from './users'
import UMM from './umm'

let messenger = null
const outgoingPending = outgoing.pending

let users = null

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
        outgoingPending[event.__id].timestamp = new Date().getTime() - 1000
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

    users = Users(bp, messenger)

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
    targetAudience: { type: 'string', required: true, default: 'openToAll'},
    targetAudienceOpenToSome: { type: 'string', required: false },
    targetAudienceCloseToSome: { type: 'string', required: false },
    trustedDomains: { type: 'any', required: false, default: [], validation: v => _.isArray(v) },
    autoRespondGetStarted: { type: 'bool', required: false, default: true }, // deprecated
    autoResponse: { type: 'string', required: false, default: 'Hello!' },     // deprecated
    autoResponseOption: { type: 'string', required: false, default: 'noResponse' },
    autoResponseText: { type: 'string', required: false, default: 'Hello, human!' },
    autoResponsePostback: { type: 'string', required: false, default: 'YOUR_POSTBACK' },
    paymentTesters: { type: 'any', required: false, default: [], validation: v => _.isArray(v) },
    chatExtensionHomeUrl: { type: 'string', required: false, default: '' },
    chatExtensionInTest: { type: 'bool', required: false, default: true },
    chatExtensionShowShareButton: { type: 'bool', required: false, default: false }
  },

  init: function(bp) {

    checkVersion(bp, __dirname)

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

      const applyFn = fn => function() {
        var msg = action.apply(this, arguments)
        const promise = msg._promise
        return fn && fn(msg, promise)
      }

      var sendName = name.replace(/^create/, 'send')
      bp.messenger[sendName] = Promise.method(applyFn((msg, promise) => bp.middlewares.sendOutgoing(msg) && promise))
      bp.messenger[name] = applyFn(msg => msg)
    })

    UMM(bp) // Initializes Messenger in the UMM
  },

  ready: function(bp, config) {

    initializeMessenger(bp, config)
    .then(() => {
      incoming(bp, messenger)

      messenger.on('raw_webhook_body', e => {
        bp.events.emit('messenger.raw_webhook_body', e)
      })

      messenger.on('raw_send_request', e => {
        bp.events.emit('messenger.raw_send_body', e)
      })

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

      router.get('/users', (req, res)=> {
        users.getAllUsers
          .then((values) => {
            res.send(values)
          })
          .catch((err) => res.status.send(500).send({ message:err.message }))
      })

      router.post('/remove_payment_tester', (req, res) => {
        messenger.deletePaymentTester(req.body.payment_tester)
          .then((json)=> {
            res.send(json)
          })
          .catch((err) => {
            res.status(500).send({ message: err.message })
          })
      })

      router.get('/facebook_page', (req, res) => {
        messenger._getPage()
          .then((json) => {
            res.send(json)
          })
          .catch((err) => {
            res.status(500).send({ message: err.message })
          })
      })

    })

  }
}
