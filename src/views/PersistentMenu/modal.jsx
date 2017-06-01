import React from 'react'
import ReactDOM from 'react-dom'
import {
  Modal
} from 'react-bootstrap'

import _ from 'lodash'
import Promise from 'bluebird'

export default class MessengerModule extends React.Component {

  constructor(props, context) {
    super(props, context)
    this.state = { show: true }
  }

  render() {

    return <Modal container={document.getElementById('app')}
      show={this.props.show}>
      <Modal.Header closeButton>
        <Modal.Title id="contained-modal-title-lg">Modal heading</Modal.Title>
      </Modal.Header>

      <Modal.Body>
        Body here
      </Modal.Body>
      <Modal.Footer>
        Hello footer
        
      </Modal.Footer>

    </Modal>

  }

}