App.Router = {
  _container: null,
  _tabView: null,
  _pageStack: [],   // [{pageName, overlay, view}]

  _tabIcon(name) {
    const imgMap = { home: '/img/tab-home.png', timeline: '/img/tab-timeline.png', profile: '/img/tab-mine.png' };
    if (imgMap[name]) {
      return `<img src="${imgMap[name]}" alt="${name}" class="tab-icon-img">`;
    }
    return App.UI.Icons.render(name, 'tab-icon-svg', { size: 22, strokeWidth: 1.9 });
  },

  init() {
    this._container = document.getElementById('app');
    this._container.innerHTML = `
      <div id="view-container"></div>
      <div id="tab-bar">
        <div class="tab-item active" data-tab="home">
          <span class="tab-icon">${this._tabIcon('home')}</span>
          <span class="tab-label">首页</span>
        </div>
        <div class="tab-item" data-tab="timeline">
          <span class="tab-icon">${this._tabIcon('timeline')}</span>
          <span class="tab-label">时间轴</span>
        </div>
        <div class="tab-item" data-tab="profile">
          <span class="tab-icon">${this._tabIcon('profile')}</span>
          <span class="tab-label">我的</span>
        </div>
      </div>
    `;

    this._container.querySelectorAll('.tab-item').forEach(tab => {
      tab.addEventListener('click', () => {
        this.switchTab(tab.dataset.tab);
      });
    });
  },

  switchTab(tabName) {
    this._pageStack.forEach(item => {
      item.view?.destroy?.();
      item.overlay?.remove();
    });
    this._pageStack = [];

    if (this._tabView?.destroy) this._tabView.destroy();
    App.State.set('currentTab', tabName);
    App.State.set('currentPage', null);

    this._container.querySelectorAll('.tab-item').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.tab === tabName);
    });

    const viewContainer = document.getElementById('view-container');
    viewContainer.innerHTML = '';
    this._tabView = App.Pages[tabName].render(viewContainer);
  },

  pushPage(pageName, props) {
    const overlay = document.createElement('div');
    overlay.className = 'page-overlay';
    overlay.id = `page-overlay-${Date.now()}`;
    document.getElementById('app').appendChild(overlay);
    const view = App.Pages[pageName].render(overlay, props);
    this._pageStack.push({ pageName, overlay, view });
    App.State.set('currentPage', pageName);
  },

  popPage() {
    const item = this._pageStack.pop();
    if (!item) return;
    item.view?.destroy?.();
    item.overlay?.remove();
    const top = this._pageStack[this._pageStack.length - 1];
    App.State.set('currentPage', top?.pageName || null);
  }
};
