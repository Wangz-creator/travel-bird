App.Pages.result = {
  _unsubscribe: null,

  render(container, props) {
    container.innerHTML = `
      <div class="result-page" id="result-page-root">
        <div class="page-header">
          <button class="back-btn" id="result-back">←</button>
          <span class="title">生成结果</span>
          <button class="header-action" id="result-copy" style="color:var(--color-primary);font-size:14px;">复制</button>
        </div>
        <div class="result-content-area">
          <div class="result-editable" id="result-content" contenteditable="true"></div>
        </div>
        <div class="result-action-bar">
          <button class="result-action-btn" id="result-optimize">🤖 AI优化</button>
          <button class="result-action-btn" id="result-undo" disabled>↩ 撤销优化</button>
          <button class="result-action-btn primary" id="result-regenerate">重新生成</button>
        </div>
      </div>
    `;

    const contentEl = container.querySelector('#result-content');
    const pageRoot = container.querySelector('#result-page-root');
    const undoBtn = container.querySelector('#result-undo');

    container.querySelector('#result-back').addEventListener('click', () => App.Router.popPage());
    container.querySelector('#result-copy').addEventListener('click', () => {
      App.Utils.copyToClipboard(contentEl.innerText || contentEl.textContent);
    });

    container.querySelector('#result-optimize').addEventListener('click', () => {
      const overlay = document.createElement('div');
      overlay.className = 'optimize-input-overlay';
      overlay.innerHTML = `
        <div class="optimize-input-box">
          <div style="font-size:15px;font-weight:600;margin-bottom:4px;">输入优化指令</div>
          <textarea placeholder="例如：语气更活泼一些、压缩到200字以内、加一个旅行金句..."></textarea>
          <div class="optimize-input-actions">
            <button class="cancel-btn">取消</button>
            <button class="confirm-btn">开始优化</button>
          </div>
        </div>
      `;
      overlay.querySelector('.cancel-btn').onclick = () => overlay.remove();
      overlay.querySelector('.confirm-btn').onclick = async () => {
        const instruction = overlay.querySelector('textarea').value.trim();
        if (!instruction) return;
        overlay.remove();
        await App.AI.Assistant.optimizeContent(instruction);
      };
      document.body.appendChild(overlay);
      overlay.querySelector('textarea').focus();
    });

    undoBtn.addEventListener('click', () => App.AI.Assistant.undoOptimize());

    container.querySelector('#result-regenerate').addEventListener('click', () => {
      App.Router.popPage();
      App.Router.pushPage('assistant', { records: App.AI.Assistant._selectedRecords });
      setTimeout(() => App.AI.Assistant.enterPlatformSelection(), 100);
    });

    const unsubContent = App.State.on('generatedContent', (data) => {
      if (!data) return;
      contentEl.textContent = data.content;
      pageRoot.classList.toggle('result-streaming', data.isStreaming);
    });
    const unsubStack = App.State.on('contentVersionStack', (stack) => {
      undoBtn.disabled = !stack || stack.length <= 1;
    });
    this._unsubscribe = () => { unsubContent(); unsubStack(); };

    const existing = App.State.get('generatedContent');
    if (existing) contentEl.textContent = existing.content;

    return { destroy: () => { if (this._unsubscribe) this._unsubscribe(); } };
  }
};
