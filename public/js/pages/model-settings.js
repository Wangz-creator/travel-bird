App.Pages.modelSettings = {
  _escapeAttr(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  },

  render(container) {
    const get = (k) => App.API.Settings.get(k) || '';
    const esc = (k) => this._escapeAttr(get(k));
    container.innerHTML = `
      <div class="model-settings-page">
        <div class="page-header">
          <button class="back-btn" id="ms-back">←</button>
          <span class="title">大模型设置</span>
        </div>
        <div class="model-settings-content">
          <div class="settings-section">
            <div class="settings-section-title">🗣️ 语音转文字</div>
            <div class="settings-field">
              <label>API Key</label>
              <input type="password" id="voice-key" value="${esc('voice_api_key')}" placeholder="请输入 API Key" />
            </div>
          </div>
          <div class="settings-section">
            <div class="settings-section-title">🤖 AI 助手（对话生成）</div>
            <div class="settings-field">
              <label>协议</label>
              <select id="asst-provider">
                <option value="openai" ${get('assistant_provider') === 'openai' ? 'selected' : ''}>OpenAI 兼容</option>
                <option value="anthropic" ${get('assistant_provider') === 'anthropic' ? 'selected' : ''}>Anthropic</option>
              </select>
            </div>
            <div class="settings-field">
              <label>API 地址 (Endpoint)</label>
              <input type="url" id="asst-endpoint" value="${esc('assistant_endpoint')}" placeholder="https://api.openai.com" />
            </div>
            <div class="settings-field">
              <label>API Key</label>
              <input type="password" id="asst-key" value="${esc('assistant_api_key')}" placeholder="sk-..." />
            </div>
            <div class="settings-field">
              <label>模型</label>
              <input type="text" id="asst-model" value="${esc('assistant_model')}" placeholder="gpt-4o" />
            </div>
            <div class="settings-field">
              <label>Temperature (0-1)</label>
              <input type="number" id="asst-temp" min="0" max="1" step="0.1" value="${this._escapeAttr(get('assistant_temperature') || '0.7')}" />
            </div>
            <div class="settings-field">
              <label>Max Tokens</label>
              <input type="number" id="asst-maxtokens" value="${this._escapeAttr(get('assistant_max_tokens') || '4096')}" placeholder="4096" />
            </div>
          </div>
        </div>
        <button class="settings-save-btn" id="ms-save">保存设置</button>
      </div>
    `;

    container.querySelector('#ms-back').addEventListener('click', () => App.Router.popPage());
    container.querySelector('#ms-save').addEventListener('click', async () => {
      const settings = [
        ['voice_api_key', container.querySelector('#voice-key').value.trim()],
        ['assistant_provider', container.querySelector('#asst-provider').value],
        ['assistant_endpoint', container.querySelector('#asst-endpoint').value.trim()],
        ['assistant_api_key', container.querySelector('#asst-key').value.trim()],
        ['assistant_model', container.querySelector('#asst-model').value.trim()],
        ['assistant_temperature', parseFloat(container.querySelector('#asst-temp').value) || 0.7],
        ['assistant_max_tokens', parseInt(container.querySelector('#asst-maxtokens').value) || 4096],
      ];
      for (const [k, v] of settings) await App.API.Settings.set(k, v);
      App.UI.Toast.show('设置已保存', 'success');
      App.Router.popPage();
    });

    return { destroy() {} };
  }
};
