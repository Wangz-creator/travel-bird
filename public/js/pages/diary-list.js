App.Pages.diaryList = {
  render(container) {
    container.innerHTML = `
      <div class="diary-list-page">
        <div class="page-header">
          <button class="back-btn" id="dl-back">←</button>
          <span class="title">我的日记</span>
        </div>
        <div class="diary-list-content" id="dl-content"></div>
      </div>
    `;
    container.querySelector('#dl-back').addEventListener('click', () => App.Router.popPage());
    const listEl = container.querySelector('#dl-content');
    this._renderList(listEl);
    const unsub = App.State.on('diariesChanged', () => this._renderList(listEl));
    return { destroy() { unsub(); } };
  },

  async _renderList(listEl) {
    listEl.innerHTML = '';
    const diaries = await App.API.Diaries.queryAll();
    if (!diaries.length) {
      listEl.innerHTML = '<div class="diary-empty">📔<br>还没有日记</div>';
      return;
    }
    diaries.forEach(d => {
      const item = document.createElement('div');
      item.className = 'diary-item';
      const preview = (App.AI.DiaryMedia.toPlainText(d.content || '').slice(0, 80).replace(/\n/g, ' ') || '图片日记');
      item.innerHTML = `
        <div class="diary-item-title">${this._escapeHtml(d.title || '无题')}</div>
        <div class="diary-item-date">${new Date(d.created_at).toLocaleDateString('zh-CN')}</div>
        <div class="diary-item-preview">${this._escapeHtml(preview)}...</div>
      `;
      item.addEventListener('click', () => App.Router.pushPage('diaryDetail', { diaryId: d.diary_id }));
      listEl.appendChild(item);
    });
  },

  _escapeHtml(str) {
    return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
};
