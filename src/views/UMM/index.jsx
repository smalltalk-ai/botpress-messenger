import { Component } from 'react'
import classnames from 'classnames'

import style from './style.scss'

export default class UMMComponent extends Component {
  constructor(props) {
    super(props)
  }

  renderText() {
    const classNames = classnames(style.text, 'bp-messenger-text')
    return <div className={classNames}>
        {this.props.text}
      </div>
  }

  renderTyping() {
    return <div>Typing</div> 
  }

  renderNotSupported() {
    return <div>Not supported yet</div>
  }

  renderComponent() {
    switch (this.props.type) {
    case 'text':
      return this.renderText()
    case 'typing':
      return this.renderTyping()
    default:
      return this.renderNotSupported()
    }   
  }

  render() {
    const classNames = classnames(style.component, 'bp-messenger-component')
    return <div className={classNames}>
        {this.renderComponent()}
      </div>
  }
}