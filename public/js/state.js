App.State = {
  _data: {
    currentTab: 'home',
    currentPage: null,
    isFirstVisit: true,
    assistantMessages: [],
    assistantPhase: 'idle',
    generatedContent: null,
    contentVersionStack: [],
  },
  _listeners: {},

  get(key) { return this._data[key]; },

  set(key, value) {
    this._data[key] = value;
    (this._listeners[key] || []).forEach(fn => fn(value));
  },

  on(key, fn) {
    if (!this._listeners[key]) this._listeners[key] = [];
    this._listeners[key].push(fn);
    return () => {
      this._listeners[key] = this._listeners[key].filter(f => f !== fn);
    };
  }
};
