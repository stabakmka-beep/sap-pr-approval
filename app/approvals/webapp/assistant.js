(function () {
  if (document.getElementById('assistant-root')) return

  const root = document.createElement('div')
  root.id = 'assistant-root'
  root.innerHTML = `
    <button type="button" id="assistant-open">Approval Assistant</button>
    <section id="assistant-panel" hidden>
      <header>
        <strong>Approval Assistant</strong>
        <button type="button" id="assistant-close" aria-label="Close">Close</button>
      </header>
      <div id="assistant-log" role="log" aria-live="polite"></div>
      <div id="assistant-examples">
        <button type="button">What's waiting for me?</button>
        <button type="button">What's waiting for me over $5K?</button>
        <button type="button">Summarize PR10000002</button>
        <button type="button">Which requests from IT are pending?</button>
      </div>
      <form id="assistant-form">
        <input id="assistant-input" name="message" autocomplete="off" placeholder="Ask about your inbox" aria-label="Message">
        <button type="submit">Send</button>
      </form>
      <p id="assistant-model"></p>
    </section>
  `
  const style = document.createElement('style')
  style.textContent = `
    #assistant-root { position: fixed; right: 1rem; bottom: 1rem; z-index: 1000; height: auto; font: 14px/1.4 sans-serif; }
    #assistant-open { background: #0070f2; color: #fff; border: 0; border-radius: 999px; padding: .6rem 1rem; cursor: pointer; }
    #assistant-panel { position: fixed; top: 0; right: 0; height: 100vh; width: min(24rem, 100vw); background: #fff; box-shadow: -8px 0 24px rgba(0,0,0,.12); display: flex; flex-direction: column; }
    #assistant-panel[hidden] { display: none; }
    #assistant-panel header { display: flex; justify-content: space-between; align-items: center; padding: .8rem 1rem; border-bottom: 1px solid #e5e5e5; }
    #assistant-close { background: transparent; border: 0; cursor: pointer; }
    #assistant-log { flex: 1; overflow: auto; padding: 1rem; display: flex; flex-direction: column; gap: .6rem; }
    #assistant-log p { margin: 0; padding: .5rem .7rem; border-radius: .5rem; white-space: pre-wrap; }
    #assistant-log .user { align-self: flex-end; background: #e5f0ff; }
    #assistant-log .assistant { align-self: flex-start; background: #f5f6f7; }
    #assistant-examples { display: flex; flex-wrap: wrap; gap: .4rem; padding: 0 1rem .6rem; }
    #assistant-examples button, #assistant-confirm button { border: 1px solid #0070f2; background: #fff; color: #0070f2; border-radius: 999px; padding: .25rem .6rem; cursor: pointer; }
    #assistant-form { display: flex; gap: .4rem; padding: .6rem 1rem 1rem; }
    #assistant-input { flex: 1; border: 1px solid #ccc; border-radius: .4rem; padding: .4rem .6rem; }
    #assistant-form button { background: #0070f2; color: #fff; border: 0; border-radius: .4rem; padding: 0 .8rem; cursor: pointer; }
    #assistant-model { margin: 0; padding: 0 1rem .8rem; color: #666; font-size: 12px; }
    #assistant-confirm { display: flex; gap: .4rem; margin-top: .4rem; }
  `
  document.head.appendChild(style)
  document.body.appendChild(root)

  const panel = root.querySelector('#assistant-panel')
  const log = root.querySelector('#assistant-log')
  const input = root.querySelector('#assistant-input')
  const model = root.querySelector('#assistant-model')
  const history = []
  let csrf = ''

  root.querySelector('#assistant-open').onclick = () => { panel.hidden = false; input.focus() }
  root.querySelector('#assistant-close').onclick = () => { panel.hidden = true }
  root.querySelectorAll('#assistant-examples button').forEach(button => {
    button.onclick = () => ask(button.textContent)
  })
  root.querySelector('#assistant-form').onsubmit = (event) => {
    event.preventDefault()
    const message = input.value.trim()
    if (!message) return
    input.value = ''
    ask(message)
  }

  function add(role, text, extra) {
    const paragraph = document.createElement('p')
    paragraph.className = role
    paragraph.textContent = text
    if (extra) paragraph.appendChild(extra)
    log.appendChild(paragraph)
    log.scrollTop = log.scrollHeight
    return paragraph
  }

  async function token() {
    if (csrf) return csrf
    const response = await fetch('/odata/v4/assistant/', { headers: { 'x-csrf-token': 'Fetch' } })
    csrf = response.headers.get('x-csrf-token') || ''
    return csrf
  }

  async function post(action, body) {
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json' }
    const csrfToken = await token()
    if (csrfToken) headers['x-csrf-token'] = csrfToken
    const response = await fetch('/odata/v4/assistant/' + action, { method: 'POST', headers, body: JSON.stringify(body) })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      const message = payload.error?.message || response.statusText || 'The assistant could not answer.'
      throw new Error(message)
    }
    return payload
  }

  async function ask(message) {
    add('user', message)
    history.push({ role: 'user', content: message })
    try {
      const reply = await post('chat', { message, history: JSON.stringify(history.slice(-12)) })
      showReply(reply)
    } catch (error) {
      add('assistant', error.message)
    }
  }

  function showReply(reply) {
    const text = reply.reply || ''
    history.push({ role: 'assistant', content: text })
    model.textContent = reply.model === 'mock' ? 'Local assistant (no AI Core binding)' : (reply.model || '')
    if (!reply.confirmationRequired || !reply.confirmToken) {
      add('assistant', text)
      return
    }
    const actions = document.createElement('span')
    actions.id = 'assistant-confirm'
    const confirm = document.createElement('button')
    confirm.type = 'button'
    confirm.textContent = 'Confirm'
    const cancel = document.createElement('button')
    cancel.type = 'button'
    cancel.textContent = 'Cancel'
    confirm.onclick = async () => {
      confirm.disabled = true
      cancel.disabled = true
      try {
        const decided = await post('confirm', { token: reply.confirmToken })
        showReply(decided)
      } catch (error) {
        add('assistant', error.message)
      }
    }
    cancel.onclick = () => {
      confirm.disabled = true
      cancel.disabled = true
      add('assistant', 'Cancelled. Nothing was changed.')
    }
    actions.append(confirm, cancel)
    add('assistant', text, actions)
  }
})()
