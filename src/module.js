/**
 * Messenger
 *
 * This file contains one class Module, which in a base module added to
 * botpress.
 *
 */

const EventEmitter = require('eventemitter2')

class Module extends EventEmitter {
  constructor() {
    super()
  }

  handleModuleEvent(type, event) {
    this.emit(type, event)
  }
}

module.exports = Module
