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
      // 用 touchend 代替 click 减少移动端延迟，避免 active 样式闪烁
      let touchMoved = false;
      tab.addEventListener('touchstart', () => { touchMoved = false; }, { passive: true });
      tab.addEventListener('touchmove', () => { touchMoved = true; }, { passive: true });
      tab.addEventListener('touchend', (e) => {
        if (touchMoved) return;
        e.preventDefault(); // 阻止后续 click 事件
        this.switchTab(tab.dataset.tab);
      });
      // 保留 click 作为 PC/无障碍降级
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

    // 先移除所有 active，再添加目标 active（确保移动端浏览器正确重绘）
    const tabBar = document.getElementById('tab-bar');
    if (tabBar) {
      const tabs = tabBar.querySelectorAll('.tab-item');
      tabs.forEach(tab => tab.classList.remove('active'));
      // 强制浏览器重排，确保移除生效
      void tabBar.offsetHeight;
      tabs.forEach(tab => {
        if (tab.dataset.tab === tabName) tab.classList.add('active');
      });
    }

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
