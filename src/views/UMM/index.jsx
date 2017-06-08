import { Component } from 'react'
import { 
  Button,
  Tooltip,
  OverlayTrigger
} from 'react-bootstrap'

import classnames from 'classnames'
import Spinner from 'react-spinkit'

import style from './style.scss'

export default class UMMComponent extends Component {
  constructor(props) {
    super(props)

    this.state = {
      typing: false,
      loading: true
    }
  }

  componentDidMount() {
    this.setState({
      loading: false
    })

    this.setTyping()
  }

  setTyping() {
    if (!this.state.loading && this.props.raw.typing) {
      this.setState({
        typing: true
      })

      setTimeout(() => {
        this.setState({
          typing: false
        })
      }, this.props.raw.typing)
    }
  }

  componentWillUnmount() {
    this.setState({
      loading: false
    })
  }

  renderTyping() {
    const classNames = classnames({
      [style.typing]: this.state.typing,
      'bp-messenger-typing': this.state.typing
    })

    return <div className={classNames}>
      <Spinner name='ball-beat' fadeIn={'quarter'} className={style.spinner}/>
    </div>
  }

  renderText() {
    const classNames = classnames({
      [style.text]: true, 
      'bp-messenger-text': true
    })
    
    if (this.state.typing) {
      return this.renderTyping()
    }

    return <div>
        <div className={classNames}>
          {this.props.text}
        </div>
        {this.renderQuickReplies()}
      </div>
  }

  renderButton({ title, payload }, key) {
    const tooltip = <Tooltip id="tooltip">
      On click, payload event <strong>{payload}</strong> is emitted.
    </Tooltip>

    return <OverlayTrigger key={key} placement="top" overlay={tooltip}>
      <Button >{title}</Button>
    </OverlayTrigger>
  }

  renderQuickReplies() {
    if (!this.props.raw.quick_replies) {
      return null
    }

    const classNames = classnames(style.quickReplies, 'bp-messenger-quick-replies')
    
    return <div className={classNames}>
        {this.props.raw.quick_replies.map(this.renderButton)}
      </div>
  }

  renderNotSupported() {
    return <div>Not supported yet</div>
  }

  renderComponent() {
    switch (this.props.type) {
    case 'text':
      return this.renderText()
    default:
      return this.renderNotSupported()
    }   
  }

  render() {
    if (this.state.loading) {
      return null
    }

    const classNames = classnames(style.component, 'bp-messenger-component')
    return <div className={classNames}>
        {this.renderComponent()}
      </div>
  }
}