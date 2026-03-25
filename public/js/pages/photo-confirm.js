App.Pages.photoConfirm = {
  render(container, props) {
    const records = props?.records || [];
    const photoRecords = records.filter(r => r.type === 'photo');
    const selectedSet = new Set(photoRecords.map(r => r.record_id));

    container.innerHTML = `
      <div class="photo-confirm-page">
        <div class="page-header">
          <button class="back-btn" id="pc-back">←</button>
          <span class="title">选择照片</span>
        </div>
        <div class="photo-confirm-grid" id="pc-grid"></div>
        <div class="photo-confirm-bottom">
          <span class="info" id="pc-info">已选 ${selectedSet.size} 张</span>
          <button id="pc-confirm">确认</button>
        </div>
      </div>
    `;

    container.querySelector('#pc-back').addEventListener('click', () => App.Router.popPage());

    const grid = container.querySelector('#pc-grid');
    photoRecords.forEach(r => {
      const item = document.createElement('div');
      item.className = 'photo-confirm-item selected';
      item.dataset.rid = r.record_id;
      item.innerHTML = `<img src="${App.API.FileStore.getObjectURL(r.media_filename)}" alt=""><div class="check">✓</div>`;
      item.addEventListener('click', () => {
        if (selectedSet.has(r.record_id)) { selectedSet.delete(r.record_id); item.classList.remove('selected'); }
        else { selectedSet.add(r.record_id); item.classList.add('selected'); }
        container.querySelector('#pc-info').textContent = `已选 ${selectedSet.size} 张`;
      });
      grid.appendChild(item);
    });

    container.querySelector('#pc-confirm').addEventListener('click', () => {
      const nonPhotos = records.filter(r => r.type !== 'photo');
      const selectedPhotos = photoRecords.filter(r => selectedSet.has(r.record_id));
      App.Router.popPage();
      App.Router.pushPage('assistant', { records: [...nonPhotos, ...selectedPhotos] });
    });

    return { destroy() {} };
  }
};
