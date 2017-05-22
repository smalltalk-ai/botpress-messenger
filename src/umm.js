import util from 'util'
import _ from 'lodash'

import actions from './actions'

const QUICK_REPLY_PAYLOAD = /\<(.+)\>\s(.+)/i

function processButtons(buttons, blocName) {

}

function processQuickReplies(qrs, blocName) {
  if (!_.isArray(qrs)) {
    throw new Error('Expected quick_replies to be an array')
  }

  return qrs.map(qr => {
    if (_.isString(qr) && QUICK_REPLY_PAYLOAD.test(qr)) {
      let [, payload, text] = QUICK_REPLY_PAYLOAD.exec(qr)
      
      // <.HELLO> becomes <BLOCNAME.HELLO>
      if (payload.startsWith('.')) {
        payload = blocName + payload
      }

      return {
        title: text,
        payload: payload.toUpperCase()
      }
    }

    return qr
  })
}

function getUserId(event) {
  const userId = _.get(event, 'user.id')
    || _.get(event, 'user.userId')
    || _.get(event, 'userId')
    || _.get(event, 'raw.from')
    || _.get(event, 'raw.userId')
    || _.get(event, 'raw.user.id')

  if (!userId) {
    throw new Error('Could not find userId in the incoming event.')
  }

  return userId
}

function processOutgoing({ event, blocName, instruction }) {
  const ins = Object.assign({}, instruction) // Create a shallow copy of the instruction

  ////////
  // PRE-PROCESSING
  ////////
  
  const optionsList = [
    'quick_replies', 
    'waitRead', 
    'waitDelivery', 
    'typing', 
    'tag'
  ]

  const options = _.pick(instruction, optionsList)
  
  for (let prop of optionsList) {
    delete ins[prop]
  }

  if (options.quick_replies) {
    options.quick_replies = processQuickReplies(options.quick_replies, blocName)
  }

  /////////
  /// Processing
  /////////
  
  if (!_.isNil(instruction.template_type)) {
    return actions.createTemplate(getUserId(event), ins, options)
  }

  for (let attr of ['image', 'audio', 'video', 'file']) {
    if (!_.isNil(instruction[attr])) {
      return actions.createAttachement(getUserId(event), attr, ins[attr], options)
    }
  }

  if (!_.isNil(instruction.attachment)) {
    return actions.createAttachement(
      getUserId(event),
      instruction.type || instruction.attachment,
      ins.url || instruction.attachment,
      options)
  }

  if (!_.isNil(instruction.text)) {
    return actions.createText(getUserId(event), instruction.text, options)
  }

  ////////////
  /// POST-PROCESSING
  ////////////
  
  // Nothing to post-process yet

  ////////////
  /// INVALID INSTRUCTION
  ////////////

  const strRep = util.inspect(instruction, false, 1)
  throw new Error(`Unrecognized instruction on Facebook Messenger in bloc '${blocName}': ${strRep}`)
}

module.exports = bp => {
  const [umm, registerConnector] = _.at(bp, ['umm', 'umm.registerConnector'])

  umm && registerConnector && registerConnector({
    platform: 'facebook',
    processOutgoing: args => processOutgoing(Object.assign({}, args, { bp })),
    templates: []
  })
}
