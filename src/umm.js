import _ from 'lodash'

module.exports = bp => {

  const umm = _.get(bp, 'umm')

  // UMM might not be defined in earlier version of botpress
  // in which case we simply don't register UMM features
  if (_.isNil(umm)) {
    return
  }

  const { registerConnector } = umm

  registerConnector && registerConnector({
    platform: 'messenger',
    processOutgoing: () => {},
    templates: []
  })
}
