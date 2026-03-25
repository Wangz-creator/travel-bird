App.Pages.assistant = {
  _unsubscribe: null,

  render(container, props) {
    const { records } = props || {};
    container.innerHTML = `
      <div class="assistant-page">
        <div class="page-header">
          <button class="back-btn" id="asst-back">←</button>
          <span class="title">鸽子助手</span>
          <span id="asst-skip" style="display:none;"></span>
        </div>
        <div class="assistant-messages" id="asst-messages"></div>
        <div id="asst-platform-area" style="display:none;"></div>
        <div id="asst-generating-area" style="display:none;"></div>
        <button class="assistant-skip-btn" id="asst-skip-btn" style="display:none;">跳过对话，直接选择生成平台 →</button>
        <div class="assistant-input-bar" id="asst-input-bar">
          <input type="text" id="asst-input" placeholder="回复鸽子..." />
          <button class="assistant-voice-btn" id="asst-mic">🎤</button>
          <button class="assistant-send-btn" id="asst-send">↑</button>
        </div>
      </div>
    `;

    const messagesEl = container.querySelector('#asst-messages');
    const inputEl = container.querySelector('#asst-input');
    const sendBtn = container.querySelector('#asst-send');
    const skipBtn = container.querySelector('#asst-skip-btn');
    const platformArea = container.querySelector('#asst-platform-area');
    const generatingArea = container.querySelector('#asst-generating-area');
    const inputBar = container.querySelector('#asst-input-bar');

    const headerSkip = container.querySelector('#asst-skip');
    container.querySelector('#asst-back').addEventListener('click', () => {
      const phase = App.State.get('assistantPhase');
      if (phase === 'platform') {
        App.AI.Assistant.backToChatFromPlatform();
        return;
      }
      App.AI.Assistant.abort();
      App.Router.popPage();
    });

    const doSkip = () => App.AI.Assistant.enterPlatformSelection();
    headerSkip.addEventListener('click', doSkip);
    skipBtn.addEventListener('click', doSkip);

    const doSend = () => {
      const text = inputEl.value.trim();
      if (!text) return;
      inputEl.value = '';
      App.AI.Assistant.sendMessage(text);
    };
    sendBtn.addEventListener('click', doSend);
    inputEl.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend(); } });

    let _recording = false;
    const micBtn = container.querySelector('#asst-mic');
    micBtn.addEventListener('click', async () => {
      if (!_recording) {
        try {
          await App.UI.Recorder.start();
          _recording = true;
          micBtn.textContent = '⏹';
          micBtn.style.background = '#ffeded';
          micBtn.style.borderColor = 'var(--color-error)';
        } catch (e) { App.UI.Toast.show('无法访问麦克风', 'error'); }
      } else {
        _recording = false;
        micBtn.textContent = '🎤';
        micBtn.style.background = '';
        micBtn.style.borderColor = '';
        try {
          const blob = await App.UI.Recorder.stop();
          if (!blob) { App.UI.Toast.show('未录到音频', 'error'); return; }
          App.UI.Toast.show('正在转写...', 'info');
          const text = await App.AI.transcribeAudio(blob);
          if (text) { inputEl.value = text; inputEl.focus(); }
          else { App.UI.Toast.show('转写结果为空', 'info'); }
        } catch (e) {
          console.error('transcribe error:', e);
          App.UI.Toast.show('语音转写失败：' + e.message, 'error');
        }
      }
    });

    const renderMessages = (msgs) => {
      messagesEl.innerHTML = '';
      msgs.forEach(msg => {
        if (msg.role === 'assistant') {
          const wrap = document.createElement('div');
          wrap.className = `msg-row ai${msg.isStreaming ? ' streaming' : ''}`;
          wrap.innerHTML = `<img src="/img/pigeon-newspaper.svg" alt="鸽子" class="ai-avatar-img"><div class="msg-bubble ai"><span class="ai-text">${this._escapeHtml(msg.content)}</span></div>`;
          messagesEl.appendChild(wrap);
        } else {
          const div = document.createElement('div');
          div.className = 'msg-bubble user';
          div.textContent = msg.content;
          messagesEl.appendChild(div);
        }
      });
      messagesEl.scrollTop = messagesEl.scrollHeight;
    };

    const showChatChrome = () => {
      platformArea.style.display = 'none';
      generatingArea.style.display = 'none';
      generatingArea.innerHTML = '';
      platformArea.innerHTML = '';
      inputBar.style.display = 'flex';
      skipBtn.style.display = 'block';
      headerSkip.style.display = '';
      renderMessages(App.State.get('assistantMessages') || []);
    };

    const renderPlatform = () => {
      inputBar.style.display = 'none';
      skipBtn.style.display = 'none';
      headerSkip.style.display = 'none';
      platformArea.style.display = 'flex';
      platformArea.style.flexDirection = 'column';
      platformArea.innerHTML = `
        <div class="platform-select-container">
          <button type="button" class="platform-back-to-chat" id="asst-back-to-chat">← 返回对话</button>
          <div class="platform-select-title">你打算把这段记录发到哪里？</div>
          <button class="platform-btn" data-platform="xiaohongshu">
            <span class="p-icon">📕</span>
            <span class="p-info"><div class="p-name">小红书笔记</div><div class="p-desc">图文笔记，标题+正文+标签</div></span>
          </button>
          <button class="platform-btn" data-platform="moments">
            <span class="p-icon">💬</span>
            <span class="p-info"><div class="p-name">微信朋友圈</div><div class="p-desc">简短真实，口语化分享</div></span>
          </button>
          <button class="platform-btn" data-platform="diary">
            <span class="p-icon">📔</span>
            <span class="p-info"><div class="p-name">存为日记</div><div class="p-desc">详细记录，自动保存到日记本</div></span>
          </button>
        </div>
      `;
      platformArea.querySelector('#asst-back-to-chat').addEventListener('click', () => {
        App.AI.Assistant.backToChatFromPlatform();
      });
      platformArea.querySelectorAll('.platform-btn').forEach(btn => {
        btn.addEventListener('click', () => App.AI.Assistant.generateContent(btn.dataset.platform));
      });
    };

    const renderGenerating = () => {
      platformArea.style.display = 'none';
      generatingArea.style.display = 'flex';
      generatingArea.style.flexDirection = 'column';
      generatingArea.innerHTML = `
        <div class="generating-overlay">
          <img src="/img/pigeon-writing-2.svg" alt="鸽子" style="width:80px;height:80px;object-fit:contain;">
          <div class="generating-text">正在为你生成内容...</div>
          <div class="dot-loading"><span></span><span></span><span></span></div>
        </div>
      `;
    };

    const unsubPhase = App.State.on('assistantPhase', (phase) => {
      if (phase === 'chatting') { showChatChrome(); }
      else if (phase === 'platform') { renderPlatform(); }
      else if (phase === 'generating') { renderGenerating(); }
      else if (phase === 'done') {
        setTimeout(() => { App.Router.popPage(); App.Router.pushPage('result', {}); }, 0);
      }
    });
    const unsubMsgs = App.State.on('assistantMessages', renderMessages);
    this._unsubscribe = () => { unsubPhase(); unsubMsgs(); };

    App.AI.Assistant.init(records || []).catch(e => {
      App.UI.Toast.show('AI 初始化失败：' + e.message, 'error');
    });

    return { destroy: () => { if (this._unsubscribe) this._unsubscribe(); } };
  },

  _escapeHtml(str) {
    return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
};
