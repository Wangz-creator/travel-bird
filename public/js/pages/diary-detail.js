App.Pages.diaryDetail = {
  render(container, props) {
    this._load(container, props);
    return { destroy() {} };
  },

  async _load(container, props) {
    const diary = await App.API.Diaries.queryOne(props?.diaryId);
    if (!diary) { App.Router.popPage(); return; }
    const diaryId = props?.diaryId ?? diary.diary_id;

    container.innerHTML = `
      <div class="diary-detail-page">
        <div class="page-header">
          <button class="back-btn" id="dd-back">←</button>
          <span class="title">${this._escapeHtml(diary.title || '日记')}</span>
        </div>
        <div class="diary-detail-content">
          <div class="diary-detail-body" id="dd-body"></div>
        </div>
        <div class="diary-detail-actions">
          <button class="copy-btn" id="dd-copy">复制内容</button>
          <button id="dd-save">保存修改</button>
          <button id="dd-delete" style="color:var(--color-error);">删除</button>
        </div>
      </div>
    `;
    const bodyEl = container.querySelector('#dd-body');
    this._renderBody(bodyEl, diary.content || '');

    container.querySelector('#dd-back').addEventListener('click', () => App.Router.popPage());
    container.querySelector('#dd-copy').addEventListener('click', () => {
      App.Utils.copyToClipboard(this._serializePlainText(bodyEl));
    });
    container.querySelector('#dd-save').addEventListener('click', async () => {
      const newContent = this._serializeBody(bodyEl);
      await App.API.Diaries.update(diaryId, { content: newContent });
      App.UI.Toast.show('已保存', 'success');
    });
    container.querySelector('#dd-delete').addEventListener('click', async () => {
      const ok = await App.UI.Modal.confirm('删除日记', '确定要删除这篇日记吗？');
      if (!ok) return;
      let result;
      try {
        result = await App.API.Diaries.delete(diaryId);
      } catch (e) {
        App.UI.Toast.show('网络错误，请重试', 'error');
        return;
      }
      if (result.ok) {
        App.State.set('diariesChanged', Date.now());
        App.Router.popPage();
        App.UI.Toast.show('已删除', 'success');
      } else if (result.code === 'route_missing') {
        App.UI.Toast.show('后端未加载删除接口：请在终端 Ctrl+C 停掉旧服务后，在项目目录执行 npm run dev', 'error');
      } else if (result.code === 'bad_id') {
        App.UI.Toast.show('无法识别日记，请返回列表重试', 'error');
      } else {
        App.UI.Toast.show('删除失败，该篇可能已被删除', 'error');
      }
    });
  },

  _renderBody(bodyEl, content) {
    const blocks = App.AI.DiaryMedia.parseContent(content);
    bodyEl.innerHTML = blocks.map((block) => {
      if (block.type === 'image') {
        return `
          <figure class="diary-detail-image-block" data-block-kind="image" data-filename="${this._escapeAttr(block.filename)}">
            <img data-photo="${this._escapeAttr(block.filename)}" alt="日记插图">
          </figure>
        `;
      }
      return `
        <div class="diary-detail-text-block" data-block-kind="text" contenteditable="true" spellcheck="false">${this._escapeHtml(block.text || '')}</div>
      `;
    }).join('');
    if (!bodyEl.children.length) {
      bodyEl.innerHTML = '<div class="diary-detail-text-block" data-block-kind="text" contenteditable="true" spellcheck="false"></div>';
    }
    if (bodyEl.lastElementChild?.dataset.blockKind !== 'text') {
      bodyEl.insertAdjacentHTML('beforeend', '<div class="diary-detail-text-block" data-block-kind="text" contenteditable="true" spellcheck="false"></div>');
    }
    bodyEl.querySelectorAll('img[data-photo]').forEach((img) => {
      const filename = img.dataset.photo;
      if (filename) img.src = App.API.FileStore.getObjectURL(filename);
    });
  },

  _serializeBody(bodyEl) {
    const parts = [];
    Array.from(bodyEl.children).forEach((node) => {
      const kind = node.dataset.blockKind;
      if (kind === 'image') {
        const filename = String(node.dataset.filename || '').trim();
        if (filename) parts.push(App.AI.DiaryMedia.markerFor(filename));
        return;
      }
      const text = this._normalizeEditableText(node.innerText || node.textContent || '');
      if (text) parts.push(text);
    });
    return parts.join('\n\n').trim();
  },

  _serializePlainText(bodyEl) {
    return Array.from(bodyEl.children)
      .filter((node) => node.dataset.blockKind === 'text')
      .map((node) => this._normalizeEditableText(node.innerText || node.textContent || ''))
      .filter(Boolean)
      .join('\n\n')
      .trim();
  },

  _normalizeEditableText(text) {
    return String(text || '')
      .replace(/\u00a0/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  },

  _escapeHtml(str) {
    return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  },

  _escapeAttr(str) {
    return this._escapeHtml(str).replace(/"/g, '&quot;');
  }
};
