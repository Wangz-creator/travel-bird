App.Pages.promptEdit = {
  render(container, props) {
    this._load(container, props);
    return { destroy() {} };
  },

  async _load(container, props) {
    const { promptKey, promptName } = props || {};
    const savedContent = await App.API.Prompts.get(promptKey);
    const currentContent = savedContent || App.AI.DefaultPrompts[promptKey] || '';

    container.innerHTML = `
      <div class="prompt-edit-page">
        <div class="page-header">
          <button class="back-btn" id="pe-back">←</button>
          <span class="title">${promptName || promptKey}</span>
        </div>
        <div class="prompt-edit-content">
          <textarea class="prompt-edit-textarea" id="pe-content">${this._escapeHtml(currentContent)}</textarea>
        </div>
        <div class="prompt-edit-actions">
          <button class="reset-btn" id="pe-reset">恢复默认</button>
          <button class="save-btn" id="pe-save">保存</button>
        </div>
      </div>
    `;

    container.querySelector('#pe-back').addEventListener('click', () => App.Router.popPage());
    container.querySelector('#pe-save').addEventListener('click', async () => {
      const content = container.querySelector('#pe-content').value;
      await App.API.Prompts.set(promptKey, content);
      App.UI.Toast.show('Prompt 已保存', 'success');
      App.Router.popPage();
    });
    container.querySelector('#pe-reset').addEventListener('click', async () => {
      const ok = await App.UI.Modal.confirm('恢复默认', '将丢失自定义修改，确认恢复？');
      if (ok) {
        await App.API.Prompts.reset(promptKey);
        container.querySelector('#pe-content').value = App.AI.DefaultPrompts[promptKey] || '';
        App.UI.Toast.show('已恢复默认', 'success');
      }
    });
  },

  _escapeHtml(str) {
    return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
};
