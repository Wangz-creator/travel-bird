async function doInit() {
  document.getElementById('app').innerHTML = `
    <div class="loading-screen">
      <div class="loading-video-wrap">
        <video class="loading-video" autoplay loop muted playsinline>
          <source src="/img/pigeon-flap.mp4" type="video/mp4">
        </video>
      </div>
      <div class="text">旅行的鸽子 · 正在起飞...</div>
    </div>
  `;

  // 从服务端加载设置缓存，供同步 Settings.get() 使用
  await App.API.init();

  // 同步 isFirstVisit 状态：如果用户已完成引导，不再弹出 onboarding
  const savedFirstVisit = App.API.Settings.get('is_first_visit');
  if (savedFirstVisit === false) {
    App.State.set('isFirstVisit', false);
  }

  // 初始化路由和渲染
  App.Router.init();
  App.Router.switchTab('home');

  // 在页面渲染完成后，显示权限引导弹窗（不阻塞首屏）
  setTimeout(async () => {
    try {
      const needsGuide = await App.Permissions.needsGuide();
      if (needsGuide) {
        await App.Permissions.showGuide();
      }
    } catch (e) {
      console.warn('权限引导模块异常:', e.message);
    }
  }, 800);
}

doInit().catch(e => {
  console.error('启动失败:', e);
  document.getElementById('app').innerHTML = `
    <div class="error-screen">
      <h2>启动失败</h2>
      <p>${e.message}</p>
      <button onclick="location.reload()">重试</button>
    </div>
  `;
});
